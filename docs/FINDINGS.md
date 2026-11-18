# Findings: zero-conf safety on Bitcoin Cash today

Measured and verified while building Settled (18–19 Nov 2026). Every claim links to its source.

## 1. Double-spend proofs protect less than half of BCH transactions

We scanned 36 mainnet blocks (977,895–977,930), 4,494 non-coinbase transactions, classifying each input from its unlocking script.

| Class | Share of transactions | Can a DSProof protect it? |
|---|---|---|
| At least one input spends a contract / non-P2PKH output | 51.1% | No (BCHN only supports P2PKH) |
| Plain P2PKH, signed `ALL\|FORKID` | 45.4% | Yes |
| Plain P2PKH, but at least one `SIGHASH_UTXOS` signature | 3.1% | No (see §2) |
| ANYONECANPAY or not-ALL signatures | 0.3% | Weakly |

Script: [`research/sighash_scan.py`](../research/sighash_scan.py). The live version runs in the API (`GET /v1/monitor`) and on the network monitor page.

## 2. WizardConnect payments can never get a double-spend proof

- The WizardConnect protocol requires the wallet to sign every input with `SIGHASH_ALL|FORKID|UTXOS` (hdwalletv1; see [`04-hands-on-stack-test`](../../bch-blaze-2026/research/deep/04-hands-on-stack-test.md) §4).
- Bitcoin Cash Node, `src/dsproof/dsproof_create.cpp`: `throw std::runtime_error("SIGHASH_UTXOS is not currently supported by dsproof");`
- `src/dsproof/dsproof_validate.cpp`, `checkIsProofPossibleForAllInputsOfTx`: the signature getter throws, `hasFork()` is false, the function returns `false`, and so `getdsproofscore` is `0.0`.
- Consequence: every payment made through WizardConnect, the connection standard BLAZE requires, is not zero-conf safe. Nothing in any wallet or POS tells the merchant.

## 3. Descendants are not notified

From BCHN's DSProof implementation notes: "If a transaction that is double spent is in the mempool … and has descendants in the mempool, a DSProof is currently only issued for the double spent transaction itself. There is no notification or query mechanism yet to inform that the descendants have now been put at risk." A merchant paid by a child of a double-spent transaction hears nothing.

Settled walks the full unconfirmed ancestry and checks proofs on every ancestor.

## 4. CHIP-2025-11 has no implementation

- [CHIP-2025-11 "Unsettled Inputs Break Zero-confirmation Transactions"](https://bitcoincashresearch.org/t/chip-2025-11-unsettled-inputs-break-zero-confirmation-transactions/1704) (2qx, 25 Nov 2025): wallets and POS SHOULD show "pending/unsettled" when any non-P2PKH input is in the unconfirmed chain.
- The UX states were agreed in the thread between 10 and 17 Dec 2025 (Kallisti, 2qx, ShadowOfHarbringer, bitcoincashautist).
- On 19 Nov 2026 we searched (`grep -i 'dsproof|ds_proof|dsp|unsettled'`) shallow clones of paytaca-app, paytaca-pos, cashonize-wallet, Electron-Cash and selene-wallet. There are 0 implementations. watchtower-cash defines an unused `get_dsproof()`.

## 5. The live risk

Cauldron arbitrage bots race each other for unbalanced pools. This causes mempool de-synchronisation and broken chains of unconfirmed swaps ([t/2258](https://bitcoincashresearch.org/t/2258), Nov 2026).

On 19 Nov, 4 of 5 public Fulcrum 2.1.4 servers answered `blockchain.transaction.dsproof.*`, so the data needed to warn merchants is available today.
