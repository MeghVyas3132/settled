import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { FulcrumPool, TxCache, analyzeTransaction, type SettlementReport } from 'settled-core';
import { Monitor } from './monitor.js';
import { Watcher } from './watcher.js';

const PORT = Number(process.env.PORT ?? 8787);
const pool = new FulcrumPool({ application: 'settled-api' });
const cache = new TxCache();
const recent = new Map<string, { at: number; report: SettlementReport }>();
const TXID = /^[0-9a-f]{64}$/i;

async function report(txid: string, maxAgeMs = 2500): Promise<SettlementReport> {
  const hit = recent.get(txid);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.report;
  const r = await analyzeTransaction(pool, txid, {}, cache);
  recent.set(txid, { at: Date.now(), report: r });
  if (recent.size > 5000) recent.delete(recent.keys().next().value!);
  return r;
}

const app = new Hono();
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true, servers: pool.hosts(), monitor: monitor.summary().updatedAt }));

/** Settlement state of one transaction (CHIP-2025-11). */
app.get('/v1/tx/:txid', async (c) => {
  const txid = c.req.param('txid');
  if (!TXID.test(txid)) return c.json({ error: 'bad txid' }, 400);
  try {
    return c.json(await report(txid));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** Live updates for one transaction until it is settled (or 30 minutes). */
app.get('/v1/tx/:txid/stream', (c) => {
  const txid = c.req.param('txid');
  if (!TXID.test(txid)) return c.json({ error: 'bad txid' }, 400);
  return streamSSE(c, async (s) => {
    let last = '';
    const end = Date.now() + 30 * 60_000;
    while (Date.now() < end && !s.aborted) {
      try {
        const r = await report(txid, 1500);
        const key = `${r.state}|${r.score}|${r.confirmations}|${r.reasons.length}`;
        if (key !== last) {
          last = key;
          await s.writeSSE({ event: 'report', data: JSON.stringify(r) });
        }
        if (r.state === 'settled') break;
      } catch (e) {
        await s.writeSSE({ event: 'error', data: (e as Error).message });
      }
      // Keep-alive so proxies (Cloudflare cuts idle streams at 100 s) do not drop the stream.
      await s.writeSSE({ event: 'ping', data: '' });
      await s.sleep(3000);
    }
  });
});

/** Recent payments to an address with their settlement states (merchant view). */
app.get('/v1/address/:address', async (c) => {
  const address = c.req.param('address');
  try {
    const history = await pool.request<{ tx_hash: string; height: number }[]>('blockchain.address.get_history', address);
    const mempool = await pool.request<{ tx_hash: string; height: number }[]>('blockchain.address.get_mempool', address);
    const latest = [...mempool, ...history.filter((h) => h.height > 0).reverse()].slice(0, 25);
    const seen = new Set<string>();
    const items = [];
    for (const h of latest) {
      if (seen.has(h.tx_hash)) continue;
      seen.add(h.tx_hash);
      items.push(await report(h.tx_hash, 5000));
    }
    return c.json({ address, payments: items });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/**
 * Spendable coins for a set of addresses, each tagged with whether spending it now is safe:
 * confirmed coins are always fine; unconfirmed coins inherit the state of their funding tx.
 */
app.get('/v1/coins', async (c) => {
  const addresses = (c.req.query('addresses') ?? '').split(',').filter(Boolean).slice(0, 60);
  if (!addresses.length) return c.json({ error: 'addresses required' }, 400);
  try {
    const coins = [];
    for (const address of addresses) {
      const utxos = await pool.request<{ tx_hash: string; tx_pos: number; height: number; value: number; token_data?: unknown }[]>(
        'blockchain.address.listunspent', address, 'include_tokens');
      for (const u of utxos.slice(0, 60)) {
        // Light check for coin selection: single server, short ancestry walk.
        const funding = u.height > 0 ? undefined
          : await analyzeTransaction(pool, u.tx_hash, { crossCheck: false, maxAncestors: 30 }, cache).catch(() => undefined);
        coins.push({
          address, txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height, hasToken: !!u.token_data,
          safe: u.height > 0 || funding?.state === 'received',
          fundingState: funding?.state ?? 'confirmed',
          reasons: funding?.reasons.map((r) => r.code) ?? [],
        });
      }
    }
    return c.json({ coins });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** Broadcast a signed transaction through the pool. */
app.post('/v1/broadcast', async (c) => {
  const { hex } = (await c.req.json().catch(() => ({}))) as { hex?: string };
  if (!hex || !/^[0-9a-f]+$/i.test(hex) || hex.length > 200_000) return c.json({ error: 'hex required' }, 400);
  try {
    const txid = await pool.request<string>('blockchain.transaction.broadcast', hex);
    return c.json({ txid });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/** Subscribe an address; we POST a SettlementReport to the webhook on every state change. */
app.post('/v1/watch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { address, webhook } = body as { address?: string; webhook?: string };
  if (!address || !webhook || !/^https:\/\//.test(webhook)) return c.json({ error: 'address and https webhook required' }, 400);
  try {
    const id = await watcher.add(address, webhook);
    return c.json({ id, address, webhook });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

/** Network-wide statistics: how much BCH traffic is zero-conf safe right now. */
app.get('/v1/monitor', (c) => c.json(monitor.summary()));

await pool.connect();
const monitor = new Monitor(pool, cache);
const watcher = new Watcher(pool, (txid) => report(txid, 1000));
monitor.start();
serve({ fetch: app.fetch, port: PORT });
console.log(`settled-api on :${PORT} via ${pool.hosts().join(', ')}`);
