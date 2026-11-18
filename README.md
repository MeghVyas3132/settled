# Settled

**Know when a Bitcoin Cash payment is really safe to hand over the goods.**

BCH payments are meant to be instant ("zero-conf"). That only holds when the network can raise a double-spend proof if someone tries to spend the same coins twice. Today:

- less than half of BCH transactions can be protected that way,
- every payment made through WizardConnect is signed in a way no proof can cover,
- no wallet or point-of-sale tells the merchant either of these.

Settled checks a payment and its whole unconfirmed history using the same rules Bitcoin Cash Node uses, and tells the merchant **Pending**, **Received** (safe), **Confirmed** or **Settled**, with the reason. It is the first implementation of [CHIP-2025-11](https://bitcoincashresearch.org/t/chip-2025-11-unsettled-inputs-break-zero-confirmation-transactions/1704).

> BCH BLAZE 2026, Mainnet Track. Built from scratch during the hackathon (14–22 Nov 2026).
> Presentation: _link_ · Live app: _link_ · CashTokens address: _address_

## What's in the box

| Part | What it does |
|---|---|
| **Check a payment** (`/`) | Paste a txid. You get the state, a plain-language reason for every problem, the unconfirmed ancestor tree, and what each server sees. Updates live until settled. |
| **Demo checkout** (`/#/pay`) | Pay 1,000 sats on mainnet two ways: a normal wallet QR, or WizardConnect (Cashonize, Paytaca, Selene). The **guard** skips coins whose history is unsettled, and verifies the wallet signed exactly the requested payment before broadcasting. The merchant terminal shows WAIT / OK TO HAND OVER. |
| **Merchant dashboard** (`/#/merchant`) | Every payment to an address, with its settlement state. |
| **Network monitor** (`/#/monitor`) | How much of BCH traffic is zero-conf safe, block by block, plus a live mempool sample and active double-spend proofs. |
| **Settlement API** | `GET /v1/tx/:txid`, `GET /v1/tx/:txid/stream` (SSE), `GET /v1/address/:address`, `GET /v1/coins?addresses=`, `POST /v1/watch` (webhooks), `GET /v1/monitor`. |
| **`settled-core`** | The engine as a TypeScript library, for wallets and POS. |

## How it decides

For an unconfirmed transaction, Settled walks every unconfirmed ancestor and classifies every input the way BCHN's `checkIsProofPossibleForAllInputsOfTx` and `getdsproofscore` do:

| Finding (anywhere in the unconfirmed history) | Score | State |
|---|---|---|
| Spends a contract / non-P2PKH output | 0 | Pending |
| Signed with `SIGHASH_UTXOS` (WizardConnect, many token wallets) | 0 | Pending |
| A double-spend proof exists | 0 | Pending |
| Independent servers disagree it is in the mempool | 0 | Pending |
| ANYONECANPAY or not SIGHASH_ALL | 0.25 | Pending |
| More than 1,000 unconfirmed ancestors | 0.25 | Pending |
| None of the above | 1 | **Received** |
| In a block / 10+ blocks | 1 | Confirmed / Settled |

Evidence and measurements: [`docs/FINDINGS.md`](docs/FINDINGS.md).

## Run it

```bash
pnpm install
pnpm -r build
node packages/core/dist/cli.js <txid>          # CLI
PORT=8787 node apps/api/dist/server.js         # API
cd apps/web && VITE_API=http://localhost:8787 VITE_MERCHANT=bitcoincash:... npx vite
pnpm -r test
```

## Use the library

```ts
import { FulcrumPool, analyzeTransaction } from 'settled-core';
const pool = new FulcrumPool();          // 4 public Fulcrum servers by default
await pool.connect();
const r = await analyzeTransaction(pool, txid);
if (r.state === 'received') handOverGoods();
```

## Status

| Done | Not done yet |
|---|---|
| Engine, CLI, 15 unit tests, API, web app (check, checkout, merchant, monitor) | Hosted deploy, mainnet demo txids, PRs to Paytaca POS and Cashonize, npm publish |

## Limits and threat model

- Settled reports what the network *can* protect. It cannot stop a miner from mining a conflicting transaction. DSProof-protected payments are strong evidence, not a guarantee.
- The mempool view comes from public Fulcrum servers. A server could lie; we cross-check several independent ones and flag disagreement.
- Block statistics classify inputs from unlocking scripts (P2PKH shape + sighash byte), without looking up prevouts. The transaction checker does look up every prevout.

## License

MIT
