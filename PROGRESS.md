# Settled: progress log

Plan: ../bch-blaze-2026/BUILD-PLAN.md. Freeze 22 Nov 12:00 IST. Submit by 22 Nov 15:00 IST.

## Findings (research during build)
- **WizardConnect payments can never get a double-spend proof.**
  - WizardConnect spec: the wallet MUST sign with SIGHASH_ALL|FORKID|UTXOS.
  - BCHN dsproof_create.cpp: "SIGHASH_UTXOS is not currently supported by dsproof". `checkIsProofPossibleForAllInputsOfTx` returns false, so the `getdsproofscore` score is 0.
  - So every WizardConnect payment is not zero-conf safe, and nothing tells the merchant.
- **Mainnet scan, 36 blocks (977895–977930, 4,494 non-coinbase txs):**
  - 51.1% have a non-P2PKH input.
  - 3.1% are P2PKH-only but signed with UTXOS.
  - 0.3% have a weak sighash.
  - Only 45.4% are coverable by DSProof.
  - Script: research/sighash_scan.py
- **BCHN does not notify descendants.** It issues a DSProof only for the double-spent tx, not its mempool descendants ("no notification or query mechanism yet"). The core walks ancestors to cover this. Fulcrum's dsproof.get returns a `descendants` list.
- **getdsproofscore semantics:** 1.0 protected, 0.25 weak (ANYONECANPAY or not-ALL, or more than 20k ancestors / depth over 1000), 0 none (non-P2PKH, a proof exists, or a proof is not possible).

## Day 1 (19 Nov)
- [x] Repo scaffold (pnpm workspace)
- [x] settled-core: script classifier, Fulcrum pool (4 servers), ancestor walk, dsproof check, server cross-check, state machine
- [x] CLI `node packages/core/dist/cli.js <txid>`, verified on live mempool txs (Cauldron-style contract chains → PENDING, plain P2PKH → RECEIVED)
- [x] 15 unit tests (classifier, and analyzer with a mock chain)
- [ ] Admin by Megh: DoraHacks register, Telegram check-in, roll-call ask
- [x] API (Hono): /v1/tx, /v1/tx/:id/stream (SSE), /v1/address, /v1/coins, /v1/broadcast, /v1/watch (webhooks), /v1/monitor. Tested live.
- [x] Monitor: per-block classifier (Blockchair raw blocks) + mempool sample + active dsproofs
- [x] Web (Vite): check page, demo checkout (QR path + WizardConnect path with coin guard and signed-tx verification), merchant dashboard, monitor, how-it-works, BLAZE banner. Built; screenshot research/shot-tx.png
- [x] docs/FINDINGS.md, README.md, LICENSE
- [x] Real-tx fixtures: 2 recorded mainnet chains (received P2PKH, pending contract chain); scripts/record-fixture.mjs; 17 tests pass. Font: IBM Plex
- [ ] NEEDS MEGH: merchant + CashTokens donation address; a few thousand sats in a WizardConnect wallet (Cashonize/Paytaca) for the first mainnet payments; deploy target (settled.aexiz.in + OCI?); OK to create a public GitHub repo
- [ ] Dev deploy

## Day 2 (20 Nov): checkout guard, API, mainnet payments
## Day 3 (21 Nov): merchant dashboard, monitor, PRs, npm, stream 19:30 IST
## Day 4 (22 Nov): banner, slides, README, freeze 12:00, submit
