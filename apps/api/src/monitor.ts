import { p2pkhSighash, analyzeTransaction, SIGHASH, type FulcrumPool, type TxCache } from 'settled-core';

/** Per-block classification from unlocking scripts (no prevout lookups, so it is fast). */
export interface BlockStats {
  height: number;
  txs: number;
  coverable: number; // every input P2PKH + ALL|FORKID
  nonP2pkh: number; // at least one input is a contract / non-P2PKH
  utxos: number; // P2PKH only, but at least one SIGHASH_UTXOS signature
  weak: number; // ANYONECANPAY / not ALL
}

function varint(b: Uint8Array, i: number): [number, number] {
  const v = b[i]!;
  if (v < 0xfd) return [v, i + 1];
  if (v === 0xfd) return [b[i + 1]! | (b[i + 2]! << 8), i + 3];
  if (v === 0xfe) return [(b[i + 1]! | (b[i + 2]! << 8) | (b[i + 3]! << 16)) + b[i + 4]! * 2 ** 24, i + 5];
  let n = 0;
  for (let k = 8; k >= 1; k--) n = n * 256 + b[i + k]!;
  return [n, i + 9];
}

export function classifyBlock(raw: Uint8Array, height: number): BlockStats {
  const s: BlockStats = { height, txs: 0, coverable: 0, nonP2pkh: 0, utxos: 0, weak: 0 };
  let [count, i] = varint(raw, 80);
  for (let t = 0; t < count; t++) {
    i += 4;
    let nIn: number;
    [nIn, i] = varint(raw, i);
    let kind: 'ok' | 'contract' | 'utxos' | 'weak' = 'ok';
    for (let k = 0; k < nIn; k++) {
      i += 36;
      let len: number;
      [len, i] = varint(raw, i);
      const ss = raw.subarray(i, i + len);
      i += len + 4;
      if (t === 0) continue;
      const ht = p2pkhSighash(ss);
      if (ht === undefined) kind = 'contract';
      else if (kind !== 'contract') {
        if (ht & SIGHASH.UTXOS) kind = 'utxos';
        else if ((ht & SIGHASH.ANYONECANPAY || (ht & 0x1f) !== 1) && kind === 'ok') kind = 'weak';
      }
    }
    let nOut: number;
    [nOut, i] = varint(raw, i);
    for (let k = 0; k < nOut; k++) {
      i += 8;
      let len: number;
      [len, i] = varint(raw, i);
      i += len;
    }
    i += 4;
    if (t === 0) continue;
    s.txs++;
    if (kind === 'ok') s.coverable++;
    else if (kind === 'contract') s.nonP2pkh++;
    else if (kind === 'utxos') s.utxos++;
    else s.weak++;
  }
  return s;
}

const BLOCKCHAIR = 'https://api.blockchair.com/bitcoin-cash';

/**
 * Samples the network: recent blocks (from Blockchair raw blocks) and the live mempool
 * (sampled txids analysed with settled-core, including unconfirmed ancestry).
 */
export class Monitor {
  blocks: BlockStats[] = [];
  mempool = { sampled: 0, received: 0, pending: 0, reasons: {} as Record<string, number>, at: '' };
  dsproofs = { active: 0, at: '' };
  updatedAt = '';
  private timers: NodeJS.Timeout[] = [];

  constructor(private pool: FulcrumPool, private cache: TxCache, private backfill = Number(process.env.MONITOR_BACKFILL ?? 24)) {}

  start() {
    this.tickBlocks().catch((e) => console.error('blocks', e.message));
    this.tickMempool().catch((e) => console.error('mempool', e.message));
    this.timers.push(setInterval(() => this.tickBlocks().catch((e) => console.error('blocks', e.message)), 120_000));
    this.timers.push(setInterval(() => this.tickMempool().catch((e) => console.error('mempool', e.message)), 90_000));
  }

  private async fetchJson(url: string) {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json() as Promise<any>;
  }

  async tickBlocks() {
    const tip = await this.pool.request<{ height: number }>('blockchain.headers.get_tip');
    const have = new Set(this.blocks.map((b) => b.height));
    const want: number[] = [];
    for (let h = tip.height; h > tip.height - this.backfill; h--) if (!have.has(h)) want.push(h);
    for (const h of want.slice(0, 6)) {
      const d = await this.fetchJson(`${BLOCKCHAIR}/raw/block/${h}`);
      const rec = Object.values(d.data ?? {})[0] as { raw_block?: string } | undefined;
      if (!rec?.raw_block) continue;
      this.blocks.push(classifyBlock(Uint8Array.from(Buffer.from(rec.raw_block, 'hex')), h));
      await new Promise((r) => setTimeout(r, 2500));
    }
    this.blocks.sort((a, b) => b.height - a.height);
    this.blocks = this.blocks.slice(0, this.backfill);
    this.updatedAt = new Date().toISOString();
  }

  async tickMempool() {
    const d = await this.fetchJson(`${BLOCKCHAIR}/mempool/transactions?limit=40&s=time(desc)`);
    const txids: string[] = (d.data ?? []).map((t: any) => t.hash);
    const out = { sampled: 0, received: 0, pending: 0, reasons: {} as Record<string, number>, at: new Date().toISOString() };
    for (const txid of txids) {
      try {
        const r = await analyzeTransaction(this.pool, txid, { crossCheck: false, maxAncestors: 50 }, this.cache);
        if (r.state === 'confirmed' || r.state === 'settled' || r.state === 'unknown') continue;
        out.sampled++;
        if (r.state === 'received') out.received++;
        else out.pending++;
        for (const code of new Set(r.reasons.map((x) => x.code))) out.reasons[code] = (out.reasons[code] ?? 0) + 1;
      } catch {
        /* skip */
      }
    }
    this.mempool = out;
    const lists = await this.pool.requestAll<string[]>('blockchain.transaction.dsproof.list');
    this.dsproofs = { active: Math.max(0, ...lists.map((l) => l.result?.length ?? 0)), at: out.at };
    this.updatedAt = out.at;
  }

  summary() {
    const tot = this.blocks.reduce(
      (a, b) => ({ txs: a.txs + b.txs, coverable: a.coverable + b.coverable, nonP2pkh: a.nonP2pkh + b.nonP2pkh, utxos: a.utxos + b.utxos, weak: a.weak + b.weak }),
      { txs: 0, coverable: 0, nonP2pkh: 0, utxos: 0, weak: 0 },
    );
    const pct = (n: number) => (tot.txs ? Math.round((1000 * n) / tot.txs) / 10 : 0);
    return {
      updatedAt: this.updatedAt,
      blocks: {
        count: this.blocks.length,
        from: this.blocks.at(-1)?.height,
        to: this.blocks[0]?.height,
        ...tot,
        pct: { coverable: pct(tot.coverable), nonP2pkh: pct(tot.nonP2pkh), utxos: pct(tot.utxos), weak: pct(tot.weak) },
        recent: this.blocks.slice(0, 12),
      },
      mempool: this.mempool,
      dsproofs: this.dsproofs,
      method: 'Blocks: every input of every non-coinbase tx classified from its unlocking script (P2PKH shape + sighash byte). Mempool: latest txs analysed with settled-core incl. unconfirmed ancestors.',
    };
  }
}
