import { describe, expect, it } from 'vitest';
import { classifyInput, p2pkhSighash } from '../src/script.js';

const p2pkhLock = Uint8Array.from([0x76, 0xa9, 0x14, ...new Array(20).fill(7), 0x88, 0xac]);
const p2sh20Lock = Uint8Array.from([0xa9, 0x14, ...new Array(20).fill(7), 0x87]);

/** Builds `<schnorr sig + hashtype> <compressed pubkey>`. */
function unlock(hashType: number, schnorr = true): Uint8Array {
  const sig = schnorr ? [...new Array(64).fill(1), hashType] : [0x30, ...new Array(69).fill(2), hashType];
  return Uint8Array.from([sig.length, ...sig, 33, 0x02, ...new Array(32).fill(3)]);
}

describe('p2pkhSighash', () => {
  it('reads schnorr and DER hash types', () => {
    expect(p2pkhSighash(unlock(0x41))).toBe(0x41);
    expect(p2pkhSighash(unlock(0x61, false))).toBe(0x61);
  });
  it('rejects non-P2PKH shaped unlocking scripts', () => {
    expect(p2pkhSighash(Uint8Array.from([0x00, 0x51]))).toBeUndefined();
    expect(p2pkhSighash(Uint8Array.from([0x02, 0x01, 0x02]))).toBeUndefined();
  });
});

describe('classifyInput (mirrors BCHN checkIsProofPossibleForAllInputsOfTx)', () => {
  it('ALL|FORKID on P2PKH is covered', () => {
    expect(classifyInput(p2pkhLock, unlock(0x41))).toEqual({ covered: true, sighash: 0x41 });
  });
  it('ALL|FORKID|UTXOS (WizardConnect) is not covered, score 0', () => {
    expect(classifyInput(p2pkhLock, unlock(0x61))).toMatchObject({ covered: false, score: 0, code: 'sighash-utxos' });
  });
  it('ANYONECANPAY is weak, score 0.25', () => {
    expect(classifyInput(p2pkhLock, unlock(0xc1))).toMatchObject({ covered: false, score: 0.25, code: 'sighash-anyonecanpay' });
  });
  it('SINGLE is weak, score 0.25', () => {
    expect(classifyInput(p2pkhLock, unlock(0x43))).toMatchObject({ covered: false, score: 0.25, code: 'sighash-not-all' });
  });
  it('missing FORKID is not covered', () => {
    expect(classifyInput(p2pkhLock, unlock(0x01))).toMatchObject({ covered: false, score: 0, code: 'no-forkid' });
  });
  it('P2SH (contract) prevout is not covered', () => {
    expect(classifyInput(p2sh20Lock, unlock(0x41))).toMatchObject({ covered: false, score: 0, code: 'not-p2pkh' });
  });
});
