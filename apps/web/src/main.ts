import QRCode from 'qrcode';
import './style.css';
import { broadcast, getAddress, getCoins, getMonitor, getTx, streamTx, type Coin, type Report } from './api';
import { BANNER, EXPLORER, MERCHANT, PROOF } from './config';
import { esc, h, MARK, nav, reportCard, short, STATE_COPY, statePill, terminal } from './ui';
import { WizardWallet } from './wallet';

const app = document.getElementById('app')!;
let cleanup: (() => void)[] = [];

function shell(active: string, body: HTMLElement) {
  cleanup.forEach((f) => f());
  cleanup = [];
  const top = h(`<div class="topbar">
    <a href="#/" class="brand">${MARK}<span class="bt"><b>Settled</b><em>Zero-conf settlement</em></span></a>
    ${nav(active).outerHTML}
    <a class="pill-link" href="#/pay">Open the demo</a>
  </div>`);
  app.replaceChildren(top, body);
}

const isTxid = (v: string) => /^[0-9a-f]{64}$/i.test(v);

/** Frosted settlement spectrum — a soft blurred histogram that dissolves into the cream. */
function spectrum(): string {
  const n = 96, W = 1200, H = 620, bw = W / n;
  let bars = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wave = 0.5 + 0.35 * Math.sin(i * 0.5) * Math.sin(i * 0.17 + 1.3) + 0.15 * Math.sin(i * 1.1);
    const hgt = (150 + wave * 300 + t * 140) * (0.72 + 0.28 * t); // present across, leaning right
    const op = (0.40 + 0.5 * wave) * (0.5 + 0.5 * t);
    bars += `<rect x="${(i * bw + 1.5).toFixed(1)}" y="${(H - hgt).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${hgt.toFixed(1)}" fill="url(#sg)" opacity="${op.toFixed(2)}"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="sg" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#8fb0e2"/><stop offset="0.45" stop-color="#aec8ea"/>
        <stop offset="0.8" stop-color="#cfe0d8"/><stop offset="1" stop-color="#cfe0d8" stop-opacity="0"/>
      </linearGradient>
      <filter id="sb" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <g filter="url(#sb)">${bars}</g>
  </svg>`;
}

/* ============================================================
   Landing
   ============================================================ */
