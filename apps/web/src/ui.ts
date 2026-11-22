import type { Report, State } from './api';
import { EXPLORER } from './config';

export const h = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const short = (s: string, n = 10) => `${s.slice(0, n)}…${s.slice(-6)}`;

export const STATE_COPY: Record<State, { label: string; hint: string }> = {
  pending: { label: 'Pending', hint: 'Do not hand over goods yet. These funds can still be reversed. Wait for one confirmation.' },
  received: { label: 'Received', hint: 'Safe to hand over goods. Protected by double-spend proofs until it is mined.' },
  confirmed: { label: 'Confirmed', hint: 'Included in a block.' },
  settled: { label: 'Settled', hint: '10+ confirmations.' },
  unknown: { label: 'Not found', hint: 'The network does not know this transaction.' },
};

/** Electric-blue dot mark. */
export const MARK = `<svg class="mark" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#1f4fd8"/><circle cx="10" cy="10" r="3.1" fill="#fff"/></svg>`;

export function nav(active: string): HTMLElement {
  const items = [['#/check', 'Check'], ['#/merchant', 'Merchant'], ['#/monitor', 'Network monitor'], ['#/about', 'How it works']];
  return h(`<nav>${items.map(([href, label]) => `<a href="${href}" class="${href === active ? 'on' : ''}">${label}</a>`).join('')}</nav>`);
}

export function statePill(s: State): string {
  return `<span class="pill ${s}">${STATE_COPY[s].label}</span>`;
}

/** A merchant verdict card. */
export function terminal(state: State, big: string, subHtml = '', opts: { bezel?: string } = {}): HTMLElement {
  return h(`<section class="terminal ${state}">
    <div class="bezel"><span class="led"></span>${esc(opts.bezel ?? 'Merchant terminal')}</div>
    <div class="screen"><div class="t1">${big}</div>${subHtml ? `<div class="t2">${subHtml}</div>` : ''}</div>
  </section>`);
}

/** Full report card: state, plain-language reasons, ancestor tree, server views. */
export function reportCard(r: Report): HTMLElement {
  const copy = STATE_COPY[r.state];
  const uniq = new Map<string, typeof r.reasons[number]>();
  for (const x of r.reasons) uniq.set(`${x.code}|${x.txid}`, x);
  const reasons = [...uniq.values()];
  const reasonHtml = reasons.length
    ? `<ul class="reasons">${reasons.map((x) => `<li><b>${esc(x.code)}</b> in <a href="${EXPLORER}${x.txid}" target="_blank" rel="noopener"><code>${short(x.txid)}</code></a>${x.vin !== undefined ? ` input ${x.vin}` : ''}: ${esc(x.message)}</li>`).join('')}</ul>`
    : r.state === 'received' ? '<p class="ok">Every input in this payment and its unconfirmed history can be protected by double-spend proofs, and all servers agree.</p>' : '';
  const tree = r.ancestors.length
    ? `<details><summary>Unconfirmed history checked (${r.ancestors.length} transaction${r.ancestors.length > 1 ? 's' : ''})</summary><ol class="tree">${r.ancestors
        .map((a) => `<li style="margin-left:${a.depth * 16}px"><code>${short(a.txid)}</code> ${a.inputs.map((i) => `<span class="in ${i.covered ? 'cov' : 'unc'}" title="${i.code ?? 'covered'}">in${i.vin}${i.covered ? ' ✓' : ' ✕ ' + (i.code ?? '')}</span>`).join(' ')}</li>`)
        .join('')}</ol></details>` : '';
  const servers = r.servers.length
    ? `<p class="muted small">Checked against ${r.servers.length} independent servers: ${r.servers.map((s) => `${esc(s.host)} ${s.sawTx ? '✓' : '✕'}${s.dsproof ? ' (double-spend proof!)' : ''}`).join(' · ')}</p>` : '';
  const bm = r.beforeMining;
  const before = bm
    ? `<div class="before"><p class="small"><b>Before it was mined</b> a merchant would have seen ${statePill(bm.state)} (score ${bm.score}).</p>${bm.reasons.length
        ? `<ul class="reasons">${[...new Map(bm.reasons.map((x) => [x.code, x])).values()].map((x) => `<li><b>${esc(x.code)}</b>: ${esc(x.message)}</li>`).join('')}</ul>`
        : '<p class="small ok">Every input was protectable by double-spend proofs (judged from its own inputs).</p>'}</div>` : '';
  return h(`<section class="card report ${r.state}">
    <div class="head">${statePill(r.state)} ${r.confirmations ? '' : `<span class="score">protection score ${r.score}</span>`} ${r.confirmations ? `<span class="score">${r.confirmations} confirmation${r.confirmations > 1 ? 's' : ''}</span>` : ''}</div>
    <p class="hint">${copy.hint}</p>${before}
    <p class="small">Transaction <a href="${EXPLORER}${r.txid}" target="_blank" rel="noopener"><code>${esc(r.txid)}</code></a></p>
    ${reasonHtml}${tree}${servers}
    <p class="muted small">Checked ${new Date(r.checkedAt).toLocaleTimeString()}</p>
  </section>`);
}
