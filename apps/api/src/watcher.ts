import { randomUUID } from 'node:crypto';
import type { FulcrumPool, SettlementReport } from 'settled-core';

interface Watch { id: string; address: string; webhook: string; states: Map<string, string> }

/** Address watches: on any change, analyse mempool/recent txs and POST state changes to the webhook. */
export class Watcher {
  private watches = new Map<string, Watch>();
  private byAddress = new Map<string, Set<string>>();

  constructor(private pool: FulcrumPool, private report: (txid: string) => Promise<SettlementReport>) {
    for (const host of pool.hosts().slice(0, 1)) {
      pool.client(host)?.on('notification', (n: { method: string; params: unknown[] }) => {
        if (n.method === 'blockchain.address.subscribe') this.onAddress(String(n.params[0])).catch(() => {});
        if (n.method === 'blockchain.headers.subscribe') this.recheckAll().catch(() => {});
      });
      pool.client(host)?.subscribe('blockchain.headers.subscribe').catch(() => {});
    }
    setInterval(() => this.recheckAll().catch(() => {}), 30_000);
  }

  async add(address: string, webhook: string): Promise<string> {
    if (this.watches.size >= 200) throw new Error('watch limit reached');
    const id = randomUUID();
    this.watches.set(id, { id, address, webhook, states: new Map() });
    if (!this.byAddress.has(address)) {
      this.byAddress.set(address, new Set());
      const host = this.pool.hosts()[0]!;
      await this.pool.client(host)!.subscribe('blockchain.address.subscribe', address);
    }
    this.byAddress.get(address)!.add(id);
    return id;
  }

  private async onAddress(address: string) {
    const mempool = await this.pool.request<{ tx_hash: string }[]>('blockchain.address.get_mempool', address);
    for (const id of this.byAddress.get(address) ?? []) {
      const w = this.watches.get(id);
      if (!w) continue;
      for (const m of mempool) if (!w.states.has(m.tx_hash)) w.states.set(m.tx_hash, '');
      await this.checkWatch(w);
    }
  }

  private async recheckAll() {
    for (const w of this.watches.values()) await this.checkWatch(w);
  }

  private async checkWatch(w: Watch) {
    for (const [txid, prev] of w.states) {
      if (prev === 'settled') continue;
      const r = await this.report(txid);
      if (r.state !== prev) {
        w.states.set(txid, r.state);
        await fetch(w.webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-settled-watch': w.id },
          body: JSON.stringify({ watch: w.id, address: w.address, report: r }),
        }).catch(() => {});
      }
    }
  }
}