function landingPage() {
  const body = h(`<main class="landing">
    <section class="hero">
      <div class="spectrum" id="spectrum"></div>
      <div class="hero-inner">
        <h1>Certainty for every Bitcoin Cash payment, the instant it arrives.</h1>
        <p class="hero-lede">Settled checks a payment and its whole unconfirmed history against the same rules a Bitcoin Cash node uses, and tells the merchant the moment it is genuinely safe to hand over the goods.</p>
        <form id="hf" class="hero-form"><input id="ht" placeholder="Paste a transaction id" spellcheck="false" autocomplete="off"/><button>Check</button></form>
        <span class="hero-note" id="note"><span class="dot"></span>Reading mainnet…</span>
      </div>
    </section>

    <section class="block">
      <h2 class="statement">Zero-conf only holds when the network can raise a double-spend proof. For most payments, <span class="u">it cannot</span>.</h2>
      <p class="section-lede">That protection needs every input — and every unconfirmed transaction behind it — to spend a plain output with a standard signature. Three things break it today, and nothing at the counter says so.</p>
      <div class="facts">
        <div class="fact"><div class="fig bad">51%</div><div><h3>spend a contract or non-standard output</h3><p>A double-spend proof can never cover these, so more than half of mainnet traffic has no zero-conf protection at all.</p></div></div>
        <div class="fact"><div class="fig">every</div><div><h3>WizardConnect payment is unprovable</h3><p>The protocol requires signing with SIGHASH_UTXOS, which a Bitcoin Cash node cannot build a proof for. The protection score is 0, every time.</p></div></div>
        <div class="fact"><div class="fig">none</div><div><h3>of today’s wallets warn the merchant</h3><p>Point-of-sale screens show “received” the instant a payment lands, whether or not the network could ever protect it.</p></div></div>
      </div>
    </section>

    <section class="block">
      <h2 class="statement">The same wallet paid the same 1,000 sats two ways.</h2>
      <p class="section-lede">On mainnet, 21 November 2026. Settled read each payment before it was mined — one safe to accept, one not.</p>
      <div class="proof" id="proof"></div>
    </section>

    <section class="block">
      <h2 class="statement">It decides with the same rules a Bitcoin Cash node uses.</h2>
      <p class="section-lede">Settled walks every unconfirmed ancestor and scores each input exactly like BCHN’s <code>getdsproofscore</code>. Anything the network cannot protect pulls the whole payment to “pending”.</p>
      <div class="rulebook" id="rules"></div>
      <p style="margin-top:30px"><a class="textlink" href="#/about">Read the full method</a></p>
    </section>

    <section class="block">
      <div class="signoff">
        <div>
          <h2>Put the settlement check in your own checkout.</h2>
          <p>The engine ships as a TypeScript library and a hosted API — the same one answering this page.</p>
        </div>
        <div class="acts">
          <div class="cmd">npm i <b>settled-core</b></div>
          <a class="btn" href="#/pay">Open the demo checkout</a>
          <a class="textlink" href="#/check">Check a payment</a>
        </div>
      </div>
      <div class="site-footer">
        <span>Settled — a CHIP-2025-11 reference implementation, built at BCH BLAZE 2026. <a href="${BANNER.slides}" target="_blank" rel="noopener">Presentation</a></span>
        <div class="links"><a href="#/check">Check</a><a href="#/pay">Demo</a><a href="#/merchant">Merchant</a><a href="#/monitor">Monitor</a><a href="#/about">How it works</a><a href="${BANNER.repo}" target="_blank" rel="noopener">Source</a></div>
      </div>
    </section>
  </main>`);
  shell('#/', body);
  (body.querySelector('#spectrum') as HTMLElement).innerHTML = spectrum();

  // Hero form → deep link
  body.querySelector('#hf')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (body.querySelector('#ht') as HTMLInputElement).value.trim();
    if (isTxid(v)) location.hash = `#/tx/${v}`;
    else location.hash = '#/check';
  });

  // Live mainnet note
  getMonitor().then((m) => {
    const b = m?.blocks;
    const el = body.querySelector('#note')!;
    if (!b?.txs) return el.remove();
    el.innerHTML = `<span class="dot"></span><b>${b.pct.coverable}%</b>&nbsp;of Bitcoin Cash mainnet is zero-conf provable right now`;
  }).catch(() => body.querySelector('#note')?.remove());

  // Proof — two comparison panels
  const panel = (p: typeof PROOF.wizard | typeof PROOF.normal, verdict: string) =>
    h(`<div class="panel ${p.state}">
      <div class="ptop">
        <p class="how">${esc(p.how)}</p>
        <div class="verdict">${verdict}</div>
        <p class="vsub">${esc(p.line)}</p>
      </div>
      <div class="meta">
        <div class="r"><span>Verdict</span><span class="v">${STATE_COPY[p.state].label}, score ${p.score}</span></div>
        <div class="r"><span>Signature</span><span class="v">${esc(p.sighash)}</span></div>
        <div class="r"><span>Transaction</span><a class="v" href="${EXPLORER}${p.txid}" target="_blank" rel="noopener">${short(p.txid)}</a></div>
      </div>
    </div>`);
  body.querySelector('#proof')!.append(
    panel(PROOF.wizard, 'Hold the goods'),
    panel(PROOF.normal, 'Safe to hand over'),
  );

  // Rulebook clauses
  const rules: [string, string, Report['state']][] = [
    ['Spends a contract or non-P2PKH output', '0', 'pending'],
    ['Signed SIGHASH_UTXOS (WizardConnect, many token wallets)', '0', 'pending'],
    ['A double-spend proof already exists', '0', 'pending'],
    ['Independent servers disagree it is in the mempool', '0', 'pending'],
    ['ANYONECANPAY, or not SIGHASH_ALL', '0.25', 'pending'],
    ['More than 1,000 unconfirmed ancestors', '0.25', 'pending'],
    ['None of the above', '1', 'received'],
    ['In a block (10+ blocks is settled)', '1', 'confirmed'],
  ];
  body.querySelector('#rules')!.innerHTML = rules
    .map(([f, s, st]) => `<div class="clause"><span class="finding">${esc(f)}</span><span class="sc">score ${s}</span>${statePill(st)}</div>`).join('');
}

