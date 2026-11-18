import { decodeTransactionBCH, hexToBin, binToHex } from '@bitauth/libauth';
import { classifyInput, describeSighash } from './script.js';
import { isNotFound } from './pool.js';
import type { AncestorNode, ChainSource, Reason, ReasonCode, ServerView, SettlementReport, SettlementState } from './types.js';

type DecodedTx = Exclude<ReturnType<typeof decodeTransactionBCH>, string>;

export interface AnalyzeOptions {
  /** Stop walking after this many unconfirmed ancestors (BCHN scores large sets 0.25). Default 1000. */
  maxAncestors?: number;
  /** Ask every server for the tx and for dsproofs (slower, catches mempool disagreement). Default true. */
  crossCheck?: boolean;
}

const MESSAGES: Record<ReasonCode, string> = {
  'not-p2pkh': 'Funded by a smart contract or non-standard output. Double-spend proofs cannot protect it, so it can still be replaced until it is mined.',
  'sighash-utxos': 'Signed with SIGHASH_UTXOS (used by WizardConnect and many token wallets). BCH nodes cannot create double-spend proofs for these signatures, so the network would not warn you if it were double spent.',
  'sighash-anyonecanpay': 'Signed with ANYONECANPAY. Double-spend protection is weak.',
  'sighash-not-all': 'Not signed with SIGHASH_ALL. Double-spend protection is weak.',
  'no-forkid': 'Signature is missing the BCH fork id or is non-canonical.',
  'unparsable-signature': 'The input signature could not be read as a standard P2PKH signature.',
  dsproof: 'A double-spend proof exists: someone tried to spend the same coins twice.',
  'servers-disagree': 'Independent servers do not agree this transaction is in the mempool.',
  'not-found': 'Transaction not found on the network.',
  'ancestor-limit': 'Too many unconfirmed ancestors to check fully.',
};

function reason(code: ReasonCode, txid: string, score: 0 | 0.25, vin?: number, extra?: string): Reason {
  return { code, txid, vin, score, message: extra ? `${MESSAGES[code]} (${extra})` : MESSAGES[code] };
}

/** Caches raw transactions and confirmation heights across analyses. */
export class TxCache {
  raw = new Map<string, DecodedTx>();
  heights = new Map<string, number>();
}

