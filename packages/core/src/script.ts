import { isPayToPublicKeyHash } from '@bitauth/libauth';

/** Sighash flag bits used by Bitcoin Cash. */
export const SIGHASH = {
  ALL: 0x01,
  NONE: 0x02,
  SINGLE: 0x03,
  UTXOS: 0x20,
  FORKID: 0x40,
  ANYONECANPAY: 0x80,
} as const;

/**
 * Why an input cannot be protected by a double-spend proof.
 * Mirrors BCHN `DoubleSpendProof::checkIsProofPossibleForAllInputsOfTx`
 * (src/dsproof/dsproof_validate.cpp) and `getdsproofscore`.
 */
export type InputCoverage =
  | { covered: true; sighash: number }
  | {
      covered: false;
      /** 0 = no proof possible at all, 0.25 = proof possible but weak */
      score: 0 | 0.25;
      code: 'not-p2pkh' | 'sighash-utxos' | 'sighash-anyonecanpay' | 'sighash-not-all' | 'no-forkid' | 'unparsable-signature';
      sighash?: number;
    };

/**
 * Reads the first push of a P2PKH unlocking script (the signature) and returns its sighash byte.
 * Returns undefined when the unlocking script does not look like `<sig> <pubkey>`.
 */
export function p2pkhSighash(unlockingBytecode: Uint8Array): number | undefined {
  const b = unlockingBytecode;
  if (b.length < 2) return undefined;
  const sigLen = b[0]!;
  if (sigLen < 1 || sigLen > 75) return undefined;
  const sig = b.subarray(1, 1 + sigLen);
  if (sig.length !== sigLen) return undefined;
  const rest = b.subarray(1 + sigLen);
  const pubLen = rest[0];
  if (pubLen !== 33 && pubLen !== 65) return undefined;
  if (rest.length !== pubLen + 1) return undefined;
  const isSchnorr = sigLen === 65;
  const isDer = sigLen >= 9 && sigLen <= 73 && sig[0] === 0x30;
  if (!isSchnorr && !isDer) return undefined;
  return sig[sig.length - 1];
}

/**
 * Classifies one input given the locking bytecode of the output it spends.
 */
export function classifyInput(prevoutLockingBytecode: Uint8Array, unlockingBytecode: Uint8Array): InputCoverage {
  if (!isPayToPublicKeyHash(prevoutLockingBytecode)) {
    return { covered: false, score: 0, code: 'not-p2pkh' };
  }
  const sighash = p2pkhSighash(unlockingBytecode);
  if (sighash === undefined) return { covered: false, score: 0, code: 'unparsable-signature' };
  if (!(sighash & SIGHASH.FORKID)) return { covered: false, score: 0, code: 'no-forkid', sighash };
  // BCHN: "SIGHASH_UTXOS is not currently supported by dsproof" -> proof not possible -> score 0.
  if (sighash & SIGHASH.UTXOS) return { covered: false, score: 0, code: 'sighash-utxos', sighash };
  if (sighash & SIGHASH.ANYONECANPAY) return { covered: false, score: 0.25, code: 'sighash-anyonecanpay', sighash };
  if ((sighash & 0x1f) !== SIGHASH.ALL) return { covered: false, score: 0.25, code: 'sighash-not-all', sighash };
  return { covered: true, sighash };
}

export function describeSighash(sighash: number): string {
  const base = sighash & 0x1f;
  const parts = [base === 1 ? 'ALL' : base === 2 ? 'NONE' : base === 3 ? 'SINGLE' : `0x${base.toString(16)}`];
  if (sighash & SIGHASH.FORKID) parts.push('FORKID');
  if (sighash & SIGHASH.UTXOS) parts.push('UTXOS');
  if (sighash & SIGHASH.ANYONECANPAY) parts.push('ANYONECANPAY');
  return parts.join('|');
}
