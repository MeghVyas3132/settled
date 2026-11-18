import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeTransaction } from '../src/analyze.js';
import type { ChainSource } from '../src/types.js';

/** Real mainnet transactions recorded with their unconfirmed ancestry (see scripts/record-fixture.mjs). */
const dir = new URL('./fixtures/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

function fixtureSource(f: { txs: Record<string, string>; heights: Record<string, number> }): ChainSource {
  const answer = (method: string, params: unknown[]) => {
    const id = params[0] as string;
    if (method === 'blockchain.transaction.get') {
      if (!f.txs[id]) throw new Error('No such mempool or blockchain transaction');
      return f.txs[id];
    }
    if (method === 'blockchain.transaction.get_confirmed_blockhash') {
      const h = f.heights[id] ?? 1; // parents outside the recorded set were confirmed
      if (h === 0) throw new Error('in mempool');
      return { block_height: h };
    }
    if (method === 'blockchain.transaction.dsproof.get') return null;
    if (method === 'blockchain.headers.get_tip') return { height: 999999 };
    throw new Error(method);
  };
  return {
    hosts: () => ['fixture'],
    async request(m, ...p) { return answer(m, p) as any; },
    async requestAll(m, ...p) { try { return [{ host: 'fixture', result: answer(m, p) as any }]; } catch (e) { return [{ host: 'fixture', error: (e as Error).message }]; } },
  };
}

describe.skipIf(!files.length)('recorded mainnet fixtures', () => {
  for (const file of files) {
    it(file, async () => {
      const f = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
      const r = await analyzeTransaction(fixtureSource(f), f.txid, { crossCheck: false });
      expect(r.state).toBe(f.expected.state);
      expect(r.score).toBe(f.expected.score);
      expect([...new Set(r.reasons.map((x) => x.code))].sort()).toEqual(f.expected.codes);
    });
  }
});
