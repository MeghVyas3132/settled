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
- [x] Merchant address bitcoincash:qqp03escsg96978qz8fla6y2pf0teknf3q408p7aw6; banner CashTokens (token-aware) bitcoincash:zqp03escsg96978qz8fla6y2pf0teknf3qj95lsm3f (apps/web/.env)
- [x] Public repo github.com/MeghVyas3132/settled
- [ ] NEEDS MEGH: a few thousand sats in a WizardConnect wallet (Cashonize/Paytaca) for the first mainnet payments; deploy target (settled.aexiz.in + OCI?); OK to create a public GitHub repo
- [x] Deploy files prepared (Dockerfile, deploy/compose.yml with caps, deploy/settled-api.caddy). Not deployed: waiting for Megh's OK
- [x] docs/SLIDES.md: Widget Factory 7-slide draft text (Megh to edit)
- [x] settled-core npm-ready (exports, bin, README, 7 kB tarball; name check below). Publish needs Megh OK
- [x] Paytaca POS patch prepared locally (integrations/paytaca-pos.patch: useSettlement composable, badge on received list). Untested in the Quasar app; submitting the PR needs Megh OK
- [x] Finding: Paytaca Tap to Pay = contract spends, never DSProof-protectable (docs/FINDINGS.md §6)
- [ ] Dev deploy (after Megh OK)

## Day 2 (20 Nov): checkout guard, API, mainnet payments
## Day 3 (21 Nov): merchant dashboard, monitor, PRs, npm, stream 19:30 IST
## Day 4 (22 Nov): banner, slides, README, freeze 12:00, submit
