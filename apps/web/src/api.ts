import { API } from './config';

export type State = 'pending' | 'received' | 'confirmed' | 'settled' | 'unknown';
export interface Reason { code: string; txid: string; vin?: number; message: string; score: number }
export interface Report {
  txid: string; state: State; score: number; confirmations: number; reasons: Reason[];
  ancestors: { txid: string; depth: number; inputs: { vin: number; prevTxid: string; covered: boolean; code?: string; sighash?: number }[] }[];
  servers: { host: string; sawTx: boolean; dsproof: boolean }[]; checkedAt: string;
  beforeMining?: { state: 'pending' | 'received'; score: number; reasons: Reason[] };
}
export interface Coin { address: string; txid: string; vout: number; value: number; height: number; hasToken: boolean; safe: boolean; fundingState: State; reasons: string[] }

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, init);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? r.statusText);
  return body as T;
}

export const getTx = (txid: string) => j<Report>(`/v1/tx/${txid}`);
export const getAddress = (a: string) => j<{ address: string; payments: Report[] }>(`/v1/address/${encodeURIComponent(a)}`);
export const getCoins = (addrs: string[]) => j<{ coins: Coin[] }>(`/v1/coins?addresses=${addrs.map(encodeURIComponent).join(',')}`);
export const getMonitor = () => j<any>('/v1/monitor');
export const broadcast = (hex: string) =>
  j<{ txid: string }>('/v1/broadcast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hex }) });

/** Live report stream; returns a close function. */
export function streamTx(txid: string, onReport: (r: Report) => void): () => void {
  const es = new EventSource(`${API}/v1/tx/${txid}/stream`);
  es.addEventListener('report', (e) => onReport(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}
