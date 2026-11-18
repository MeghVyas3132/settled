import QRCode from 'qrcode';
import './style.css';
import { broadcast, getAddress, getCoins, getMonitor, getTx, streamTx, type Coin, type Report } from './api';
import { MERCHANT } from './config';
import { banner, esc, h, nav, reportCard, short, statePill } from './ui';
import { WizardWallet } from './wallet';

const app = document.getElementById('app')!;
let cleanup: (() => void)[] = [];

function shell(active: string, body: HTMLElement) {
  cleanup.forEach((f) => f());
  cleanup = [];
  app.replaceChildren(banner(), h(`<header><a href="#/" class="logo">Settled</a><span class="tag">Is this BCH payment safe to hand over the goods?</span></header>`), nav(active), body);
}

/* ---------- Check a payment ---------- */
function checkPage(initial?: string) {
  const body = h(`<main>
    <section class="hero">
      <h1>Know when a Bitcoin Cash payment is really safe.</h1>
      <p>BCH payments are meant to be instant. But a payment funded by a smart contract, or signed the way most dapp connections sign, can still be reversed before it is mined, and no wallet or point-of-sale tells the merchant. Settled checks the payment and its whole unconfirmed history, the same way BCH nodes decide what double-spend proofs can protect.</p>
      <form id="f"><input id="t" placeholder="Paste a transaction id" spellcheck="false" autocomplete="off"/><button>Check</button></form>
    </section>
    <div id="out"></div>
    <section id="stats" class="card stats"></section>
  </main>`);
  shell('#/', body);
  const out = body.querySelector('#out')!;
  const run = async (txid: string) => {
    out.replaceChildren(h('<p class="muted">Checking the payment and its unconfirmed history…</p>'));
    try {
      const r = await getTx(txid);
      out.replaceChildren(reportCard(r));
      if (r.state === 'pending' || r.state === 'received') {
        cleanup.push(streamTx(txid, (n) => out.replaceChildren(reportCard(n))));
      }
    } catch (e) {
      out.replaceChildren(h(`<p class="err">${esc((e as Error).message)}</p>`));
    }
  };
  body.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (body.querySelector('#t') as HTMLInputElement).value.trim();
    if (/^[0-9a-f]{64}$/i.test(v)) { location.hash = `#/tx/${v}`; } else out.replaceChildren(h('<p class="err">That is not a transaction id (64 hex characters).</p>'));
  });
  if (initial) { (body.querySelector('#t') as HTMLInputElement).value = initial; run(initial); }
  miniStats(body.querySelector('#stats')!);
}

async function miniStats(el: Element) {
  try {
    const m = await getMonitor();
    if (!m.blocks.txs) return el.remove();
    el.replaceChildren(h(`<div><h3>Right now on BCH mainnet</h3>
      <div class="big"><b>${m.blocks.pct.coverable}%</b><span>of transactions in the last ${m.blocks.count} blocks could be protected by double-spend proofs</span></div>
      <div class="row"><div><b>${m.blocks.pct.nonP2pkh}%</b> spend a smart contract or non-standard output</div><div><b>${m.blocks.pct.utxos}%</b> are plain payments signed with SIGHASH_UTXOS</div></div>
      <a href="#/monitor">Open the network monitor →</a></div>`));
  } catch { el.remove(); }
}

