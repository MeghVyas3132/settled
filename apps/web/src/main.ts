import QRCode from 'qrcode';
import './style.css';
import { broadcast, getAddress, getCoins, getMonitor, getTx, streamTx, type Coin, type Report } from './api';
import { BANNER, EXPLORER, MERCHANT, PROOF } from './config';
import { esc, h, MARK, reportCard, short, STATE_COPY, statePill, terminal } from './ui';
import { WizardWallet } from './wallet';

const app = document.getElementById('app')!;
let cleanup: (() => void)[] = [];
const runCleanup = () => { cleanup.forEach((f) => f()); cleanup = []; };

/** The app (tool) shell: a sidebar, kept visually separate from the marketing landing. */
function appShell(active: string, body: HTMLElement) {
  runCleanup();
  const items = [['#/check', 'Check a payment'], ['#/pay', 'Demo checkout'], ['#/merchant', 'Merchant'], ['#/monitor', 'Network monitor'], ['#/about', 'How it works']];
  const sidebar = h(`<aside class="sidebar">
    <a href="#/" class="brand">${MARK}<b>Settled</b></a>
    <nav>${items.map(([href, label]) => `<a href="${href}" class="${href === active ? 'on' : ''}">${label}</a>`).join('')}</nav>
    <div class="foot">
      <span class="stat" id="sstat"><span class="dot"></span>reading mainnet…</span>
      <a href="#/" class="back">← Back to site</a>
    </div>
  </aside>`);
  const main = h(`<div class="app-main"><div class="inner"></div></div>`);
  main.querySelector('.inner')!.append(body);
  const root = h(`<div class="app"></div>`);
  root.append(sidebar, main);
  app.replaceChildren(root);
  getMonitor().then((m) => {
    if (m?.blocks?.pct) sidebar.querySelector('#sstat')!.innerHTML = `<span class="dot"></span><b>${m.blocks.pct.coverable}%</b>&nbsp;provable now`;
  }).catch(() => sidebar.querySelector('#sstat')?.remove());
}

const isTxid = (v: string) => /^[0-9a-f]{64}$/i.test(v);

/* ---------- line-art SVG graphics (blueprint / isometric) ---------- */
const isoPt = (gx: number, gy: number, cx: number, cy: number, tw: number, th: number): [number, number] =>
  [cx + (gx - gy) * tw / 2, cy + (gx + gy) * th / 2];

function isoBox(gx: number, gy: number, hgt: number, o: { cx: number; cy: number; tw: number; th: number }, accent: boolean, dot: string): string {
  const p = (dx: number, dy: number, dz: number): [number, number] => { const [x, y] = isoPt(gx + dx, gy + dy, o.cx, o.cy, o.tw, o.th); return [x, y - dz]; };
  const t = [p(-0.5, -0.5, hgt), p(0.5, -0.5, hgt), p(0.5, 0.5, hgt), p(-0.5, 0.5, hgt)];
  const bFront = p(0.5, 0.5, 0), bRight = p(0.5, -0.5, 0), bLeft = p(-0.5, 0.5, 0), c = p(0, 0, hgt);
  const st = accent ? '#2d33f2' : '#20242b', sw = accent ? 1.6 : 1.1;
  const poly = (pts: [number, number][]) => pts.map((a) => `${a[0].toFixed(1)},${a[1].toFixed(1)}`).join(' ');
  return `<polygon points="${poly([t[3], t[2], bFront, bLeft])}" fill="#ecedf1" stroke="${st}" stroke-width="${sw}"/>`
    + `<polygon points="${poly([t[1], t[2], bFront, bRight])}" fill="#f5f6f3" stroke="${st}" stroke-width="${sw}"/>`
    + `<polygon points="${poly(t)}" fill="#fff" stroke="${st}" stroke-width="${sw}"/>`
    + `<circle cx="${c[0].toFixed(1)}" cy="${(c[1] + 1).toFixed(1)}" r="4" fill="${dot}"/>`;
}

