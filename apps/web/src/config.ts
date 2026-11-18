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
