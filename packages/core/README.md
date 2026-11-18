# settled-core

Zero-confirmation settlement checks for Bitcoin Cash payments. An implementation of CHIP-2025-11.

It tells you whether an unconfirmed BCH payment can be trusted. It walks the payment and every unconfirmed ancestor and classifies each input the same way Bitcoin Cash Node does for double-spend proofs. It then checks for existing proofs and cross-checks several Fulcrum servers.

```ts
import { FulcrumPool, analyzeTransaction } from 'settled-core';
const pool = new FulcrumPool();
await pool.connect();
const r = await analyzeTransaction(pool, txid);
// r.state: 'pending' | 'received' | 'confirmed' | 'settled' | 'unknown'
// r.score: 0 | 0.25 | 1  (same scale as BCHN getdsproofscore)
// r.reasons: why, in plain language, per transaction and input
```

CLI: `npx settled-core <txid>`

MIT
