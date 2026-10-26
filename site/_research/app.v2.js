/* OTTO — site. No dependencies: one scroll handler, an on-demand rAF for the eyes, a few observers.
   Every figure on the page comes from the example month below, formatted by the rules of
   src/domain/money.ts and drawn by the geometry of src/ui/chart/BalanceCurve.tsx. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const root = document.documentElement;
  const RM = root.classList.contains('rm');
  const FINE = matchMedia('(pointer: fine)').matches;
  const small = () => innerWidth <= 860;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ── money, exactly as src/domain/money.ts writes it ─────────────────────── */
  const NB = ' ';
  const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const parts = (c) => {
    const a = Math.abs(Math.round(c));
    return { sign: c < 0 && a > 0 ? '−' : '', whole: group(Math.floor(a / 100)), cents: String(a % 100).padStart(2, '0') };
  };
  const brl = (c) => { const p = parts(c); return `${p.sign}R$${NB}${p.whole},${p.cents}`; };
  const brlShort = (c) => { const r = Math.round(Math.abs(c) / 100); return `${c < 0 && r ? '−' : ''}R$${NB}${group(r)}`; };
  const flow = (c, dir) => (dir === 'in' ? '+' : '') + brl(Math.abs(c));
  /** Write a figure into an .amt-like element (sym / whole / cts); the sign wears the figure's tone. */
  function setAmt(el, c, { cents = true, dots = false } = {}) {
    const v = cents ? c : Math.round(c / 100) * 100;
    const p = parts(v);
    const sym = el.querySelector('.sym'), wh = el.querySelector('.whole'), ct = el.querySelector('.cts');
    if (sym) sym.innerHTML = p.sign ? `<span class="sg">${p.sign}</span>R$` : 'R$';
    if (wh) { if (dots) wh.innerHTML = p.whole.replace(/\./g, '<span class="dt">.</span>'); else wh.textContent = p.whole; }
    if (ct) ct.textContent = ',' + p.cents;
  }
  function tween(from, to, dur, fn, ease = easeOut) {
    if (RM || dur <= 0) { fn(to, 1); return Promise.resolve(); }
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / dur, 0, 1);
        fn(lerp(from, to, ease(t)), t);
        t < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const once = (el, fn, threshold = 0.35) => {
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold });
    io.observe(el);
  };

  /* ── the example month ───────────────────────────────────────────────────── */
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WK = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const now = new Date();
  const Y = now.getFullYear(), M = now.getMonth();
  const N = new Date(Y, M + 1, 0).getDate();
  const TODAY = 12;
  const pad = (n) => String(n).padStart(2, '0');

  // What already happened (the record) and what the rules say will (the forecast). Cents.
  const OPENING = 41230;
  const REC = [
    [1, 'Salário', 'Renda', 380000, 'in', 1], [1, 'Padaria', 'Alimentação', 1840],
    [2, 'Almoço', 'Alimentação', 4250], [2, 'Uber', 'Transporte', 2390],
    [3, 'Aluguel', 'Moradia', 125000, 'out', 1], [3, 'Café', 'Alimentação', 980],
    [4, 'Mercado', 'Mercado', 18735], [4, 'Almoço', 'Alimentação', 3800],
    [5, 'Farmácia', 'Saúde', 5670], [5, 'Café', 'Alimentação', 1120],
    [6, 'Mercado', 'Mercado', 26418], [6, 'Uber', 'Transporte', 3140],
    [7, 'Almoço', 'Alimentação', 4790], [7, 'Cinema', 'Lazer', 6800],
    [8, 'Combustível', 'Transporte', 19800], [8, 'Café', 'Alimentação', 850],
    [9, 'Internet', 'Casa', 12990], [9, 'Almoço', 'Alimentação', 3640],
    [10, 'Fatura Nubank', 'Cartão', 77589, 'out', 1],
    [11, 'Mercado', 'Mercado', 14266], [11, 'Uber', 'Transporte', 2780],
    [12, 'Energia', 'Casa', 21460, 'out', 1], [12, 'Almoço', 'Alimentação', 4490],
  ].map(([d, t, c, v, dir = 'out', big = 0]) => ({ d, t, c, v, dir, big, rec: true }));
  const FC = [
    [14, 'Notebook', 'Dívidas', 29158], [15, 'Academia', 'Saúde', 11900],
    [18, 'Spotify', 'Assinaturas', 2190], [20, 'Netflix', 'Assinaturas', 4490],
    [22, 'Empréstimo pessoal', 'Dívidas', 43000], [28, 'Freela', 'Renda', 120000, 'in'],
  ].map(([d, t, c, v, dir = 'out']) => ({ d, t, c, v, dir, big: 1, rec: false }));
  const EVENTS = [...REC, ...FC];

  function monthPoints(extra = 0) {
    // Balance at the end of each day. `extra` is spending added today.
    const pts = [];
    let b = OPENING;
    for (let d = 1; d <= N; d++) {
      for (const e of EVENTS) if (e.d === d) b += e.dir === 'in' ? e.v : -e.v;
      if (d === TODAY) b -= extra;
      pts.push(b);
    }
    return pts;
  }
  const PTS = monthPoints();
  const LO = Math.min(...PTS), HI = Math.max(...PTS);
  const TROUGH = PTS.indexOf(LO) + 1;
  const balanceAt = (d) => { const i = clamp(d - 1, 0, N - 1); const f = Math.floor(i); return f >= N - 1 ? PTS[N - 1] : lerp(PTS[f], PTS[f + 1], i - f); };

  /* ── wordmark: the O's are eyes ──────────────────────────────────────────── */
  const MARKS = [];
  const pointer = { x: innerWidth / 2, y: innerHeight * 0.3, seen: false, at: 0 };
  let away = false, raf = 0;
  const kick = () => { if (!raf && !RM) raf = requestAnimationFrame(frame); };
  const frame = (t) => { raf = 0; if (markFrame(t)) kick(); };

  function mountWordmarks() {
    $$('[data-wordmark]').forEach((el) => {
      const h = +el.dataset.h || 20;
      const hidden = el.closest('[aria-label]') || el.closest('[aria-hidden="true"]');
      const sleep = el.hasAttribute('data-sleep');
      const lid = (cx) => `<path class="wm-lid" d="M${cx - 33} 42Q${cx} 64 ${cx + 33} 42" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-opacity="${sleep ? 1 : 0}"/>`;
      // Pupils are circles moved and squashed by one transform each: no geometry is rewritten.
      const eye = (cx) => `<g class="wm-eye" transform="translate(${cx} 50) scale(1 ${sleep ? 0 : 1})"><circle r="13" fill="currentColor"/></g>`;
      el.innerHTML = `<svg viewBox="0 0 388 100" width="${(h * 3.88).toFixed(1)}" height="${h}" ${hidden ? 'aria-hidden="true"' : 'role="img" aria-label="OTTO"'} focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="9"><circle cx="50" cy="50" r="45.5"/><line x1="158" y1="0" x2="158" y2="100"/><line x1="230" y1="0" x2="230" y2="100"/><circle cx="338" cy="50" r="45.5"/><line x1="122" y1="4.5" x2="266" y2="4.5"/></g>
        ${eye(50)}${eye(338)}${lid(50)}${lid(338)}</svg>`;
      const svg = el.firstElementChild;
      const m = {
        el, svg, sleep, big: el.hasAttribute('data-big'),
        eyes: $$('.wm-eye', svg), lids: $$('.wm-lid', svg),
        g: { x: 0, y: 0, vx: 0, vy: 0 }, shut: { x: sleep ? 1 : 0, v: 0, t: sleep ? 1 : 0 },
        blink0: -1, double: false, visible: false, glance: null,
      };
      MARKS.push(m);
      if (el.dataset.watch) el.__mark = m;
    });
    if (RM) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const m = MARKS.find((k) => k.el === e.target);
      m.visible = e.isIntersecting;
      if (m.visible) { scheduleBlink(m); kick(); }
    }), { threshold: 0.1 });
    MARKS.forEach((m) => io.observe(m.el));
  }
  // Blinks only where there is a pointer to be alive for; a touch screen gets a still, open mark.
  function scheduleBlink(m) {
    if (!FINE || m.blinkTimer) return;
    m.blinkTimer = setTimeout(() => {
      m.blinkTimer = 0;
      if (m.visible && !document.hidden && m.shut.x < 0.05) { m.blink0 = performance.now(); m.double = Math.random() < 0.25; kick(); }
      if (m.visible) scheduleBlink(m);
    }, 2800 + Math.random() * 4200);
  }
  function markFrame(t) {
    let busy = FINE && pointer.seen && t - pointer.at < 600;
    for (const m of MARKS) {
      if (!m.visible) continue;
      let tx = 0, ty = 0;
      if (m.glance != null) { tx = m.glance * 9; ty = 3; busy = true; }
      else if (FINE && pointer.seen) {
        const r = m.svg.getBoundingClientRect();
        const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = clamp(dist / (m.big ? 420 : 260), 0, 1);
        tx = (dx / dist) * reach * 9; ty = (dy / dist) * reach * 15;
      }
      // Keep the pupil inside the ring: an ellipse of reach, not a box.
      const e = Math.hypot(tx / 9, ty / 15);
      if (e > 1) { tx /= e; ty /= e; }
      m.g.vx = (m.g.vx + (tx - m.g.x) * 0.09) * 0.74; m.g.x += m.g.vx;
      m.g.vy = (m.g.vy + (ty - m.g.y) * 0.09) * 0.74; m.g.y += m.g.vy;
      const closing = m.shut.t === 1;
      m.shut.v += (m.shut.t - m.shut.x) * (closing ? 0.2 : 0.11); m.shut.v *= closing ? 0.62 : 0.66; m.shut.x += m.shut.v;

      let lid = 1;
      if (m.blink0 >= 0) {
        const el = t - m.blink0;
        const seq = m.double ? [70, 90, 60, 110] : [75, 130];
        let acc = 0, done = true;
        for (let i = 0; i < seq.length; i++) {
          if (el < acc + seq[i]) { const f = (el - acc) / seq[i]; lid = i % 2 === 0 ? 1 - f : f; done = false; break; }
          acc += seq[i];
        }
        if (done) m.blink0 = -1; else busy = true;
      }
      const sy = Math.max(0, lid * clamp(1 - m.shut.x, 0, 1.35));
      for (let i = 0; i < 2; i++) m.eyes[i].setAttribute('transform', `translate(${((i ? 338 : 50) + m.g.x).toFixed(2)} ${(50 + m.g.y).toFixed(2)}) scale(1 ${sy.toFixed(3)})`);
      const lo = clamp(m.shut.x, 0, 1).toFixed(3);
      for (const l of m.lids) l.setAttribute('stroke-opacity', lo);
      if (Math.abs(m.g.vx) + Math.abs(m.g.vy) > 0.01 || Math.abs(tx - m.g.x) + Math.abs(ty - m.g.y) > 0.05 || Math.abs(m.shut.v) > 0.002 || Math.abs(m.shut.t - m.shut.x) > 0.004) busy = true;
    }
    return busy;
  }
  function setAway(v) {
    if (away === v) return;
    away = v;
    for (const m of MARKS) if (!m.sleep) m.shut.t = v ? 1 : 0;
    kick();
  }

  /* ── reveal ──────────────────────────────────────────────────────────────── */
  function reveals() {
    const els = $$('.rv');
    if (RM || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* ── scroll plumbing ─────────────────────────────────────────────────────── */
  const SCRUBS = [];
  function scrub(el, render) {
    const s = { el, render, p: -1 };
    SCRUBS.push(s);
    if (RM) { s.p = 1; render(1); }
    return s;
  }
  let ticking = false;
  function frameScroll() {
    ticking = false;
    if (RM) return;
    const vh = innerHeight;
    for (const s of SCRUBS) {
      const r = s.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const total = r.height - vh;
      const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      if (Math.abs(p - s.p) > 0.0002) { s.p = p; s.render(p); }
    }
  }
  const requestScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frameScroll); } };

  /* ── hero: the numeral, the month, and the day it goes red ─────────────── */
  function hero() {
    const host = $('#hc');
    const num = $('#hn'), cap = $('#hn-cap'), ev = $('#hn-event'), notif = $('#notif'), say = $('#hero-say');
    const X = (d) => ((d - 1) / (N - 1)) * 1000;                 // viewBox units
    const Yv = (v) => 4 + ((HI - v) / (HI - LO)) * 92;             // percent of the plot
    const P = (d, v) => `${X(d).toFixed(1)},${Yv(v).toFixed(2)}`;
    const rec = PTS.slice(0, TODAY).map((v, i) => P(i + 1, v)).join(' L ');
    const fc = PTS.slice(TODAY - 1).map((v, i) => P(TODAY + i, v)).join(' L ');
    const base = Yv(Math.max(LO, 0)).toFixed(2);
    const NS = 'vector-effect="non-scaling-stroke"';
    const zeroY = Yv(0);
    const LABELS = [
      { d: 3, wide: true }, { d: 10, wide: true }, { d: 14, wide: true }, { d: TROUGH }, { d: 28, wide: true },
    ];
    const lab = (d) => {
      const e = EVENTS.find((k) => k.d === d && k.big);
      const prev = d > 1 ? PTS[d - 2] : OPENING;
      const top = Math.min(Yv(prev), Yv(PTS[d - 1]));
      const cls = ['hc-lab', d >= N - 3 ? 'end' : '', LABELS.find((l) => l.d === d).wide ? 'hide-s-lab' : ''].join(' ');
      return `<span class="${cls}" data-d="${d}" style="left:${(X(d) / 10).toFixed(2)}%;top:${top.toFixed(2)}%">${e.t}<b class="${e.dir === 'in' ? 'pos' : 'neg'}">${e.dir === 'in' ? '+' : ''}${brlShort(e.v)}</b></span>`;
    };
    host.innerHTML = `
      <div class="hc-plot">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id="hc-clip"><rect id="hc-veil" x="-20" y="-20" width="0" height="140"/></clipPath></defs>
          <line x1="0" x2="1000" y1="${zeroY.toFixed(2)}" y2="${zeroY.toFixed(2)}" stroke="#E5484D" stroke-opacity=".45" stroke-width="1" ${NS}/>
          <g opacity=".16">
            <path d="M ${rec}" fill="none" stroke="#F2F4F7" stroke-width="2" ${NS}/>
            <path d="M ${fc}" fill="none" stroke="#9BA1AC" stroke-width="2" stroke-dasharray="4 7" ${NS}/>
          </g>
          <g clip-path="url(#hc-clip)">
            <g id="hc-past">
              <path d="M 0,${base} L ${rec} L ${X(TODAY).toFixed(1)},${base} Z" fill="#F2F4F7" fill-opacity=".07"/>
              <path d="M ${rec}" fill="none" stroke="#F2F4F7" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" ${NS}/>
            </g>
            <path d="M ${fc}" fill="none" stroke="#9BA1AC" stroke-width="2.4" stroke-dasharray="4 7" stroke-linejoin="round" stroke-linecap="round" ${NS}/>
            <line x1="${X(TROUGH).toFixed(1)}" x2="${X(TROUGH).toFixed(1)}" y1="${Yv(LO).toFixed(2)}" y2="${zeroY.toFixed(2)}" stroke="#E5484D" stroke-opacity=".75" stroke-dasharray="2 3" ${NS}/>
          </g>
        </svg>
        <span class="hc-zero" style="top:${zeroY.toFixed(2)}%">R$ 0</span>
        <span class="hc-dot" id="hc-today" style="left:${(X(TODAY) / 10).toFixed(2)}%;top:${Yv(PTS[TODAY - 1]).toFixed(2)}%"></span>
        <span class="hc-scan" id="hc-scan"></span>
        <span class="hc-head" id="hc-head"></span>
        ${LABELS.map((l) => lab(l.d)).join('')}
        <span class="hc-endlab" id="hc-end" style="top:${Yv(PTS[N - 1]).toFixed(2)}%">fim do mês<b>${brlShort(PTS[N - 1])}</b></span>
      </div>
      <div class="hc-axis" aria-hidden="true">
        ${[1, 5, 10, 15, 20, 25].filter((d) => Math.abs(d - TODAY) > 2).map((d) => `<span style="left:${(X(d) / 10).toFixed(2)}%">${pad(d)}</span>`).join('')}
        <span class="today" style="left:${(X(TODAY) / 10).toFixed(2)}%">hoje ${pad(TODAY)}</span>
        <span class="end" style="left:100%">${N}</span>
      </div>`;
    const veil = $('#hc-veil'), past = $('#hc-past'), head = $('#hc-head'), scan = $('#hc-scan'), today = $('#hc-today'), endLab = $('#hc-end');
    const labs = $$('.hc-lab', host);
    let lastK = -1, phase = -1;

    function setHead(d, { showHead = true } = {}) {
      d = clamp(d, 1, N);
      veil.setAttribute('width', (X(d) + 20).toFixed(1));
      const y = Yv(balanceAt(d));
      head.style.cssText = `left:${(X(d) / 10).toFixed(2)}%;top:${y.toFixed(2)}%;display:${showHead && d < N - 0.02 ? '' : 'none'}`;
      scan.style.cssText = `left:${(X(d) / 10).toFixed(2)}%;top:${y.toFixed(2)}%;display:${showHead && d < N - 0.02 ? '' : 'none'}`;
      today.style.display = d >= TODAY - 0.02 ? '' : 'none';
      past.setAttribute('opacity', (1 - 0.55 * clamp((d - TODAY) / 3, 0, 1)).toFixed(3));
      labs.forEach((l) => l.classList.toggle('on', d >= +l.dataset.d - 0.02));
      endLab.classList.toggle('on', d >= N - 0.4);
      notif.classList.toggle('on', d >= TROUGH - 0.05);
      const p = d < TODAY + 0.5 ? 0 : d < TROUGH - 0.05 ? 1 : 2;
      if (p !== phase) {
        phase = p;
        say.classList.toggle('neg', p === 2);
        say.textContent = p === 0 ? 'Role a página e veja o mês se desenhar.' : p === 1 ? 'Tracejado é previsão: cada degrau é uma conta, no dia dela.' : `No dia ${TROUGH} o saldo fica no vermelho: ${brlShort(LO)}.`;
      }
      const k = Math.floor(d + 0.02);
      if (k !== lastK && ev) {
        lastK = k;
        const seen = EVENTS.filter((e) => e.d <= k && (e.big || e.v >= 10000)).slice(-2).reverse();
        ev.innerHTML = seen.map((e) => `<p><b>${e.t}</b><span class="${e.dir === 'in' ? 'pos' : 'neg'}">${flow(e.v, e.dir)}</span> <span class="faint">· dia ${pad(e.d)}${e.rec ? '' : ' · previsto'}</span></p>`).join('');
      }
    }
    function setFigure(d) {
      const v = balanceAt(d), day = Math.round(d);
      setAmt(num, v, { dots: true });
      num.classList.toggle('is-neg', v < 0);
      cap.textContent = day < TODAY ? `saldo no dia ${pad(day)}` : day === TODAY ? `saldo hoje · dia ${pad(TODAY)}` : `previsto para o dia ${pad(day)}`;
    }

    if (RM) {
      // Everything at rest: the whole month drawn, today's figure, the warning already said.
      veil.setAttribute('width', '1040');
      setHead(N, { showHead: false });
      setAmt(num, PTS[TODAY - 1], { dots: true });
      cap.textContent = `saldo hoje · dia ${pad(TODAY)}`;
      return;
    }

    let scrolled = false, entered = false;
    setHead(1);
    // The one authored moment: the line and the figure run from day 1 to today, together, once.
    const enter = () => tween(1, TODAY, 1500, (d) => { if (scrolled) return; setHead(d); setFigure(d); }, easeInOut).then(() => { entered = true; if (!scrolled) { setHead(TODAY); setFigure(TODAY); } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(enter, 120)); else setTimeout(enter, 300);

    scrub($('#scrub-hero'), (p) => {
      if (p <= 0.001) { if (scrolled && entered) { setHead(TODAY); setFigure(TODAY); } return; }
      scrolled = true;
      const d = TODAY + clamp(p / 0.82, 0, 1) * (N - TODAY);
      setHead(d); setFigure(d);
    });
  }

  /* ── the home screen's balance curve (BalanceCurve.tsx geometry) ─────────── */
  function homeCurve(host, extra = 0, drawn = 1) {
    const W = host.clientWidth;
    const u = W / 312;
    const PLOT = 150 * u, AXIS = 20 * u, TOP = 16 * u, BOT = PLOT - 12 * u;
    const pts = monthPoints(extra);
    const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(1, hi - lo);
    const y = (v) => BOT - ((v - lo) / span) * (BOT - TOP);
    const x = (i) => (i / (pts.length - 1)) * W;
    const c = pts.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
    const split = TODAY - 1;
    const base = y(Math.max(lo, 0));
    const ti = pts.indexOf(lo);
    const zeroY = lo < 0 && hi > 0 ? y(0) : null;
    const end = pts[pts.length - 1], endY = y(end);
    const ly = endY < PLOT / 2 ? endY + 14 * u : endY - 46 * u;
    host.innerHTML = `<svg width="${W}" height="${PLOT + AXIS}" viewBox="0 0 ${W} ${PLOT + AXIS}">
      <defs><clipPath id="home-veil"><rect x="0" y="-20" height="${PLOT + 40}" width="${(W * drawn).toFixed(2)}"/></clipPath></defs>
      <g clip-path="url(#home-veil)">
        ${zeroY != null ? `<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke="#E5484D" stroke-opacity=".45"/><line x1="${x(ti)}" x2="${x(ti)}" y1="${y(lo)}" y2="${zeroY}" stroke="#E5484D" stroke-opacity=".5" stroke-dasharray="2 3"/>` : ''}
        <path d="M 0,${base.toFixed(2)} L ${c.slice(0, split + 1).join(' L ')} L ${x(split).toFixed(2)},${base.toFixed(2)} Z" fill="#F2F4F7" fill-opacity=".07"/>
        <path id="c-solid" d="M ${c.slice(0, split + 1).join(' L ')}" stroke="#F2F4F7" stroke-width="${(2 * u).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M ${c.slice(split).join(' L ')}" stroke="${end < 0 ? '#E5484D' : '#9BA1AC'}" stroke-width="${(2 * u).toFixed(2)}" stroke-dasharray="${3 * u} ${5 * u}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${x(split)}" cy="${y(pts[split])}" r="${6.5 * u}" fill="#08090B"/><circle cx="${x(split)}" cy="${y(pts[split])}" r="${4 * u}" fill="#F2F4F7"/>
      </g>
      <g class="endlab" opacity="${drawn >= 1 ? 1 : 0}">
        <text x="${W}" y="${ly + 11 * u}" text-anchor="end" font-family="Geist, sans-serif" font-size="${11 * u}" fill="#737B88">fim do mês</text>
        <text x="${W}" y="${ly + 27 * u}" text-anchor="end" font-family="Geist Mono, monospace" font-weight="500" font-size="${13 * u}" fill="#9BA1AC">${brlShort(end)}</text>
      </g>
      <g font-family="Geist Mono, monospace" font-size="${11 * u}" fill="#737B88">
        <text x="0" y="${PLOT + 14 * u}">01</text><text x="${W}" y="${PLOT + 14 * u}" text-anchor="end">${N}</text>
        <text x="${clamp(x(split), 30 * u, W - 40 * u)}" y="${PLOT + 14 * u}" text-anchor="middle" fill="#9BA1AC">hoje ${pad(TODAY)}</text>
      </g></svg>`;
    return { W, x, y, pts, u };
  }

  function tela() {
    const app = $('#home-app');
    const d12 = new Date(Y, M, TODAY);
    $$('[data-today-long]').forEach((e) => (e.textContent = `${WEEK[d12.getDay()]}, ${TODAY} de ${MONTHS[M]}`));
    $$('[data-month-label]').forEach((e) => (e.textContent = `${MONTHS[M].toUpperCase()} DE ${Y}`));
    const amt = $('[data-amt]', app), net = $('[data-net]', app);
    const outEl = $('[data-flow-out]', app), inEl = $('[data-flow-in]', app);
    const fillOut = $('[data-fill-out]', app), fillIn = $('[data-fill-in]', app);
    const outLeft = $('[data-flow-out-left]', app), inLeft = $('[data-flow-in-left]', app);
    const sentence = $('[data-trough-sentence]', app);
    const rows = $('[data-today-rows]', app), count = $('[data-today-count]', app);
    const plot = $('#home-plot');
    const sum = (list, dir) => list.filter((e) => e.dir === dir).reduce((n, e) => n + e.v, 0);
    const outRec = sum(REC, 'out'), outFc = sum(FC, 'out'), inRec = sum(REC, 'in'), inFc = sum(FC, 'in');
    let extra = 0, geo;

    function figures() {
      const pts = monthPoints(extra);
      const bal = pts[TODAY - 1], lo = Math.min(...pts), n = bal - OPENING;
      setAmt(amt, bal);
      net.textContent = (n < 0 ? '−' : '+') + 'R$' + NB + parts(n).whole + ',' + parts(n).cents;
      net.className = 'mono ' + (n < 0 ? 'neg' : 'pos');
      const out = outRec + outFc + extra, outDone = outRec + extra;
      setAmt(outEl, out, { cents: false }); setAmt(inEl, inRec + inFc, { cents: false });
      outLeft.textContent = `${brlShort(out - outDone)} ainda por vir`;
      inLeft.textContent = `${brlShort(inFc)} ainda por vir`;
      sentence.textContent = `No dia ${pts.indexOf(lo) + 1} o saldo chega a ${brlShort(lo)}.`;
      fillOut.style.width = (outDone / out * 100) + '%';
      fillIn.style.width = (inRec / (inRec + inFc) * 100) + '%';
    }
    figures();
    geo = homeCurve(plot, extra, RM ? 1 : 0);
    const anchors = (stage) => {
      const sr = stage.getBoundingClientRect();
      const rel = (x, y) => [x - sr.left, y - sr.top];
      const a = $('#c-amt .amt').getBoundingClientRect();
      const pr = plot.querySelector('svg').getBoundingClientRect();
      const px = (i) => pr.left + geo.x(i), py = (v) => pr.top + geo.y(v);
      const f = $('#c-flow').getBoundingClientRect();
      const al = $('#c-alert .t-body').getBoundingClientRect();
      return [
        { key: 'c-amt', p: rel(a.left - 4, a.top + a.height * 0.55), left: true },
        { key: 'c-solid', p: rel(px(5), py(geo.pts[5])), left: true },
        { key: 'c-dash', p: rel(px(18), py(geo.pts[18])) },
        { key: 'c-flow', p: rel(f.right - 4, f.top + f.height * 0.4) },
        { key: 'c-alert', p: rel(al.left + Math.min(al.width, 240), al.top + al.height / 2) },
      ];
    };
    const place = () => callouts('#tela-stage', '#tela-callouts', anchors);
    addEventListener('resize', debounce(() => { geo = homeCurve(plot, extra, 1); place(); }, 200));
    if (RM) { place(); return; }
    // When the screen arrives: the mark wakes, the month rules itself, and one lançamento lands — once.
    once(app, async () => {
      const mark = $('[data-watch="home"]', app).__mark;
      const svg = plot.querySelector('svg');
      const rect = svg.querySelector('clipPath rect');
      await tween(0, 1, 900, (v) => {
        rect.setAttribute('width', (geo.W * v).toFixed(1));
        if (v > 0.88) svg.querySelector('.endlab').setAttribute('opacity', ((v - 0.88) / 0.12).toFixed(2));
        if (mark) { mark.glance = Math.sin(v * Math.PI) * 0.9; kick(); }
      });
      if (mark) { mark.glance = null; kick(); }
      place();
      await wait(2600);
      const from = monthPoints(extra)[TODAY - 1];
      extra = 850;
      geo = homeCurve(plot, extra, 1);
      figures();
      tween(from, from - 850, 650, (v) => setAmt(amt, v));
      const row = document.createElement('div');
      row.className = 'a-row fresh';
      row.innerHTML = `<span><span class="t-body">Café</span><span class="t-micro faint">Alimentação</span></span><span class="amt amt-body neg"><span class="sym">R$</span><span class="whole">8</span><span class="cts">,50</span></span>`;
      rows.prepend(row);
      count.textContent = '3 itens';
      place();
    }, 0.5);
  }

  /* Dotted leaders from points inside a phone to labels beside it, left or right. */
  function callouts(stageSel, svgSel, anchors) {
    const stage = $(stageSel), svg = $(svgSel);
    if (!stage || !svg) return;
    const labels = $$('.callout', stage);
    const phone = $('.phone', stage).getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    if (innerWidth < 1060 || phone.left - sr.left < 220 || sr.right - phone.right < 220) { svg.classList.remove('on'); labels.forEach((l) => (l.style.display = 'none')); return; }
    const pts = anchors(stage);
    let d = '', dots = '';
    const lastY = { l: -1e9, r: -1e9 };
    pts.sort((a, b) => a.p[1] - b.p[1]).forEach(({ key, p, left }) => {
      const lab = labels.find((l) => l.dataset.for === key);
      if (!lab) return;
      lab.style.display = 'block';
      const side = left ? 'l' : 'r';
      const ly = Math.max(p[1], lastY[side] + 46);
      lastY[side] = ly;
      lab.style.top = ly - 9 + 'px';
      if (left) {
        const ex = phone.left - sr.left - 12, x0 = phone.left - sr.left - 34;
        lab.style.left = 'auto'; lab.style.right = (sr.right - phone.left + 44) + 'px';
        d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)} H${ex} L${(ex - 10).toFixed(1)} ${ly.toFixed(1)} H${x0} `;
      } else {
        const ex = phone.right - sr.left + 12, x0 = phone.right - sr.left + 34;
        lab.style.right = 'auto'; lab.style.left = x0 + 10 + 'px';
        d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)} H${ex} L${(ex + 10).toFixed(1)} ${ly.toFixed(1)} H${x0} `;
      }
      dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2"/>`;
    });
    svg.innerHTML = `<path d="${d}"/>${dots}`;
    svg.classList.add('on');
  }

  /* ── Assistente: voice, draft, confirmation, answer ─────────────────────── */
  function assistente() {
    const rail = $$('#rail li'), now = $('#rail-now');
    const view = $('#tx-view'), feed = $('#tx-feed');
    const input = $('#tx-input'), draft = $('#tx-draft'), send = $('#tx-send');
    const rec = $('#tx-rec'), trans = $('#tx-trans'), clock = $('#tx-clock'), traceEl = $('#tx-trace');
    const card = $('#tx-card'), label = $('#tx-label'), ok = $('#tx-ok');
    const item = (k) => $(`[data-k="${k}"]`, feed);
    const dots = (k) => $(`[data-dots="${k}"]`, feed);
    const Q1 = 'gastei 42 e 90 no almoço, no nubank';
    const Q2 = 'e quanto posso gastar até o fim do mês?';
    traceEl.innerHTML = Array.from({ length: 48 }, () => '<i></i>').join('');
    const bars = $$('i', traceEl);
    let recording = false, timer = 0, seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const level = () => {
      for (let i = 0; i < bars.length - 1; i++) bars[i].style.height = bars[i + 1].style.height;
      const v = 0.15 + rnd() * 0.85 * (0.5 + 0.5 * Math.sin(performance.now() / 260));
      bars[bars.length - 1].style.height = (4 + v * 28).toFixed(1) + 'px';
    };
    const setRecording = (on) => {
      if (on === recording) return;
      recording = on;
      rec.classList.toggle('on', on);
      if (on && !timer) timer = setInterval(level, 100); else if (!on && timer) { clearInterval(timer); timer = 0; }
    };
    let lastStep = -1;
    function paint(p) {
      const P = clamp(p, 0, 0.9999) * 5;
      const i = Math.floor(P), t = P - i;
      const at = (s, tt) => i > s || (i === s && t >= tt);
      rail.forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); li.style.setProperty('--p', k === i ? t.toFixed(3) : 0); });
      if (i !== lastStep) {
        lastStep = i;
        const li = rail[i];
        now.innerHTML = `<span class="mono">${pad(i + 1)}</span> <b>${li.querySelector('b').textContent}</b> <em>${li.querySelector('em').textContent}</em>`;
      }
      setRecording(i === 0 && t >= 0.1);
      if (recording) clock.textContent = `0:${pad(Math.min(4, Math.floor((t - 0.1) / 0.9 * 5)))}`;
      trans.classList.toggle('on', i === 1 && t < 0.3);
      let text = '';
      if (i === 1 && t >= 0.3) text = Q1.slice(0, Math.ceil(clamp((t - 0.3) / 0.55, 0, 1) * Q1.length));
      if (i === 4 && t < 0.33) text = Q2.slice(0, Math.ceil(clamp(t / 0.28, 0, 1) * Q2.length));
      draft.textContent = text;
      input.classList.toggle('has', !!text);
      input.classList.toggle('typing', !!text);
      send.classList.toggle('live', !!text);

      item('empty').classList.add('on');
      item('u1').classList.toggle('on', at(2, 0.05));
      const cardSlot = item('card');
      cardSlot.classList.toggle('on', at(2, 0.05));
      cardSlot.classList.toggle('wait', !at(2, 0.34));
      dots('card').classList.toggle('on', i === 2 && t >= 0.05 && t < 0.34);
      ok.classList.toggle('press', i === 3 && t >= 0.3 && t < 0.45);
      const done = at(3, 0.45);
      card.classList.toggle('done', done);
      label.textContent = done ? 'REGISTRAR GASTO' : 'CONFIRMAR · REGISTRAR GASTO';
      item('u2').classList.toggle('on', at(4, 0.33));
      const aSlot = item('a2');
      aSlot.classList.toggle('on', at(4, 0.33));
      aSlot.classList.toggle('wait', !at(4, 0.55));
      dots('a2').classList.toggle('on', i === 4 && t >= 0.33 && t < 0.55);

      // Keep the newest line at the bottom by moving the feed, never by changing layout.
      if (RM) return;
      const bottomOf = (el) => el.offsetTop + el.offsetHeight;
      let b;
      if (aSlot.classList.contains('on')) b = aSlot.classList.contains('wait') ? aSlot.offsetTop + 30 : bottomOf(aSlot);
      else if (item('u2').classList.contains('on')) b = bottomOf(item('u2'));
      else if (cardSlot.classList.contains('on')) b = cardSlot.classList.contains('wait') ? cardSlot.offsetTop + 30 : bottomOf(cardSlot);
      else if (item('u1').classList.contains('on')) b = bottomOf(item('u1'));
      else b = bottomOf(item('empty'));
      const shift = Math.max(0, b - view.clientHeight + 12);
      feed.style.transform = `translate3d(0, ${-shift}px, 0)`;
    }
    const s = scrub($('#scrub-as'), paint);
    if (!RM) paint(0);
    addEventListener('resize', debounce(() => paint(Math.max(0, s.p)), 150));
  }

  /* ── Registrar: the numeral, driven by the keypad ───────────────────────── */
  function registrar() {
    const read = $('.reg-num'), whole = $('#r-whole'), cts = $('#r-cts');
    const go = $('#r-go'), snack = $('#r-snack'), keys = $('#r-keys'), chips = $('#r-chips');
    const segs = $$('.reg-seg button');
    let cents = 0, category = null, dir = 'out', auto = true, inView = false;
    function show() {
      const p = parts(cents);
      whole.innerHTML = p.whole.replace(/\./g, '<span class="dt">.</span>');
      cts.textContent = ',' + p.cents;
      read.classList.toggle('out', cents > 0 && dir === 'out');
      read.classList.toggle('in', cents > 0 && dir === 'in');
      whole.classList.remove('bump'); void whole.offsetWidth; whole.classList.add('bump');
      go.disabled = cents === 0;
      go.textContent = dir === 'out' ? 'Lançar saída' : 'Lançar entrada';
    }
    function press(k) {
      if (k === 'del') cents = Math.floor(cents / 10);
      else if (k === '00') { if (cents < 1e5) cents *= 100; }
      else if (cents < 1e6) cents = cents * 10 + Number(k);   // up to R$ 99.999,99: the figure has to fit a phone
      show();
    }
    const flash = (b) => { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 140); };
    function pick(name) {
      category = category === name ? null : name;
      $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === category)));
    }
    function commit() {
      if (!cents) return;
      snack.textContent = `${dir === 'out' ? 'Saída' : 'Entrada'} lançada: ${brl(cents)}${category ? ` em ${category}` : ''}.`;
      snack.classList.add('on');
      setTimeout(() => snack.classList.remove('on'), 2600);
      setTimeout(() => { cents = 0; pick(category); show(); }, 900);
    }
    segs.forEach((b) => b.addEventListener('click', () => {
      auto = false; dir = b.dataset.dir;
      segs.forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      show();
    }));
    keys.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; auto = false; press(b.dataset.k); });
    chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; auto = false; pick(b.dataset.cat); });
    go.addEventListener('click', () => { auto = false; commit(); });
    addEventListener('keydown', (e) => {
      if (!inView || e.metaKey || e.ctrlKey || e.altKey) return;
      let k = null;
      if (/^[0-9]$/.test(e.key)) k = e.key; else if (e.key === 'Backspace') k = 'del';
      if (k) { e.preventDefault(); auto = false; press(k); const b = $(`[data-k="${k}"]`, keys); if (b) flash(b); }
      else if (e.key === 'Enter' && cents && !(e.target.closest && e.target.closest('a, button'))) { e.preventDefault(); auto = false; flash(go); commit(); }
    });
    new IntersectionObserver((x) => { inView = x[0].isIntersecting; }, { threshold: 0.3 }).observe(keys);
    if (RM) return;
    // A first lançamento, typed by itself, once: four digits, a category, Lançar.
    once(keys, async () => {
      await wait(500);
      for (const k of ['4', '2', '9', '0']) { if (!auto) return; flash($(`[data-k="${k}"]`, keys)); press(k); await wait(300); }
      await wait(350); if (!auto) return;
      pick('Alimentação');
      await wait(600); if (!auto) return;
      flash(go); commit();
    }, 0.6);
  }

  /* ── Categorias: the ring, and the one cut that matters ─────────────────── */
  const SLICES = [
    { k: 'Moradia', hue: '#D07A53', v: 125000, icon: 'M3.5 10.5 12 3.5l8.5 7M5.5 9v11h13V9M9.8 20v-6h4.4v6' },
    { k: 'Mercado', hue: '#2BA19D', v: 59419, icon: 'M2.5 3.5h2.3l2.4 11h10.4l2-7.5H6' },
    { k: 'Alimentação', hue: '#876114', v: 28960, cap: 21000, icon: 'M7 3v6.5a2 2 0 0 0 4 0V3 M9 9.5V21 M17 3c-1.6 1.4-2.2 3-2.2 5.2 0 1.7.7 2.6 2.2 2.8V21' },
    { k: 'Transporte', hue: '#3175BC', v: 28110, icon: 'M3 15.5v-3l2-5.2A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.3l2 5.2v3 M3.5 12.5h17' },
    { k: 'Demais', hue: '#737B88', v: 52915, rest: true, icon: 'M11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5L11 22 2 13l9.5-9.5Z M16.5 7.8h.01' },
  ];
  function categorias() {
    const SIZE = 208, STROKE = 26, R = (SIZE - STROKE) / 2, CIRC = 2 * Math.PI * R, GAP = 2 / CIRC, POP = 8, C = SIZE / 2;
    const sum = SLICES.reduce((n, s) => n + s.v, 0);
    let at = 0;
    const arcs = SLICES.map((s) => {
      const start = at; at += s.v / sum;
      const end = at - GAP;
      const broke = s.cap && s.v > s.cap ? start + (end - start) * (s.cap / s.v) : null;
      return { ...s, start, end, broke, share: Math.round((s.v / sum) * 100) };
    });
    const svg = $('#donut-svg'), mid = $('#donut-mid'), legend = $('#legend');
    const over = arcs.find((a) => a.broke != null);
    const ang = over.broke * 2 * Math.PI, h = (STROKE + POP) / 2 + 7;
    svg.innerHTML = `<g transform="rotate(-90 ${C} ${C})">
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#22262E" stroke-width="${STROKE}" opacity=".5"/>
      ${arcs.map((a, i) => `<circle class="arc" data-i="${i}" cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${a.hue}" stroke-width="${STROKE}"/>`).join('')}
      <circle class="arc over" data-i="${arcs.indexOf(over)}" cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#E5484D" stroke-width="${STROKE}"/>
      <line class="tick" x1="${C + (R - h) * Math.cos(ang)}" y1="${C + (R - h) * Math.sin(ang)}" x2="${C + (R + h) * Math.cos(ang)}" y2="${C + (R + h) * Math.sin(ang)}" stroke="#F2F4F7" stroke-width="1.4"/>
    </g>`;
    const hueEls = $$('.arc:not(.over)', svg), overEl = $('.arc.over', svg);
    legend.innerHTML = arcs.map((a, i) => {
      const pct = a.cap ? Math.round((a.v / a.cap) * 100) : null;
      return `<button type="button" class="lg-item" data-i="${i}" aria-pressed="false"><span class="dot" style="background:${a.hue}"></span><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:#9BA1AC;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none"><path d="${a.icon}"/></svg><span class="nm"><span>${a.k}</span><small><span class="mono">${a.share}%</span> das saídas${pct ? ` · <b><span class="mono">${pct}%</span> do teto</b>` : ''}</small></span><span class="v"><small>R$ </small>${parts(a.v).whole}<small>,${parts(a.v).cents}</small></span></button>`;
    }).join('');
    let focus = null, overflow = RM ? 1 : 0;
    function center() {
      if (focus == null) mid.innerHTML = `<span class="big neg"><small>R$</small>${group(Math.round(sum / 100))}</span><span class="lab">saídas · últimos 30 dias</span>`;
      else { const a = arcs[focus]; mid.innerHTML = `<span class="name">${a.k}</span><span class="big"><small>R$</small>${group(Math.round(a.v / 100))}</span><span class="lab"><span class="mono">${a.share}%</span> das saídas</span>`; }
    }
    function draw() {
      arcs.forEach((a, i) => {
        const hueEnd = a.broke ?? a.end;
        const len = (hueEnd - a.start) * CIRC;
        const st = focus === i ? STROKE + POP : STROKE;
        const op = focus != null && focus !== i ? 0.28 : 1;
        Object.assign(hueEls[i].style, { strokeDasharray: `${len} ${CIRC - len}`, strokeDashoffset: -a.start * CIRC, strokeWidth: st, opacity: op });
        if (a === over) {
          const l2 = (a.end - a.broke) * overflow * CIRC;
          Object.assign(overEl.style, { strokeDasharray: `${l2} ${CIRC - l2}`, strokeDashoffset: -a.broke * CIRC, strokeWidth: st, opacity: op });
        }
      });
      $$('.lg-item', legend).forEach((b, i) => { b.classList.toggle('dim', focus != null && focus !== i); b.setAttribute('aria-pressed', String(focus === i)); });
    }
    const toggle = (i) => { focus = focus === i ? null : i; center(); draw(); };
    svg.addEventListener('click', (e) => { const a = e.target.closest('.arc'); if (a) toggle(+a.dataset.i); else if (focus != null) toggle(focus); });
    svg.addEventListener('mouseover', (e) => { const a = e.target.closest('.arc'); if (a && FINE && focus !== +a.dataset.i) { focus = +a.dataset.i; center(); draw(); } });
    svg.addEventListener('mouseleave', () => { if (FINE && focus != null) { focus = null; center(); draw(); } });
    legend.addEventListener('click', (e) => { const b = e.target.closest('.lg-item'); if (b) toggle(+b.dataset.i); });
    center(); draw();
    // The only motion: past the ceiling, the overflow is drawn in, once.
    if (!RM) once($('#donut'), () => wait(250).then(() => tween(0, 1, 1100, (v) => { overflow = v; draw(); })), 0.5);
  }

  /* ── Dívida: two phones, one state ───────────────────────────────────────── */
  function divida() {
    const TOTAL = 10, EACH = 29160;
    let paid = 3, shared = true;
    const monthAt = (n) => new Date(2026, 7 + n, 10);   // first installment: 10 de agosto de 2026
    const dv = $('#dv'), a = $('#dv-a'), b = $('#dv-b'), page = $('#d-page');
    const pay = $('#dv-pay'), revoke = $('#dv-revoke'), status = $('#dv-status'), copy = $('#dv-copy'), url = $('#dv-url'), wire = $('#dv-wire');
    const pays = $('#d-pays');
    const payRow = (n, fresh) => { const d = monthAt(n - 1); return `<div class="pay${fresh ? ' fresh' : ''}"><span><span class="mono faint">${pad(n)}</span>&nbsp;&nbsp;${d.getDate()} de ${MONTHS[d.getMonth()]} <span class="faint">· no dia</span></span><span>R$ 291,60</span></div>`; };
    pays.innerHTML = [3, 2, 1].map((n) => payRow(n)).join('');
    const end = monthAt(TOTAL - 1);
    $$('[data-end]').forEach((e) => (e.textContent = `${MONTHS[end.getMonth()]} de ${end.getFullYear()}`));
    $$('[data-ticks]').forEach((t) => (t.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<i class="${i < paid ? 'paid' : ''}"></i>`).join('')));
    function render(justPaid) {
      $$('[data-count]').forEach((e) => (e.textContent = `${paid}/${TOTAL}`));
      $$('[data-ticks]').forEach((t) => {
        const tick = t.children[paid - 1];
        if (tick) tick.classList.add('paid');
        if (justPaid && tick && (t.closest('#dv-a') || shared)) { tick.classList.add('just'); setTimeout(() => tick.classList.remove('just'), 1300); }
      });
      if (paid < TOTAL) { const n = monthAt(paid); $$('[data-next]').forEach((e) => (e.textContent = `${n.getDate()} de ${MONTHS[n.getMonth()]}`)); }
      else {
        $$('[data-next-row]').forEach((e) => (e.style.display = 'none'));
        $$('[data-end-label]').forEach((e) => (e.textContent = 'terminou'));
        $$('[data-left]').forEach((e) => (e.innerHTML = '<span class="whole" style="font-family:var(--sans)">Quitada</span>'));
        $$('[data-left-cap]').forEach((e) => (e.textContent = `todas as ${TOTAL} parcelas pagas`));
        pay.disabled = true;
        pay.textContent = 'Tudo pago';
      }
    }
    $$('[data-left]').forEach((e) => setAmt(e, (TOTAL - paid) * EACH));
    pay.addEventListener('click', () => {
      if (paid >= TOTAL) return;
      const from = (TOTAL - paid) * EACH;
      paid++;
      // The other side only sees it while the link is alive; its ledger of payments grows too.
      // shortcut: the recipient's page catches up instantly here; the real page re-reads every 15 s.
      if (paid < TOTAL) tween(from, (TOTAL - paid) * EACH, 700, (v) => $$('[data-left]').forEach((e) => setAmt(e, v)));
      pays.insertAdjacentHTML('afterbegin', payRow(paid, true));
      render(true);
      if (small() && shared) setTimeout(() => side('b'), 650);
    });
    revoke.addEventListener('click', () => {
      shared = !shared;
      page.classList.toggle('revoked', !shared);
      dv.classList.toggle('revoked', !shared);
      $('#d-live-word').textContent = shared ? 'AO VIVO' : 'LINK REVOGADO';
      status.textContent = shared ? 'LINK ATIVO' : '';
      copy.textContent = shared ? 'Gabriel vê o mesmo progresso, sem precisar criar uma conta.' : 'O link deixou de mostrar esta dívida. Envie um novo quando quiser.';
      revoke.textContent = shared ? 'Revogar acesso' : 'Criar link e compartilhar';
      wire.textContent = shared ? 'link privado · ao vivo' : 'link revogado';
      if (shared) url.textContent = 'otto-financas.vercel.app/divida/' + Math.random().toString(36).slice(2, 6) + '…';
      if (small()) setTimeout(() => side('b'), 650);
    });
    // Small screens: one phone at a time, the same state behind both.
    const tabs = $$('.dv-toggle button');
    function side(s) {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.side === s)));
      $$('.dv-side').forEach((d) => d.classList.toggle('on', d.dataset.side === s));
    }
    tabs.forEach((t) => t.addEventListener('click', () => side(t.dataset.side)));
    side('a');
  }

  /* ── small things ─────────────────────────────────────────────────────────── */
  function details() {
    $$('[data-wd]').forEach((e) => { const n = +e.dataset.wd; const d = new Date(Y, M, n); e.textContent = `${WK[d.getDay()]} ${pad(n)}`; });
    // The lock row: the mark sleeps until something it trusts comes near.
    const lockRow = $('.v-lock') && $('.v-lock').closest('.lg-row');
    const lockMark = MARKS.find((m) => m.sleep);
    if (lockRow && lockMark && !RM) {
      const open = () => { lockMark.shut.t = 0; kick(); };
      const close = () => { lockMark.shut.t = 1; kick(); };
      lockRow.addEventListener('mouseenter', open); lockRow.addEventListener('mouseleave', close);
      lockRow.addEventListener('touchstart', () => { open(); setTimeout(close, 1800); }, { passive: true });
    }
  }

  /* ── boot ─────────────────────────────────────────────────────────────────── */
  mountWordmarks();
  reveals();
  hero();
  tela();
  assistente();
  registrar();
  categorias();
  divida();
  details();

  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', requestScroll);
  requestScroll();

  if (!RM) {
    if (FINE) {
      addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; pointer.at = performance.now(); if (away) setAway(false); kick(); }, { passive: true });
      // OTTO closes its eyes when you leave, and opens them, widening, when you come back.
      root.addEventListener('mouseleave', () => setAway(true));
      root.addEventListener('mouseenter', () => setAway(false));
    }
    document.addEventListener('visibilitychange', () => setAway(document.hidden));
  }
})();