/** Isometric settlement-network graphic — a payment and its ancestors on a grid. */
function isoScene(): string {
  const o = { cx: 360, cy: 150, tw: 150, th: 75 }, N = 4;
  let grid = '';
  for (let i = 0; i <= N; i++) {
    const a = isoPt(i, 0, o.cx, o.cy, o.tw, o.th), b = isoPt(i, N, o.cx, o.cy, o.tw, o.th);
    const c = isoPt(0, i, o.cx, o.cy, o.tw, o.th), d = isoPt(N, i, o.cx, o.cy, o.tw, o.th);
    grid += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/><line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${d[0].toFixed(1)}" y2="${d[1].toFixed(1)}"/>`;
  }
  const tc = (gx: number, gy: number, hz: number): [number, number] => { const [x, y] = isoPt(gx, gy, o.cx, o.cy, o.tw, o.th); return [x, y - hz]; };
  const c1 = tc(1, 1, 56), c2 = tc(3, 1, 36), c3 = tc(1, 3, 36), c4 = tc(3, 3, 46);
  const line = (a: [number, number], b: [number, number]) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`;
  const conn = `<g stroke="#2d33f2" stroke-width="1.3" stroke-dasharray="3 5" opacity="0.6">${line(c1, c2)}${line(c1, c3)}${line(c1, c4)}</g>`;
  const boxes = isoBox(1, 1, 56, o, true, '#1f9d63') + isoBox(3, 1, 36, o, false, '#1f9d63') + isoBox(1, 3, 36, o, false, '#c16a2a') + isoBox(3, 3, 46, o, false, '#1f9d63');
  return `<svg class="iso" viewBox="0 0 720 440" fill="none" aria-hidden="true"><g stroke="#dcdcd6" stroke-width="1">${grid}</g>${conn}${boxes}</svg>`;
}

/** Card line-art: a small ancestor graph. */
function icoTree(): string {
  return `<svg class="ico" viewBox="0 0 120 120" fill="none" stroke="#20242b" stroke-width="1.4" aria-hidden="true">
    <path d="M60 24 L34 58 M60 24 L86 58 M34 64 L22 96 M34 64 L46 96 M86 64 L74 96 M86 64 L98 96"/>
    <circle cx="34" cy="60" r="6"/><circle cx="86" cy="60" r="6"/><circle cx="22" cy="100" r="5"/><circle cx="46" cy="100" r="5"/><circle cx="74" cy="100" r="5"/><circle cx="98" cy="100" r="5"/>
    <circle cx="60" cy="22" r="7" fill="#2d33f2" stroke="none"/></svg>`;
}

/** Card line-art: a radial scoring burst (4-point star of dots). */
function icoBurst(): string {
  let d = '';
  const cx = 60, cy = 60, rays = 58;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2, star = 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2 * a)), 1.6);
    for (let r = 12; r < 52; r += 4.5) {
      const rr = r * star, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, s = 0.6 + (r / 52) * 0.7;
      d += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(1)}"/>`;
    }
  }
  return `<svg class="ico" viewBox="0 0 120 120" fill="#20242b" aria-hidden="true">${d}<circle cx="60" cy="60" r="2.6" fill="#2d33f2"/></svg>`;
}

/** Card line-art: concentric verdict rings. */
function icoRings(): string {
  return `<svg class="ico" viewBox="0 0 120 120" fill="none" stroke="#20242b" stroke-width="1.3" aria-hidden="true">
    <circle cx="60" cy="60" r="11"/><circle cx="60" cy="60" r="23" opacity="0.7"/><circle cx="60" cy="60" r="35" opacity="0.45"/><circle cx="60" cy="60" r="47" opacity="0.24"/>
    <circle cx="60" cy="60" r="4.5" fill="#2d33f2" stroke="none"/></svg>`;
}

/** GSAP + Lenis smooth scroll and scroll reveals. Lazy-loaded; torn down on route change. */
async function mountScroll(root: HTMLElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [gsapMod, stMod, lenisMod] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('lenis')]);
  const gsap = gsapMod.default ?? (gsapMod as any).gsap;
  const ScrollTrigger = (stMod as any).ScrollTrigger ?? stMod.default;
  const Lenis = lenisMod.default;
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ duration: 1.05, autoRaf: true });
  lenis.on('scroll', ScrollTrigger.update);

  if (!reduce) {
    gsap.utils.toArray<HTMLElement>('[data-rev]').forEach((el) => {
      gsap.from(el, { opacity: 0, y: 26, duration: 0.7, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    root.querySelectorAll<HTMLElement>('[data-rev-group]').forEach((grp) => {
      gsap.from(grp.children, { opacity: 0, y: 26, duration: 0.55, ease: 'power2.out', stagger: 0.08, scrollTrigger: { trigger: grp, start: 'top 86%', once: true } });
    });
  }
  root.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    const id = el.dataset.scroll!;
    if (id === 'top') lenis.scrollTo(0);
    else { const t = root.querySelector<HTMLElement>('#' + id); if (t) lenis.scrollTo(t, { offset: -16 }); }
  }));
  requestAnimationFrame(() => ScrollTrigger.refresh());
  cleanup.push(() => { ScrollTrigger.getAll().forEach((s: any) => s.kill()); lenis.destroy(); });
}

/* ============================================================
   Landing
   ============================================================ */
