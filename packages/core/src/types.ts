/**
 * Settlement states. Wording follows the CHIP-2025-11 discussion
 * (bitcoincashresearch.org/t/1704, Kallisti 13 Dec 2025, 2qx 17 Dec 2025).
 */
export type SettlementState = 'pending' | 'received' | 'confirmed' | 'settled' | 'unknown';

export type ReasonCode =
  | 'not-p2pkh'
  | 'sighash-utxos'
  | 'sighash-anyonecanpay'
  | 'sighash-not-all'
  | 'no-forkid'
  | 'unparsable-signature'
  | 'dsproof'
  | 'servers-disagree'
  | 'not-found'
  | 'ancestor-limit';

export interface Reason {
  code: ReasonCode;
  /** Transaction the problem was found in (the payment itself or an unconfirmed ancestor). */
  txid: string;
  /** Input index, when the reason is about one input. */
  vin?: number;
  /** Plain-language explanation for merchants and payers. */
  message: string;
  /** 0 = no protection, 0.25 = weak protection (BCHN getdsproofscore scale). */
  score: 0 | 0.25;
}

export interface AncestorNode {
  txid: string;
  /** 0 when unconfirmed. */
  height: number;
  /** Depth from the analysed transaction (0 = the transaction itself). */
  depth: number;
  inputs: { vin: number; prevTxid: string; prevVout: number; covered: boolean; code?: ReasonCode; sighash?: number }[];
}

export interface ServerView {
  host: string;
  sawTx: boolean;
  dsproof: boolean;
  error?: string;
}

export interface SettlementReport {
  txid: string;
  state: SettlementState;
  /** Mirrors BCHN getdsproofscore: 1 = protected, 0.25 = weak, 0 = no protection. */
  score: 0 | 0.25 | 1;
  confirmations: number;
  reasons: Reason[];
  /** Unconfirmed transactions examined (the payment plus unconfirmed ancestors). */
  ancestors: AncestorNode[];
  servers: ServerView[];
  checkedAt: string;
}

/** Minimal Electrum-protocol interface the analyser needs. */
export interface ChainSource {
  hosts(): string[];
  /** Request from one healthy server (with failover). */
  request<T = unknown>(method: string, ...params: unknown[]): Promise<T>;
  /** Request from every connected server; per-host result or error. */
  requestAll<T = unknown>(method: string, ...params: unknown[]): Promise<{ host: string; result?: T; error?: string }[]>;
}
