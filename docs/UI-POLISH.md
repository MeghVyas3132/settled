# UI/UX polish list (for Anton)

Checked on 21 Nov at 390 px (phone) and desktop.

Already fine on every page (`/`, `/#/pay`, `/#/merchant`, `/#/monitor`, `/#/about`, `/#/tx/<id>`):
- no horizontal scroll
- no errors
- live data loads

Everything below is polish, not breakage. Code lives in `apps/web/src/` (vanilla TS + Vite): `main.ts` has the pages, `ui.ts` the shared pieces, `style.css` the theme.

## Constraints (BLAZE rules, do not break)
- **Banner** at the top of every page must keep 4 things:
  - presentation (Widget Factory slides) link
  - source code link
  - CashTokens address
  - "built from scratch during BLAZE"
- **First impression:** judges said "big text that says what it does, one click that works". Keep the headline and the check box above the fold.
- **States** use Kallisti's wording from the CHIP thread: Pending / Received / Confirmed / Settled. Keep those words.
- **Freeze:** the judged deploy freezes on **22 Nov 12:00 IST**. Merge UI changes before then. After that, only the dev URL changes.

## Suggestions, most valuable first
1. **Phone nav wraps to 3 rows.** Use a horizontal scroll strip or a compact menu.
2. **Phone banner:** the donation address wraps over 2 lines. Show it shortened (`zqp03…lsm3f`) with copy and QR buttons.
3. **Hero on phone:** the paragraph is long. Show one sentence and tuck the rest into "How it works".
4. **Report card:** make the state impossible to miss. Use a full-width colored strip (WAIT / OK TO HAND OVER / CONFIRMED) like the merchant terminal on `/#/pay`.
5. **Checkout `/#/pay`:**
   - Put the two options side by side on desktop with a clear "A vs B" comparison.
   - After a payment, scroll to the terminal automatically.
   - Add a hint: "Keep this tab visible while your wallet signs". The WizardConnect relay pauses in hidden tabs.
6. **Monitor:** a small bar chart of protectable vs contract vs UTXOS-signed per block. The data is already in `/v1/monitor` → `blocks.recent`.
7. **Merchant:** empty state when an address has no payments. Show the address as a QR so the merchant can print it.
8. **Polish:**
   - favicon/OG image for link previews (X, Telegram)
   - loading skeletons instead of "Loading…" text
   - check dark mode contrast

## Not checked
- **Selene wallet:** no device available. Known risk (report 14): Selene drops pending sign requests when you switch apps. Test it on a phone if you can.
- Paytaca mobile app connection. Cashonize web is tested end to end.