/* ---------- Demo checkout ---------- */
function payPage() {
  const amount = 1000;
  const body = h(`<main>
    <section class="card">
      <h2>Demo checkout: pay ${amount.toLocaleString()} sats</h2>
      <p class="muted">A real mainnet payment to the demo merchant (about $0.002). Pick how you pay and watch what the merchant would see.</p>
      ${MERCHANT ? '' : '<p class="err">Demo merchant address not configured.</p>'}
      <div class="two">
        <div class="opt">
          <h3>A. Scan with any BCH wallet</h3>
          <p class="small">A normal wallet send is signed SIGHASH_ALL, which BCH nodes can protect with double-spend proofs.</p>
          <canvas id="qr"></canvas>
          <p class="small"><code id="uri"></code></p>
        </div>
        <div class="opt">
          <h3>B. Connect a wallet (WizardConnect)</h3>
          <p class="small">Cashonize, Paytaca or Selene. Settled picks only coins that are safe to spend, then asks your wallet to sign.</p>
          <button id="wc">Connect wallet</button>
          <div id="wcbox"></div>
        </div>
      </div>
    </section>
    <div id="live"></div>
  </main>`);
  shell('#/pay', body);
  const uri = `${MERCHANT}?amount=${(amount / 1e8).toFixed(8)}`;
  body.querySelector('#uri')!.textContent = uri;
  if (MERCHANT) QRCode.toCanvas(body.querySelector('#qr') as HTMLCanvasElement, uri, { width: 200, margin: 1 });
  const live = body.querySelector('#live')!;

  const follow = (txid: string) => {
    live.replaceChildren(h(`<p class="muted">Payment broadcast: <code>${short(txid)}</code>. Watching…</p>`));
    cleanup.push(streamTx(txid, (r) => live.replaceChildren(merchantScreen(r), reportCard(r))));
  };

  // Path A: watch the merchant address for new mempool payments.
  if (MERCHANT) {
    let known: Set<string> | undefined;
    const poll = async () => {
      try {
        const a = await getAddress(MERCHANT);
        const ids = a.payments.map((p) => p.txid);
        if (!known) known = new Set(ids);
        else for (const id of ids) if (!known.has(id)) { known.add(id); follow(id); }
      } catch { /* retry */ }
    };
    poll();
    const t = setInterval(poll, 4000);
    cleanup.push(() => clearInterval(t));
  }

  // Path B: WizardConnect.
  body.querySelector('#wc')!.addEventListener('click', async () => {
    const box = body.querySelector('#wcbox')!;
    const w = new WizardWallet();
    cleanup.push(() => { w.disconnect(); });
    const c = h('<canvas></canvas>') as HTMLCanvasElement;
    box.replaceChildren(h('<p class="small">Scan with your wallet, or copy the link into it:</p>'), c,
      h(`<p class="small"><input readonly value="${esc(w.uri)}" onclick="this.select()"/></p>`));
    QRCode.toCanvas(c, w.uri, { width: 200, margin: 1 });
    w.onReady(async () => {
      box.replaceChildren(h(`<p>Connected to <b>${esc(w.walletName)}</b>. Checking your coins…</p>`));
      try {
        const { coins } = await getCoins(w.addresses.map((a) => a.address));
        const usable = coins.filter((x) => !x.hasToken);
        const safe = usable.filter((x) => x.safe).sort((a, b) => b.value - a.value);
        const risky = usable.filter((x) => !x.safe);
        box.replaceChildren(coinTable(usable));
        const pick: Coin[] = [];
        for (const x of safe) { if (pick.reduce((s, y) => s + y.value, 0) >= amount + 1000) break; pick.push(x); }
        const enough = pick.reduce((s, y) => s + y.value, 0) >= amount + 600;
        if (!enough) {
          box.append(h(`<p class="err">Not enough safe coins. ${risky.length ? `${risky.length} coin(s) came from transactions that are still unsettled (for example a fresh swap). Paying with them would show the merchant "Pending".` : 'Add a few thousand sats to this wallet.'}</p>`));
          return;
        }
        if (risky.length) box.append(h(`<p class="warn">Guard: skipped ${risky.length} unsettled coin(s) so they cannot drag your payment into "Pending".</p>`));
        const btn = h(`<button>Sign and pay ${amount} sats</button>`);
        box.append(btn);
        btn.addEventListener('click', async () => {
          btn.setAttribute('disabled', '');
          try {
            const hex = await w.pay(pick, MERCHANT, amount);
            const { txid } = await broadcast(hex);
            follow(txid);
          } catch (e) {
            box.append(h(`<p class="err">${esc((e as Error).message)}</p>`));
            btn.removeAttribute('disabled');
          }
        });
      } catch (e) {
        box.append(h(`<p class="err">${esc((e as Error).message)}</p>`));
      }
    });
  });
}

function coinTable(coins: Coin[]): HTMLElement {
  if (!coins.length) return h('<p>No coins found on the first wallet addresses.</p>');
  return h(`<table class="coins"><tr><th>Coin</th><th>Sats</th><th>Status</th></tr>${coins
    .map((c) => `<tr><td><code>${short(c.txid, 8)}:${c.vout}</code></td><td>${c.value.toLocaleString()}</td><td>${c.safe ? (c.height > 0 ? 'confirmed' : 'safe (unconfirmed)') : `<span class="unc">unsettled: ${esc(c.reasons.join(', ') || c.fundingState)}</span>`}</td></tr>`)
    .join('')}</table>`);
}

/** What a merchant terminal shows. */
function merchantScreen(r: Report): HTMLElement {
  const big = { pending: 'WAIT', received: 'OK TO HAND OVER', confirmed: 'CONFIRMED', settled: 'SETTLED', unknown: '…' }[r.state];
  return h(`<section class="terminal ${r.state}"><div class="t1">${big}</div><div class="t2">${statePill(r.state)}</div></section>`);
}

/* ---------- Merchant dashboard ---------- */
function merchantPage() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const addr = q.get('address') ?? MERCHANT;
  const body = h(`<main><section class="card"><h2>Merchant dashboard</h2>
    <form id="f"><input id="a" value="${esc(addr)}" placeholder="Your BCH address" spellcheck="false"/><button>Watch</button></form>
    <div id="list"></div></section></main>`);
  shell('#/merchant', body);
  const list = body.querySelector('#list')!;
  const load = async (a: string) => {
    try {
      const r = await getAddress(a);
      list.replaceChildren(h(`<table class="coins"><tr><th>Payment</th><th>State</th><th>Why</th></tr>${r.payments
        .map((p) => `<tr><td><a href="#/tx/${p.txid}"><code>${short(p.txid)}</code></a></td><td>${statePill(p.state)}</td><td class="small">${esc([...new Set(p.reasons.map((x) => x.code))].join(', ') || (p.state === 'received' ? 'protected' : ''))}</td></tr>`)
        .join('')}</table>`));
    } catch (e) { list.replaceChildren(h(`<p class="err">${esc((e as Error).message)}</p>`)); }
  };
  body.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = `#/merchant?address=${encodeURIComponent((body.querySelector('#a') as HTMLInputElement).value.trim())}`;
  });
  if (addr) { load(addr); const t = setInterval(() => load(addr), 5000); cleanup.push(() => clearInterval(t)); }
}