function landingPage() {
  runCleanup();
  const body = h(`<main class="landing">
    <section class="hero gridbg">
      <header class="site-head">
        <a href="#/" class="brand" data-scroll="top">${MARK}<b>Settled</b></a>
        <nav class="site-nav"><a data-scroll="how">How it works</a><a data-scroll="proof">Proof</a><a data-scroll="dev">Developers</a></nav>
        <span class="sp"></span>
        <a class="btn open-app" href="#/check">Open the app</a>
      </header>
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="kicker">[ CHIP-2025-11 · Bitcoin Cash ]</span>
          <h1>Settlement certainty for Bitcoin Cash.</h1>
          <p class="hero-sub">Know the moment a zero-confirmation payment is really safe to hand over the goods.</p>
          <div class="hero-cta">
            <a class="btn" href="#/check">Launch the app</a>
            <button class="btn-ghost" data-scroll="how">See how it works</button>
          </div>
          <span class="hero-note" id="note"><span class="dot"></span>Reading mainnet…</span>
        </div>
        <div class="hero-art">${isoScene()}</div>
      </div>
    </section>

    <section class="block capsec" id="how">
      <div class="sec-head" data-rev>
        <div><span class="kicker">[ How it works ]</span><h2 class="s-head">A verdict you can actually trust.</h2></div>
        <p class="sec-desc">Settled checks a payment against the network's own rules and answers the one question at the counter: is it safe to hand over the goods yet?</p>
      </div>
      <div class="cards" data-rev-group>
        <article class="card3"><div class="art">${icoTree()}</div><h3>Walk the history</h3><p>It follows every unconfirmed ancestor the payment depends on — not just the payment itself.</p><a class="more" href="#/about">Read more →</a></article>
        <article class="card3"><div class="art">${icoBurst()}</div><h3>Score every input</h3><p>Each input is graded exactly like a Bitcoin Cash node's getdsproofscore. One weak link pulls the whole payment to pending.</p><a class="more" href="#/about">Read more →</a></article>
        <article class="card3"><div class="art">${icoRings()}</div><h3>A live verdict</h3><p>Pending, Received, Confirmed or Settled — streamed live, with the plain reason behind it.</p><a class="more" href="#/check">Read more →</a></article>
      </div>
    </section>

    <section class="block" id="gap">
      <div class="sec-head" data-rev>
        <div><span class="kicker">[ The gap ]</span><h2 class="s-head">Why “instant” usually isn't safe.</h2></div>
        <p class="sec-desc">Zero-conf only holds when the network can raise a double-spend proof. Three things break that today — and nothing at the counter says so.</p>
      </div>
      <div class="facts" data-rev-group>
        <div class="fact"><div class="fig bad">51%</div><h3>spend a contract or non-standard output</h3><p>A double-spend proof can never cover these, so more than half of mainnet traffic has no zero-conf protection at all.</p></div>
        <div class="fact"><div class="fig">every</div><h3>WizardConnect payment is unprovable</h3><p>The protocol requires signing with SIGHASH_UTXOS, which a Bitcoin Cash node cannot build a proof for. Score 0, every time.</p></div>
        <div class="fact"><div class="fig">none</div><h3>of today's wallets warn the merchant</h3><p>Point-of-sale screens show “received” the instant a payment lands, whether or not the network could ever protect it.</p></div>
      </div>
    </section>

    <section class="block" id="proof">
      <div class="sec-head" data-rev>
        <div><span class="kicker">[ On mainnet · 21 Nov 2026 ]</span><h2 class="s-head">The same 1,000 sats, paid two ways.</h2></div>
        <p class="sec-desc">One wallet paid the demo merchant twice. Settled read each payment before it was mined — one safe to accept, one not.</p>
      </div>
      <div class="proof" id="proofgrid" data-rev-group></div>
    </section>

    <section class="block" id="rules-sec">
      <div class="sec-head" data-rev>
        <div><span class="kicker">[ The rules ]</span><h2 class="s-head">It decides like a Bitcoin Cash node.</h2></div>
        <p class="sec-desc">Settled scores each input exactly like BCHN's <code>getdsproofscore</code>. Anything the network cannot protect pulls the whole payment to “pending”.</p>
      </div>
      <div class="rulebook" id="rules" data-rev></div>
    </section>

    <section class="cta gridbg" id="dev">
      <div class="cta-inner" data-rev>
        <span class="kicker">[ Ready when you are ]</span>
        <h2 class="cta-head">Know when the money is really yours.</h2>
        <p class="cta-sub">Paste a transaction, run the live demo checkout on mainnet, or drop <code>settled-core</code> into your own point-of-sale.</p>
        <div class="cta-acts"><a class="btn" href="#/check">Launch the app</a><span class="cmd">npm i <b>settled-core</b></span></div>
      </div>
      <div class="cta-art">${isoScene()}</div>
    </section>

    <footer class="site-footer">
      <div class="foot-brand"><a href="#/" class="brand" data-scroll="top">${MARK}<b>Settled</b></a><p>A CHIP-2025-11 reference implementation, built at BCH BLAZE 2026.</p></div>
      <div class="foot-cols">
        <div><h4>Product</h4><a href="#/check">Check a payment</a><a href="#/pay">Demo checkout</a><a href="#/merchant">Merchant</a><a href="#/monitor">Network monitor</a></div>
        <div><h4>Resources</h4><a href="#/about">How it works</a><a href="https://www.npmjs.com/package/settled-core" target="_blank" rel="noopener">settled-core · npm</a><a href="${BANNER.repo}" target="_blank" rel="noopener">Source</a><a href="${BANNER.slides}" target="_blank" rel="noopener">Presentation</a></div>
      </div>
    </footer>
  </main>`);
  app.replaceChildren(body);
  mountScroll(body);

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
  body.querySelector('#proofgrid')!.append(
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
  appShell('#/check', body);
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
  appShell('#/pay', body);
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
  appShell('#/merchant', body);
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
  appShell('#/monitor', body);
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
  appShell('#/about', body);
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
