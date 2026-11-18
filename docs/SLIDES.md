# Widget Factory slides: draft text

7 slides, following the BLAZE template's order. Megh to edit the wording in his own voice before pasting.

## 1. Title
**Settled**: know when a BCH payment is really safe.
Team: Megh Vyas (+ Anton?) · GitHub / X / Telegram handles

## 2. Tagline + repo
"A merchant should never hand over goods for a payment that can still be reversed."
Repo: github.com/… · Live: settled.aexiz.in

## 3. Story
- BCH's promise is instant payments. They are safe because nodes broadcast a double-spend proof if someone tries to spend the same coins twice.
- That only works for plain P2PKH payments signed SIGHASH_ALL.
- We measured mainnet: only **45%** of transactions qualify. 51% touch a smart contract.
- Every WizardConnect payment is signed SIGHASH_UTXOS, which BCHN cannot cover ("SIGHASH_UTXOS is not currently supported by dsproof").
- CHIP-2025-11 asked wallets and POS to show "pending" for these a year ago. As of 19 Nov 2026, no wallet or POS does.

## 4. Benefits
- **Merchants:** a clear WAIT / OK TO HAND OVER, with the reason.
- **Payers:** the checkout picks coins that will arrive as safe, and warns before using freshly swapped coins.
- **Wallet and POS devs:** `settled-core` and an API, so CHIP-2025-11 takes an afternoon, not a research project.
- **The ecosystem:** a public monitor of how much BCH traffic is really zero-conf safe.

## 5. BCH usage
- Real mainnet payments through the demo checkout (txids: …).
- The same rules as BCHN `getdsproofscore`: P2PKH + SIGHASH_ALL coverage, ancestor walk, existing proofs.
- Double-spend proofs from 3+ independent Fulcrum servers, cross-checked for mempool disagreement.
- WizardConnect integration (and why it shows Pending).

## 6. Vision (numeric target)
- Within 3 months: settlement states in Paytaca POS and Cashonize (PRs open), covering the ~800 Paytaca POS merchants.
- Push the protectable share of BCH payments from 45% toward 90%+, with data on the monitor: DSProof support for SIGHASH_UTXOS in nodes, and wallets choosing protectable signatures for plain payments.
- Settlement API for processors that left BCH (CoinGate), so they can accept 0-conf again with confidence.

## 7. Thank you
Links, CashTokens address for EMBER2026 votes, QR to the live demo.