/* ---------- Network monitor ---------- */
async function monitorPage() {
  const body = h('<main><section class="card"><h2>Network monitor</h2><div id="m" class="muted">Loading…</div></section></main>');
  shell('#/monitor', body);
  const el = body.querySelector('#m')!;
  const load = async () => {
    const m = await getMonitor();
    const b = m.blocks;
    el.replaceChildren(h(`<div>
      <div class="big"><b>${b.pct.coverable}%</b><span>of ${b.txs.toLocaleString()} transactions in blocks ${b.from}–${b.to} could be protected by double-spend proofs</span></div>
      <div class="row">
        <div><b>${b.pct.nonP2pkh}%</b> spend a contract / non-P2PKH output (never protected)</div>
        <div><b>${b.pct.utxos}%</b> plain payments signed SIGHASH_UTXOS (no proof possible)</div>
        <div><b>${b.pct.weak}%</b> weak signatures (ANYONECANPAY / not ALL)</div>
      </div>
      <h3>Live mempool sample</h3>
      <p>${m.mempool.sampled} unconfirmed transactions checked with their unconfirmed history: <b>${m.mempool.received}</b> received (safe), <b>${m.mempool.pending}</b> pending. Reasons: ${Object.entries(m.mempool.reasons).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || 'none'}.</p>
      <p>Double-spend proofs active on the network right now: <b>${m.dsproofs.active}</b></p>
      <h3>Recent blocks</h3>
      <table class="coins"><tr><th>Block</th><th>Txs</th><th>Protectable</th><th>Contract</th><th>UTXOS-signed</th></tr>${b.recent
        .map((x: any) => `<tr><td>${x.height}</td><td>${x.txs}</td><td>${x.coverable}</td><td>${x.nonP2pkh}</td><td>${x.utxos}</td></tr>`).join('')}</table>
      <p class="muted small">${esc(m.method)} Updated ${new Date(m.updatedAt).toLocaleTimeString()}.</p>
    </div>`));
  };
  load().catch((e) => el.replaceChildren(h(`<p class="err">${esc(e.message)}</p>`)));
  const t = setInterval(() => load().catch(() => {}), 30_000);
  cleanup.push(() => clearInterval(t));
}

function aboutPage() {
  const body = h(`<main><section class="card prose">
    <h2>How Settled decides</h2>
    <p>BCH nodes can warn the network when someone tries to spend the same coins twice (double-spend proofs). That protection only exists when <b>every</b> input of the payment, and of every unconfirmed transaction it depends on, spends a plain P2PKH output with a SIGHASH_ALL signature. Settled walks that whole history and applies the same rules as Bitcoin Cash Node's <code>getdsproofscore</code>:</p>
    <ul>
      <li><b>Received</b> (score 1): every input protectable, no double-spend proof, all servers agree.</li>
      <li><b>Pending</b> (score 0 or 0.25): something in the history is a smart contract, is signed SIGHASH_UTXOS / ANYONECANPAY / not ALL, already has a double-spend proof, or servers disagree.</li>
      <li><b>Confirmed</b>: in a block. <b>Settled</b>: 10+ blocks.</li>
    </ul>
    <p>The states and wording follow <a href="https://bitcoincashresearch.org/t/chip-2025-11-unsettled-inputs-break-zero-confirmation-transactions/1704" target="_blank" rel="noopener">CHIP-2025-11 "Unsettled Inputs Break Zero-confirmation Transactions"</a>. Settled is an implementation of it.</p>
    <h3>Why WizardConnect payments show "Pending"</h3>
    <p>The WizardConnect protocol requires wallets to sign with SIGHASH_ALL|UTXOS. BCHN's double-spend proof code does not support SIGHASH_UTXOS ("SIGHASH_UTXOS is not currently supported by dsproof"), so no proof can ever be made for these payments. Settled shows this honestly instead of pretending they are instant.</p>
    <h3>For developers</h3>
    <p><code>npm install settled-core</code>, or call the API: <code>GET /v1/tx/&lt;txid&gt;</code>, <code>GET /v1/tx/&lt;txid&gt;/stream</code>, <code>POST /v1/watch</code>.</p>
  </section></main>`);
  shell('#/about', body);
}

function route() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/tx\/([0-9a-f]{64})/i);
  if (m) return checkPage(m[1]);
  if (hash.startsWith('#/pay')) return payPage();
  if (hash.startsWith('#/merchant')) return merchantPage();
  if (hash.startsWith('#/monitor')) return monitorPage();
  if (hash.startsWith('#/about')) return aboutPage();
  return checkPage();
}
window.addEventListener('hashchange', route);
route();
