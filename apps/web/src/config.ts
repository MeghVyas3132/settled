export const API = (import.meta.env.VITE_API as string | undefined) ?? 'http://localhost:8787';
/** Demo merchant receiving address (token-aware addresses also accepted). */
export const MERCHANT = (import.meta.env.VITE_MERCHANT as string | undefined) ?? '';
/** BLAZE banner links. */
export const BANNER = {
  slides: (import.meta.env.VITE_SLIDES as string | undefined) ?? '#',
  repo: (import.meta.env.VITE_REPO as string | undefined) ?? '#',
  donation: (import.meta.env.VITE_DONATION as string | undefined) ?? '',
};
export const EXPLORER = 'https://explorer.salemkode.com/tx/';

/** Recorded mainnet proof (21 Nov 2026): the same wallet paid the same 1,000 sats two ways. */
export const PROOF = {
  wizard: {
    txid: '0a9d04cc4fda5aabb8cfd6ccdc1adf64d8dbaa0b78d8cd8ee842c8ff65dedd93',
    how: 'Settled checkout over WizardConnect',
    sighash: 'ALL | FORKID | UTXOS',
    state: 'pending' as const,
    score: '0',
    line: 'No double-spend proof is possible.',
  },
  normal: {
    txid: '7c3f6432a8e059b7fb874c6e617914cd1da8bfa2da475022194142319832f769',
    how: "Cashonize's normal Send",
    sighash: 'ALL | FORKID',
    state: 'received' as const,
    score: '1',
    line: 'Safe to hand over the goods.',
  },
};
