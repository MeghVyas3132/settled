#!/usr/bin/env node
import { FulcrumPool } from './pool.js';
import { analyzeTransaction } from './analyze.js';

const txids = process.argv.slice(2).filter((a) => /^[0-9a-f]{64}$/i.test(a));
const json = process.argv.includes('--json');
if (!txids.length) {
  console.error('usage: settled <txid> [txid...] [--json]');
  process.exit(2);
}

const pool = new FulcrumPool();
await pool.connect();
for (const txid of txids) {
  const t0 = Date.now();
  const r = await analyzeTransaction(pool, txid);
  if (json) { console.log(JSON.stringify(r, null, 2)); continue; }
  console.log(`${txid}\n  state: ${r.state.toUpperCase()}  score: ${r.score}  confirmations: ${r.confirmations}  (${Date.now() - t0} ms)`);
  console.log(`  unconfirmed txs checked: ${r.ancestors.length}  servers: ${r.servers.map((s) => `${s.host}${s.sawTx ? '' : '(missing)'}${s.dsproof ? '(DSPROOF)' : ''}`).join(', ')}`);
  for (const x of r.reasons) console.log(`  - [${x.code}] tx ${x.txid.slice(0, 12)}${x.vin !== undefined ? ` vin ${x.vin}` : ''}: ${x.message}`);
}
await pool.close();