/* ============================================================
   Check a payment (tool)
   ============================================================ */
function checkPage(initial?: string) {
  const body = h(`<main>
    <div class="page-head">
      <h1>Check a payment</h1>
      <p>Paste any BCH transaction id. You get the state, a plain-language reason for every problem, the unconfirmed ancestor tree, and what each independent server sees. It updates live until the payment settles.</p>
    </div>
    <form id="f" class="checkbar"><input id="t" placeholder="Paste a transaction id" spellcheck="false" autocomplete="off"/><button>Check</button></form>
    <div id="out"></div>
  </main>`);
  shell('#/check', body);
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
    if (isTxid(v)) { location.hash = `#/tx/${v}`; } else out.replaceChildren(h('<p class="err">That is not a transaction id (64 hex characters).</p>'));
  });
  if (initial) { (body.querySelector('#t') as HTMLInputElement).value = initial; run(initial); }
}

/* ============================================================
   Demo checkout
   ============================================================ */
function payPage() {
  const amount = 1000;
  const body = h(`<main>
    <div class="page-head">
      <h1>Demo checkout</h1>
      <p>A real mainnet payment of ${amount.toLocaleString()} sats (about $0.002) to the demo merchant. Pay it two ways and watch what the merchant terminal would show for each.</p>
    </div>
    ${MERCHANT ? '' : '<p class="err">Demo merchant address not configured.</p>'}
    <section class="card">
      <div class="two">
        <div class="opt">
          <h3>A · Scan with any BCH wallet</h3>
          <p class="small muted">A normal wallet send is signed SIGHASH_ALL, which BCH nodes can protect with double-spend proofs.</p>
          <canvas id="qr"></canvas>
          <p class="small"><code id="uri"></code></p>
        </div>
        <div class="opt">
          <h3>B · Connect a wallet (WizardConnect)</h3>
          <p class="small muted">Cashonize, Paytaca or Selene. Settled picks only coins that are safe to spend, then asks your wallet to sign.</p>
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
  return terminal(r.state, big, statePill(r.state));
}

/* ============================================================
   Merchant dashboard
   ============================================================ */
function merchantPage() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const addr = q.get('address') ?? MERCHANT;
  const body = h(`<main>
    <div class="page-head"><h1>Merchant dashboard</h1><p>Every payment to an address, with its live settlement state and the reason behind it.</p></div>
    <section class="card">
      <form id="f" class="checkbar"><input id="a" value="${esc(addr)}" placeholder="Your BCH address" spellcheck="false"/><button>Watch</button></form>
      <div id="list"></div>
    </section>
  </main>`);
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

/* ============================================================
   Network monitor
   ============================================================ */
async function monitorPage() {
  const body = h(`<main>
    <div class="page-head"><h1>Network monitor</h1><p>How much of Bitcoin Cash traffic is zero-conf safe, block by block, plus a live mempool sample and the double-spend proofs active right now.</p></div>
    <section class="card"><div id="m" class="muted">Loading…</div></section>
  </main>`);
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

/* ============================================================
   How it works
   ============================================================ */
function aboutPage() {
  const body = h(`<main>
    <div class="page-head"><h1>How Settled decides</h1></div>
    <section class="card prose">
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
  if (hash.startsWith('#/check')) return checkPage();
  if (hash.startsWith('#/pay')) return payPage();
  if (hash.startsWith('#/merchant')) return merchantPage();
  if (hash.startsWith('#/monitor')) return monitorPage();
  if (hash.startsWith('#/about')) return aboutPage();
  return landingPage();
}
window.addEventListener('hashchange', route);
route();
