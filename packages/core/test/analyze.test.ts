import { describe, expect, it } from 'vitest';
import { binToHex, encodeTransactionBCH, hashTransactionUiOrder, hexToBin } from '@bitauth/libauth';
import { analyzeTransaction } from '../src/analyze.js';
import type { ChainSource } from '../src/types.js';

const P2PKH = Uint8Array.from([0x76, 0xa9, 0x14, ...new Array(20).fill(7), 0x88, 0xac]);
const P2SH = Uint8Array.from([0xa9, 0x14, ...new Array(20).fill(9), 0x87]);
const unlock = (ht: number) =>
  Uint8Array.from([65, ...new Array(64).fill(1), ht, 33, 0x02, ...new Array(32).fill(3)]);

interface Fake { hex: string; txid: string; height: number }
function tx(inputs: { prev: Fake; vout?: number; ht?: number; unlocking?: Uint8Array }[], outs: Uint8Array[], salt = 0): Fake {
  const bin = encodeTransactionBCH({
    version: 2,
    locktime: salt,
    inputs: inputs.map((i) => ({
      outpointTransactionHash: hexToBin(i.prev.txid),
      outpointIndex: i.vout ?? 0,
      sequenceNumber: 0,
      unlockingBytecode: i.unlocking ?? unlock(i.ht ?? 0x41),
    })),
    outputs: outs.map((lockingBytecode) => ({ lockingBytecode, valueSatoshis: 10_000n })),
  });
  return { hex: binToHex(bin), txid: binToHex(hashTransactionUiOrder(bin)), height: 0 };
}
const coinbaseLike = (lock: Uint8Array, salt: number): Fake => ({
  ...tx([{ prev: { txid: '00'.repeat(32), hex: '', height: 1 }, unlocking: Uint8Array.of(0x51) }], [lock], salt),
  height: 100,
});

function source(all: Fake[], opts: { dsproof?: string[]; missingOn?: string[] } = {}): ChainSource {
  const byId = new Map(all.map((t) => [t.txid, t]));
  const hosts = ['a', 'b', 'c'];
  const answer = (host: string, method: string, params: unknown[]) => {
    const id = params[0] as string;
    const t = byId.get(id);
    switch (method) {
      case 'blockchain.transaction.get':
        if (!t || (opts.missingOn?.includes(host) && t.height === 0)) throw new Error('No such mempool or blockchain transaction');
        return t.hex;
      case 'blockchain.transaction.get_confirmed_blockhash':
        if (!t) throw new Error('No such transaction');
        if (t.height === 0) throw new Error('Transaction is in the mempool');
        return { block_height: t.height, block_hash: '00' };
      case 'blockchain.transaction.dsproof.get':
        return opts.dsproof?.includes(id) ? { dspid: 'ff', txid: id } : null;
      case 'blockchain.headers.get_tip':
        return { height: 105 };
    }
    throw new Error(`unexpected ${method}`);
  };
  return {
    hosts: () => hosts,
    async request(method, ...params) { return answer('a', method, params) as any; },
    async requestAll(method, ...params) {
      return hosts.map((host) => {
        try { return { host, result: answer(host, method, params) as any }; }
        catch (e) { return { host, error: (e as Error).message }; }
      });
    },
  };
}

describe('analyzeTransaction', () => {
  const fund = coinbaseLike(P2PKH, 1);
  const contract = coinbaseLike(P2SH, 2);

  it('plain P2PKH payment from confirmed coins: received, score 1', async () => {
    const pay = tx([{ prev: fund }], [P2PKH]);
    const r = await analyzeTransaction(source([fund, pay]), pay.txid);
    expect(r).toMatchObject({ state: 'received', score: 1, reasons: [] });
  });

  it('WizardConnect-style SIGHASH_UTXOS payment: pending, score 0', async () => {
    const pay = tx([{ prev: fund, ht: 0x61 }], [P2PKH]);
    const r = await analyzeTransaction(source([fund, pay]), pay.txid);
    expect(r.state).toBe('pending');
    expect(r.score).toBe(0);
    expect(r.reasons[0]?.code).toBe('sighash-utxos');
  });

  it('payment funded by an unconfirmed contract spend (e.g. a fresh swap): pending', async () => {
    const swap = tx([{ prev: contract }], [P2PKH], 3);
    const pay = tx([{ prev: swap }], [P2PKH], 4);
    const r = await analyzeTransaction(source([contract, swap, pay]), pay.txid);
    expect(r.state).toBe('pending');
    expect(r.reasons).toEqual([expect.objectContaining({ code: 'not-p2pkh', txid: swap.txid })]);
    expect(r.ancestors.map((a) => a.txid)).toEqual([pay.txid, swap.txid]);
  });

  it('existing double-spend proof on an ancestor: pending', async () => {
    const mid = tx([{ prev: fund }], [P2PKH], 5);
    const pay = tx([{ prev: mid }], [P2PKH], 6);
    const r = await analyzeTransaction(source([fund, mid, pay], { dsproof: [mid.txid] }), pay.txid);
    expect(r.state).toBe('pending');
    expect(r.reasons.some((x) => x.code === 'dsproof' && x.txid === mid.txid)).toBe(true);
  });

  it('servers disagree about the mempool: pending', async () => {
    const pay = tx([{ prev: fund }], [P2PKH], 7);
    const r = await analyzeTransaction(source([fund, pay], { missingOn: ['c'] }), pay.txid);
    expect(r.state).toBe('pending');
    expect(r.reasons.some((x) => x.code === 'servers-disagree')).toBe(true);
  });

  it('confirmed tx: confirmed / settled by depth', async () => {
    const r = await analyzeTransaction(source([fund]), fund.txid);
    expect(r).toMatchObject({ state: 'confirmed', confirmations: 6 });
  });

  it('unknown tx: unknown', async () => {
    const r = await analyzeTransaction(source([]), 'ab'.repeat(32));
    expect(r.state).toBe('unknown');
  });
});