async function getTx(src: ChainSource, cache: TxCache, txid: string): Promise<DecodedTx> {
  const hit = cache.raw.get(txid);
  if (hit) return hit;
  const hex = await src.request<string>('blockchain.transaction.get', txid, false);
  const tx = decodeTransactionBCH(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(`decode ${txid}: ${tx}`);
  cache.raw.set(txid, tx);
  return tx;
}

/** Returns block height, or 0 if in mempool. Confirmed heights are cached; mempool status is re-checked. */
async function getHeight(src: ChainSource, cache: TxCache, txid: string): Promise<number> {
  const h = cache.heights.get(txid);
  if (h && h > 0) return h;
  try {
    const r = await src.request<{ block_height: number }>('blockchain.transaction.get_confirmed_blockhash', txid);
    cache.heights.set(txid, r.block_height);
    return r.block_height;
  } catch (e) {
    // Fulcrum returns an error for mempool transactions; confirm the tx exists at all.
    await getTx(src, cache, txid);
    cache.heights.set(txid, 0);
    return 0;
  }
}

/**
 * Checks whether a BCH payment can be trusted before it is mined (CHIP-2025-11).
 * Walks the transaction and every unconfirmed ancestor, classifies each input the same
 * way BCHN does for double-spend proofs, checks for existing proofs, and compares servers.
 */
export async function analyzeTransaction(
  src: ChainSource,
  txid: string,
  opts: AnalyzeOptions = {},
  cache: TxCache = new TxCache(),
): Promise<SettlementReport> {
  const maxAncestors = opts.maxAncestors ?? 1000;
  const crossCheck = opts.crossCheck ?? true;
  const checkedAt = new Date().toISOString();
  const reasons: Reason[] = [];
  const ancestors: AncestorNode[] = [];
  const servers: ServerView[] = [];

  let height: number;
  try {
    height = await getHeight(src, cache, txid);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    return { txid, state: 'unknown', score: 0, confirmations: 0, reasons: [reason('not-found', txid, 0)], ancestors, servers, checkedAt };
  }

  if (height > 0) {
    const tip = await src.request<{ height: number }>('blockchain.headers.get_tip').catch(() => undefined);
    const confirmations = tip ? tip.height - height + 1 : 1;
    const state: SettlementState = confirmations >= 10 ? 'settled' : 'confirmed';
    return { txid, state, score: 1, confirmations, reasons, ancestors, servers, checkedAt };
  }

  // Breadth-first walk over unconfirmed ancestry.
  const queue: { txid: string; depth: number }[] = [{ txid, depth: 0 }];
  const seen = new Set<string>([txid]);
  let truncated = false;
  while (queue.length) {
    const { txid: cur, depth } = queue.shift()!;
    if (ancestors.length >= maxAncestors) { truncated = true; break; }
    const tx = await getTx(src, cache, cur);
    const node: AncestorNode = { txid: cur, height: 0, depth, inputs: [] };
    // Prefetch all parents of this transaction in parallel.
    await Promise.all(tx.inputs.map((i) => getTx(src, cache, binToHex(i.outpointTransactionHash))));
    for (let vin = 0; vin < tx.inputs.length; vin++) {
      const input = tx.inputs[vin]!;
      const prevTxid = binToHex(input.outpointTransactionHash);
      const prev = await getTx(src, cache, prevTxid);
      const prevOut = prev.outputs[input.outpointIndex];
      if (!prevOut) throw new Error(`missing prevout ${prevTxid}:${input.outpointIndex}`);
      const cov = classifyInput(prevOut.lockingBytecode, input.unlockingBytecode);
      node.inputs.push({
        vin, prevTxid, prevVout: input.outpointIndex, covered: cov.covered,
        code: cov.covered ? undefined : cov.code, sighash: cov.sighash,
      });
      if (!cov.covered) {
        reasons.push(reason(cov.code, cur, cov.score, vin, cov.sighash !== undefined ? describeSighash(cov.sighash) : undefined));
      }
      if (!seen.has(prevTxid)) {
        seen.add(prevTxid);
        const ph = await getHeight(src, cache, prevTxid);
        if (ph === 0) queue.push({ txid: prevTxid, depth: depth + 1 });
      }
    }
    ancestors.push(node);
  }
  if (truncated) reasons.push(reason('ancestor-limit', txid, 0.25));

  // Existing double-spend proofs on the payment or any unconfirmed ancestor.
  for (const a of ancestors) {
    const proof = await src.request<unknown>('blockchain.transaction.dsproof.get', a.txid).catch(() => null);
    if (proof) reasons.push(reason('dsproof', a.txid, 0));
  }

  // Cross-check: every server should know the payment, and none should hold a proof.
  if (crossCheck) {
    const [txViews, dspViews] = await Promise.all([
      src.requestAll<string>('blockchain.transaction.get', txid, false),
      src.requestAll<unknown>('blockchain.transaction.dsproof.get', txid),
    ]);
    for (const tv of txViews) {
      const dv = dspViews.find((d) => d.host === tv.host);
      servers.push({ host: tv.host, sawTx: !!tv.result, dsproof: !!dv?.result, error: tv.error });
    }
    const answered = servers.filter((s) => s.sawTx || (s.error && isNotFound(s.error)));
    if (answered.some((s) => !s.sawTx)) reasons.push(reason('servers-disagree', txid, 0, undefined,
      `${answered.filter((s) => s.sawTx).length}/${answered.length} servers see it`));
    if (servers.some((s) => s.dsproof) && !reasons.some((r) => r.code === 'dsproof' && r.txid === txid)) {
      reasons.push(reason('dsproof', txid, 0, undefined, 'reported by at least one server'));
    }
  }

  const score: 0 | 0.25 | 1 = reasons.some((r) => r.score === 0) ? 0 : reasons.length ? 0.25 : 1;
  const state: SettlementState = score === 1 ? 'received' : 'pending';
  return { txid, state, score, confirmations: 0, reasons, ancestors, servers, checkedAt };
}
