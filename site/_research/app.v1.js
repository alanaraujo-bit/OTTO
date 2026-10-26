/* OTTO — site. No dependencies: one scroll loop, one rAF loop, a few observers.
   Every figure on the page comes from the example month below, run through the same rules the app
   uses (src/domain/money.ts formatting, src/ui/chart/BalanceCurve.tsx geometry). */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(pointer: fine)').matches;
  if (RM) document.documentElement.classList.add('rm');
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
  /** Write a figure into an .amt (sym / whole / cts), the sign wearing the figure's tone. */
  function setAmt(el, c, { cents = true, dir, dots = false } = {}) {
    const shown = dir ? Math.abs(c) : c;
    const v = cents ? shown : Math.round(shown / 100) * 100;
    const p = parts(v);
    const sign = dir === 'in' && v ? '+' : p.sign;
    const sym = el.querySelector('.sym'), wh = el.querySelector('.whole'), ct = el.querySelector('.cts');
    if (sym) sym.innerHTML = sign ? `<span class="sg">${sign}</span>R$` : 'R$';
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

  /* ── the example month ───────────────────────────────────────────────────── */
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WK = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const now = new Date();
  const Y = now.getFullYear(), M = now.getMonth();
  const N = new Date(Y, M + 1, 0).getDate();
  const TODAY = 12;
  const MON3 = MONTHS[M].slice(0, 3).toUpperCase();
  const pad = (n) => String(n).padStart(2, '0');

  // What already happened (the record) and what the rules say will (the forecast). Cents.
  const OPENING = 61300;
  const REC = [
    [1, 'Salário', 'Renda', 740000, 'in', 1], [1, 'Padaria', 'Alimentação', 1840],
    [2, 'Almoço', 'Alimentação', 4250], [2, 'Uber', 'Transporte', 2390],
    [3, 'Aluguel', 'Moradia', 185000, 'out', 1], [3, 'Café', 'Alimentação', 980],
    [4, 'Mercado', 'Mercado', 18735], [4, 'Almoço', 'Alimentação', 3800],
    [5, 'Farmácia', 'Saúde', 5670], [5, 'Café', 'Alimentação', 1120],
    [6, 'Mercado', 'Mercado', 26418], [6, 'Uber', 'Transporte', 3140],
    [7, 'Almoço', 'Alimentação', 4790], [7, 'Cinema', 'Lazer', 6800],
    [8, 'Combustível', 'Transporte', 19800], [8, 'Café', 'Alimentação', 850],
    [9, 'Internet', 'Casa', 12990], [9, 'Almoço', 'Alimentação', 3640],
    [10, 'Fatura Nubank', 'Cartão', 397659, 'out', 1],
    [11, 'Mercado', 'Mercado', 14266], [11, 'Uber', 'Transporte', 2780],
    [12, 'Energia', 'Casa', 21460, 'out', 1], [12, 'Almoço', 'Alimentação', 4490],
  ].map(([d, t, c, v, dir = 'out', big = 0]) => ({ d, t, c, v, dir, big, rec: true }));
  const FC = [
    [14, 'Notebook', 'Dívidas', 29158, 'out', 1, '6/12'], [15, 'Academia', 'Saúde', 11900],
    [18, 'Spotify', 'Assinaturas', 2190], [20, 'Netflix', 'Assinaturas', 4490],
    [22, 'Empréstimo pessoal', 'Dívidas', 43000, 'out', 1, '9/24'], [28, 'Freela', 'Renda', 120000, 'in', 1],
  ].map(([d, t, c, v, dir = 'out', big = 0, n]) => ({ d, t, c, v, dir, big, n, rec: false }));
  const EVENTS = [...REC, ...FC];

  function monthPoints(extra = 0) {
    // Balance at the end of each day. `extra` is spending added today (the hero's live entries).
    const pts = [];
    let b = OPENING;
    for (let d = 1; d <= N; d++) {
      for (const e of EVENTS) if (e.d === d) b += e.dir === 'in' ? e.v : -e.v;
      if (d === TODAY) b -= extra;
      pts.push(b);
    }
    return pts;
  }

  /* ── wordmark: the O's are eyes ──────────────────────────────────────────── */
  const MARKS = [];
  const pointer = { x: innerWidth / 2, y: innerHeight * 0.3, seen: false, at: 0 };
  let away = false;

  function mountWordmarks() {
    $$('[data-wordmark]').forEach((el) => {
      const h = +el.dataset.h || 20;
      const labelled = el.closest('[aria-label]') || el.closest('[aria-hidden="true"]');
      const lid = (cx) => `<path class="wm-lid" d="M${cx - 33} 42Q${cx} 64 ${cx + 33} 42" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-opacity="0"/>`;
      el.innerHTML = `<svg viewBox="0 0 388 100" width="${(h * 3.88).toFixed(1)}" height="${h}" ${labelled ? 'aria-hidden="true"' : 'role="img" aria-label="OTTO"'} focusable="false">
        <g fill="none" stroke="currentColor" stroke-width="9"><circle cx="50" cy="50" r="45.5"/><line x1="158" y1="0" x2="158" y2="100"/><line x1="230" y1="0" x2="230" y2="100"/><circle cx="338" cy="50" r="45.5"/><line class="wm-bar" x1="122" y1="4.5" x2="${RM ? 266 : 122}" y2="4.5"/></g>
        <ellipse class="wm-p" cx="50" cy="50" rx="${RM ? 13 : 0}" ry="${RM ? 13 : 0}" fill="currentColor"/><ellipse class="wm-p" cx="338" cy="50" rx="${RM ? 13 : 0}" ry="${RM ? 13 : 0}" fill="currentColor"/>${lid(50)}${lid(338)}</svg>`;
      const svg = el.firstElementChild;
      const sleep = el.hasAttribute('data-sleep');
      const m = {
        el, svg, sleep, big: el.hasAttribute('data-big'),
        bar: svg.querySelector('.wm-bar'), pupils: $$('.wm-p', svg), lids: $$('.wm-lid', svg),
        g: { x: 0, y: 0, vx: 0, vy: 0 }, wake: { x: 0, v: 0, t: 0 }, shut: { x: sleep ? 1 : 0, v: 0, t: sleep ? 1 : 0 },
        blinkAt: performance.now() + 1500 + Math.random() * 4000, blink0: -1, double: false,
        visible: false, woke: false, glance: null, saccade: { x: 0, y: 0, at: 0 },
      };
      if (RM && sleep) { m.lids.forEach((l) => l.setAttribute('stroke-opacity', 1)); m.pupils.forEach((p) => p.setAttribute('ry', 0)); }
      MARKS.push(m);
      if (el.dataset.watch) el.__mark = m;
    });
    if (RM) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const m = MARKS.find((k) => k.el === e.target);
      m.visible = e.isIntersecting;
      if (e.isIntersecting && !m.woke && !m.el.dataset.watch) wakeMark(m, 250);
    }), { threshold: 0.2 });
    MARKS.forEach((m) => io.observe(m.el));
  }
  function wakeMark(m, delay = 0) {
    m.woke = true;
    setTimeout(() => {
      tween(122, 266, 560, (v) => m.bar.setAttribute('x2', v.toFixed(1)));
      setTimeout(() => { m.wake.t = 1; }, 220);
    }, delay);
  }
  const spring = (s, k, d) => { s.v += (s.t - s.x) * k; s.v *= d; s.x += s.v; };

  function markFrame(t) {
    for (const m of MARKS) {
      if (!m.visible) continue;
      // Where to look: the pointer, or an idle saccade on touch screens, or a glance the page asks for.
      let tx, ty;
      if (m.glance != null) { tx = m.glance * 9; ty = 3; }
      else if (FINE && pointer.seen) {
        const r = m.svg.getBoundingClientRect();
        const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const reach = clamp(dist / (m.big ? 420 : 260), 0, 1);
        tx = (dx / dist) * reach * 9; ty = (dy / dist) * reach * 15;
      } else {
        if (t > m.saccade.at) {
          m.saccade = { x: (Math.random() * 2 - 1) * 7, y: (Math.random() * 2 - 1) * 10, at: t + 1600 + Math.random() * 2600 };
          if (pointer.seen && t - pointer.at < 2500) {
            const r = m.svg.getBoundingClientRect();
            const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
            const dist = Math.hypot(dx, dy) || 1;
            m.saccade.x = (dx / dist) * 9; m.saccade.y = (dy / dist) * 14; m.saccade.at = t + 900;
          }
        }
        tx = m.saccade.x; ty = m.saccade.y;
      }
      // Keep the pupil inside the ring: an ellipse of reach, not a box.
      const e = Math.hypot(tx / 9, ty / 15);
      if (e > 1) { tx /= e; ty /= e; }
      m.g.vx = (m.g.vx + (tx - m.g.x) * 0.09) * 0.74; m.g.x += m.g.vx;
      m.g.vy = (m.g.vy + (ty - m.g.y) * 0.09) * 0.74; m.g.y += m.g.vy;

      spring(m.wake, 0.08, 0.78);
      const closing = m.shut.t === 1;
      spring(m.shut, closing ? 0.2 : 0.11, closing ? 0.62 : 0.66);

      let lid = 1;
      if (m.blink0 < 0 && t > m.blinkAt && m.wake.x > 0.9 && m.shut.x < 0.05) { m.blink0 = t; m.double = Math.random() < 0.25; }
      if (m.blink0 >= 0) {
        const el = t - m.blink0;
        const seq = m.double ? [70, 90, 60, 110] : [75, 130];
        let acc = 0, done = true;
        for (let i = 0; i < seq.length; i++) {
          if (el < acc + seq[i]) { const f = (el - acc) / seq[i]; lid = i % 2 === 0 ? 1 - f : f; done = false; break; }
          acc += seq[i];
        }
        if (done) { m.blink0 = -1; m.blinkAt = t + 2800 + Math.random() * 4200; }
      }
      const w = clamp(m.wake.x, 0, 1.2);
      const rx = 13 * w;
      const ry = Math.max(0, 13 * w * lid * clamp(1 - m.shut.x, 0, 1.35));
      m.pupils[0].setAttribute('cx', (50 + m.g.x).toFixed(2));
      m.pupils[1].setAttribute('cx', (338 + m.g.x).toFixed(2));
      for (const p of m.pupils) { p.setAttribute('cy', (50 + m.g.y).toFixed(2)); p.setAttribute('rx', rx.toFixed(2)); p.setAttribute('ry', ry.toFixed(2)); }
      const lo = (clamp(m.shut.x, 0, 1) * clamp(m.wake.x, 0, 1)).toFixed(3);
      for (const l of m.lids) l.setAttribute('stroke-opacity', lo);
    }
  }
  function setAway(v) {
    if (away === v) return;
    away = v;
    for (const m of MARKS) if (!m.sleep) m.shut.t = v ? 1 : 0;
  }

  /* ── reveal ──────────────────────────────────────────────────────────────── */
  function reveals() {
    const els = $$('.rv, [data-lines], .eyebrow, .lg-row');
    if (RM || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* ── the home screen's balance curve (BalanceCurve.tsx geometry) ─────────── */
  function homeCurve(host) {
    const W = host.clientWidth;
    const u = W / 312;
    const PLOT = 150 * u, AXIS = 20 * u, TOP = 16 * u, BOT = PLOT - 12 * u;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', PLOT + AXIS);
    svg.setAttribute('viewBox', `0 0 ${W} ${PLOT + AXIS}`);
    host.innerHTML = '';
    host.appendChild(svg);
    const id = 'veil' + Math.random().toString(36).slice(2, 7);
    const state = { draw: RM ? 1 : 0, extra: 0 };

    function render() {
      const pts = monthPoints(state.extra);
      const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(1, hi - lo);
      const y = (v) => BOT - ((v - lo) / span) * (BOT - TOP);
      const x = (i) => (i / (pts.length - 1)) * W;
      const c = pts.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
      const split = TODAY - 1;
      const solid = 'M ' + c.slice(0, split + 1).join(' L ');
      const dashed = 'M ' + c.slice(split).join(' L ');
      const base = y(Math.max(lo, 0));
      const area = `M 0,${base.toFixed(2)} L ${c.slice(0, split + 1).join(' L ')} L ${x(split).toFixed(2)},${base.toFixed(2)} Z`;
      const ti = pts.indexOf(lo);
      const zeroY = lo < 0 && hi > 0 ? y(0) : null;
      const end = pts[pts.length - 1];
      const endY = y(end);
      state.geo = { x, y, pts, split, ti, zeroY, endY };
      svg.innerHTML = `
        <defs><clipPath id="${id}"><rect x="0" y="-20" height="${PLOT + 40}" width="${(W * state.draw).toFixed(2)}"/></clipPath></defs>
        <g clip-path="url(#${id})">
          ${zeroY != null ? `<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke="#E5484D" stroke-opacity=".45" stroke-width="1"/>` : ''}
          ${zeroY != null ? `<line x1="${x(ti)}" x2="${x(ti)}" y1="${y(lo)}" y2="${zeroY}" stroke="#E5484D" stroke-opacity=".5" stroke-dasharray="2 3"/>` : ''}
          <path d="${area}" fill="#F2F4F7" fill-opacity=".07"/>
          <path id="hero-solid-p" d="${solid}" stroke="#F2F4F7" stroke-width="${(2 * u).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${dashed}" stroke="${end < 0 ? '#E5484D' : '#9BA1AC'}" stroke-width="${(2 * u).toFixed(2)}" stroke-dasharray="${3 * u} ${5 * u}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${x(split)}" cy="${y(pts[split])}" r="${6.5 * u}" fill="#08090B"/><circle cx="${x(split)}" cy="${y(pts[split])}" r="${4 * u}" fill="#F2F4F7"/>
        </g>
        <g class="endlab" opacity="${state.draw >= 0.999 ? 1 : 0}" style="transition:opacity .5s">
          <text x="${W}" y="${(endY < PLOT / 2 ? endY + 14 * u : endY - 46 * u) + 11 * u}" text-anchor="end" font-family="Geist, sans-serif" font-size="${11 * u}" fill="#737B88">fim do mês</text>
          <text x="${W}" y="${(endY < PLOT / 2 ? endY + 14 * u : endY - 46 * u) + 27 * u}" text-anchor="end" font-family="Geist Mono, monospace" font-weight="500" font-size="${13 * u}" fill="${end < 0 ? '#E5484D' : '#9BA1AC'}">${brlShort(end)}</text>
        </g>
        <g font-family="Geist Mono, monospace" font-size="${11 * u}" fill="#737B88">
          <text x="0" y="${PLOT + 14 * u}">01</text>
          <text x="${W}" y="${PLOT + 14 * u}" text-anchor="end">${N}</text>
          <text x="${clamp(x(split), 30 * u, W - 40 * u)}" y="${PLOT + 14 * u}" text-anchor="middle" fill="#9BA1AC">hoje ${pad(TODAY)}</text>
        </g>`;
    }
    render();
    const draw = () => tween(0, 1, 820, (v) => {
      state.draw = v;
      const r = svg.querySelector('clipPath rect');
      if (r) r.setAttribute('width', (W * v).toFixed(2));
      if (v > 0.88) svg.querySelector('.endlab').setAttribute('opacity', ((v - 0.88) / 0.12).toFixed(2));
      if (state.onDraw) state.onDraw(v);
    });
    return { state, render, draw, svg, W, u };
  }

  /* ── hero ─────────────────────────────────────────────────────────────────── */
  function hero() {
    const app = $('#home-app');
    const d12 = new Date(Y, M, TODAY);
    $$('[data-today-long]').forEach((e) => (e.textContent = `${WEEK[d12.getDay()]}, ${TODAY} de ${MONTHS[M]}`));
    $$('[data-month-label]').forEach((e) => (e.textContent = `${MONTHS[M].toUpperCase()} DE ${Y}`));

    const amt = $('[data-amt]', app);
    const net = $('[data-net]', app);
    const outEl = $('[data-flow-out]', app), inEl = $('[data-flow-in]', app);
    const fillOut = $('[data-fill-out]', app), fillIn = $('[data-fill-in]', app);
    const outLeft = $('[data-flow-out-left]', app), inLeft = $('[data-flow-in-left]', app);
    const sentence = $('[data-trough-sentence]', app);
    const rows = $('[data-today-rows]', app), count = $('[data-today-count]', app);

    const outRec = REC.filter((e) => e.dir === 'out').reduce((n, e) => n + e.v, 0);
    const outFc = FC.filter((e) => e.dir === 'out').reduce((n, e) => n + e.v, 0);
    const inRec = REC.filter((e) => e.dir === 'in').reduce((n, e) => n + e.v, 0);
    const inFc = FC.filter((e) => e.dir === 'in').reduce((n, e) => n + e.v, 0);
    const s = { extra: 0, bal: monthPoints()[TODAY - 1] };

    function figures(animateBars) {
      const pts = monthPoints(s.extra);
      const bal = pts[TODAY - 1];
      const lo = Math.min(...pts);
      const n = bal - OPENING;
      net.textContent = (n < 0 ? '−' : '+') + 'R$' + NB + parts(n).whole + ',' + parts(n).cents;
      net.className = 'mono ' + (n < 0 ? 'neg' : 'pos');
      const out = outRec + outFc + s.extra, outDone = outRec + s.extra;
      setAmt(outEl, out, { cents: false }); setAmt(inEl, inRec + inFc, { cents: false });
      outLeft.textContent = `${brlShort(out - outDone)} ainda por vir`;
      inLeft.textContent = `${brlShort(inFc)} ainda por vir`;
      const tr = pts.indexOf(lo) + 1;
      sentence.textContent = `No dia ${tr} o saldo chega a ${brlShort(lo)}.`;
      if (animateBars) { fillOut.style.width = (outDone / out * 100) + '%'; fillIn.style.width = (inRec / (inRec + inFc) * 100) + '%'; }
      return bal;
    }

    const plot = $('#hero-plot');
    let curve = homeCurve(plot);
    const mark = $('[data-watch="home"]', app).__mark;
    if (mark) curve.state.onDraw = (v) => { mark.glance = Math.sin(v * Math.PI) * 0.9; if (v >= 1) mark.glance = null; };

    figures(false);
    if (RM) { setAmt(amt, s.bal); figures(true); }

    addEventListener('resize', debounce(() => {
      const extra = curve.state.extra;
      curve = homeCurve(plot); curve.state.extra = extra; curve.state.draw = 1; curve.render();
      callouts('#hero-stage', '#hero-callouts', heroAnchors);
    }, 200));

    // Entrance: the mark rules itself, the figure counts in, the month draws, the flows fill.
    const start = async () => {
      if (RM) return;
      if (mark) { mark.visible = true; wakeMark(mark, 0); }
      await wait(200);
      tween(0, s.bal, 1500, (v) => setAmt(amt, v));
      await wait(240);
      curve.draw();
      await wait(420);
      figures(true);
      await wait(900);
      callouts('#hero-stage', '#hero-callouts', heroAnchors);
      live();
    };
    // A lançamento lands while you watch: the figure, the line and the warning all move together.
    const QUEUE = [['Café', 'Alimentação', 850], ['Uber', 'Transporte', 1890], ['Padaria', 'Alimentação', 1240]];
    let visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(app);
    async function live() {
      for (const [t, c, v] of QUEUE) {
        await wait(4200);
        while (!visible || document.hidden) await wait(600);
        const from = monthPoints(s.extra)[TODAY - 1];
        s.extra += v;
        curve.state.extra = s.extra;
        curve.render();
        const to = figures(true);
        tween(from, to, 650, (x) => setAmt(amt, x));
        const row = document.createElement('div');
        row.className = 'a-row fresh';
        row.innerHTML = `<span><span class="t-body">${t}</span><span class="t-micro faint">${c}</span></span><span class="amt amt-body neg"><span class="sym">R$</span><span class="whole"></span><span class="cts"></span></span>`;
        setAmt(row.querySelector('.amt'), v);
        rows.prepend(row);
        const k = rows.children.length;
        count.textContent = `${k} ${k === 1 ? 'item' : 'itens'}`;
      }
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(start, 150)); else setTimeout(start, 400);
  }
  function heroAnchors(stage) {
    const sr = stage.getBoundingClientRect();
    const rel = (x, y) => [x - sr.left, y - sr.top];
    const a = $('#hero-amt .amt').getBoundingClientRect();
    const plot = $('#hero-plot svg');
    const out = [];
    out.push({ key: 'hero-amt', p: rel(a.right + 4, a.top + a.height * 0.55) });
    if (plot) {
      const pr = plot.getBoundingClientRect();
      const pts = monthPoints();
      const lo = Math.min(...pts), hi = Math.max(...pts);
      const u = pr.width / 312, TOP = 16 * u, BOT = 138 * u;
      const yy = (v) => pr.top + BOT - ((v - lo) / (hi - lo)) * (BOT - TOP);
      const xx = (i) => pr.left + (i / (N - 1)) * pr.width;
      out.push({ key: 'hero-solid', p: rel(xx(6), yy(pts[6])) });
      out.push({ key: 'hero-dash', p: rel(xx(18), yy(pts[18])) });
    }
    const al = $('#hero-alert .t-body').getBoundingClientRect();
    out.push({ key: 'hero-alert', p: rel(al.left + Math.min(al.width, 230), al.top + al.height / 2) });
    return out;
  }

  /* Dotted leaders from points inside a phone to labels beside it. */
  function callouts(stageSel, svgSel, anchors) {
    const stage = $(stageSel), svg = $(svgSel);
    if (!stage || !svg) return;
    const phone = $('.phone', stage).getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const room = innerWidth - phone.right;
    const labels = $$('.callout', stage);
    if (room < 230 || innerWidth < 1060) { svg.classList.remove('on'); labels.forEach((l) => (l.style.display = 'none')); return; }
    const pts = anchors(stage);
    const x0 = phone.right - sr.left + 34;
    let lastY = -1e9;
    let d = '', dots = '';
    pts.sort((a, b) => a.p[1] - b.p[1]).forEach(({ key, p }) => {
      const lab = labels.find((l) => l.dataset.for === key);
      if (!lab) return;
      lab.style.display = '';
      let ly = Math.max(p[1], lastY + 46);
      lastY = ly;
      lab.style.left = x0 + 10 + 'px';
      lab.style.top = ly - 9 + 'px';
      const ex = phone.right - sr.left + 12;
      d += `M${p[0].toFixed(1)} ${p[1].toFixed(1)} H${ex} L${(ex + 10).toFixed(1)} ${ly.toFixed(1)} H${x0} `;
      dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2"/>`;
    });
    svg.innerHTML = `<path d="${d}"/>${dots}`;
    svg.classList.add('on');
  }

  /* The hero is held while the page slides over it, dimming as it goes. */
  function heroHold() {
    const h = $('.hero');
    if (RM) return;
    const set = () => { h.style.top = Math.min(0, innerHeight - h.offsetHeight) + 'px'; };
    set();
    addEventListener('resize', debounce(set, 150));
    let hidden = false;
    onScroll(() => {
      const q = clamp((scrollY - Math.max(0, h.offsetHeight - innerHeight)) / innerHeight, 0, 1);
      h.style.setProperty('--hold', q.toFixed(3));
      const hide = q >= 1;
      if (hide !== hidden) { hidden = hide; h.style.visibility = hide ? 'hidden' : ''; }
    });
  }

  /* ── tape ─────────────────────────────────────────────────────────────────── */
  function tape() {
    const track = $('#tape-track');
    const cell = (e, dup) => `<div class="tape-cell${dup ? ' dup' : ''}"><span class="d">${pad(e.d)} ${MON3}</span><span class="t">${e.t}</span><span class="c">${e.rec ? e.c : 'previsto'}</span><span class="v ${e.dir === 'in' ? 'pos' : 'neg'}">${flow(e.v, e.dir)}</span></div>`;
    const list = EVENTS.slice().sort((a, b) => a.d - b.d);
    track.innerHTML = list.map((e) => cell(e)).join('') + list.map((e) => cell(e, true)).join('');
    requestAnimationFrame(() => { track.style.animationDuration = (track.scrollWidth / 2 / 38).toFixed(1) + 's'; });
  }

  /* ── scroll plumbing ─────────────────────────────────────────────────────── */
  const SCROLLERS = [];
  function onScroll(fn) { SCROLLERS.push(fn); }
  const SCRUBS = [];
  function scrub(el, render) {
    const s = { el, render, p: -1 };
    SCRUBS.push(s);
    if (RM) { render(1); s.p = 1; }
    return s;
  }
  let ticking = false;
  function frameScroll() {
    ticking = false;
    for (const f of SCROLLERS) f();
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
  function requestScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frameScroll); } }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  /* ── O mês: the month drawn by your scroll ──────────────────────────────── */
  function mes() {
    const host = $('#mes-chart');
    const num = $('#mes-num'), cap = $('#mes-cap'), ev = $('#mes-event'), notif = $('#mes-notif');
    const says = $$('.mes-say p');
    const pts = monthPoints();
    const NS = 'http://www.w3.org/2000/svg';
    let W = 0, H = 0, svg, small = false;
    const labelsAt = () => (small ? [1, 10, 22] : [1, 3, 10, 12, 14, 22, 28]);

    function build() {
      W = host.clientWidth; H = host.clientHeight;
      small = W < 640;
      host.innerHTML = '';
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      host.appendChild(svg);
      last = -1;
      paint(curP);
    }
    let curP = RM ? 1 : 0, last = -1;
    const AX = 26;

    function paint(p) {
      curP = p;
      if (!svg) return;
      const drawT = clamp(p / 0.8, 0, 1);
      const d = 1 + drawT * (N - 1);                       // the head, in days
      const z = RM ? 0 : easeInOut(clamp((d - TODAY - 0.4) / 2.6, 0, 1));
      // Zoom: once today is passed the instrument leans in on what is still to come.
      const fullLo = Math.min(...pts), fullHi = Math.max(...pts);
      const lo = lerp(fullLo, -95000, z), hi = lerp(fullHi, 165000, z);
      const top = 28, bot = H - AX - 14;
      const y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
      const x = (i) => (i / (N - 1)) * W;
      const c = pts.map((v, i) => [x(i), y(v)]);
      const s = (a) => a.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L ');
      const split = TODAY - 1;
      const hx = x(d - 1);
      const fi = clamp(Math.floor(d - 1), 0, N - 1), fr = d - 1 - fi;
      const val = fi >= N - 1 ? pts[N - 1] : lerp(pts[fi], pts[fi + 1], fr);
      const hy = y(val);
      const zeroOn = d >= 21.6;
      const zeroY = y(0);
      const ti = 21;
      const end = pts[N - 1];
      const passed = (day) => d >= day - 0.02;

      let lbl = '';
      for (const e of EVENTS) {
        if (!e.big || !labelsAt().includes(e.d)) continue;
        const i = e.d - 1;
        const prev = i > 0 ? pts[i - 1] : OPENING;
        const yy = Math.min(y(prev), y(pts[i]));
        const below = e.d === 3;
        const raw = below ? Math.max(y(prev), y(pts[i])) + 22 : yy - 16;
        if (raw < 10 || raw > bot) continue;
        const ly = raw;
        const anchor = e.d >= N - 4 ? 'end' : e.d <= 2 ? 'start' : 'middle';
        lbl += `<text class="lbl" x="${x(i).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" opacity="${passed(e.d) ? 1 : 0}">${e.t} <tspan class="v" fill="${e.dir === 'in' ? '#3FBF74' : '#E5484D'}">${e.dir === 'in' ? '+' : ''}${brlShort(e.v)}</tspan></text>`;
      }
      let ticks = '';
      for (let i = 1; i <= N; i++) {
        const tx = x(i - 1);
        const major = i === 1 || i === N || i % 5 === 0;
        ticks += `<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${H - AX}" y2="${H - AX + (major ? 6 : 3)}" stroke="${i === TODAY ? '#F2F4F7' : '#333945'}"/>`;
        const room = small ? 3 : 2;
        if ((major && Math.abs(i - TODAY) > room && (N - i > room || i === N)) || i === N) ticks += `<text x="${tx.toFixed(1)}" y="${H - 4}" text-anchor="${i === 1 ? 'start' : i === N ? 'end' : 'middle'}">${pad(i)}</text>`;
      }
      ticks += `<text x="${x(split).toFixed(1)}" y="${H - 4}" text-anchor="middle" fill="#F2F4F7">hoje ${pad(TODAY)}</text>`;

      svg.innerHTML = `
        <defs>
          <clipPath id="mc-frame"><rect x="-12" y="0" width="${W + 24}" height="${bot + 10}"/></clipPath>
          <clipPath id="mc-veil"><rect x="-12" y="0" width="${(hx + 12).toFixed(1)}" height="${bot + 10}"/></clipPath>
          <radialGradient id="mc-glow"><stop offset="0" stop-color="#F2F4F7" stop-opacity=".35"/><stop offset="1" stop-color="#F2F4F7" stop-opacity="0"/></radialGradient>
        </defs>
        <line x1="0" x2="${W}" y1="${H - AX}" y2="${H - AX}" stroke="#22262E"/>
        ${ticks}
        <g clip-path="url(#mc-frame)">
          <line x1="0" x2="${W}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#E5484D" stroke-opacity="${zeroOn ? 0.5 : 0}" style="transition:stroke-opacity .5s"/>
          <text x="${W}" y="${(zeroY - 7).toFixed(1)}" text-anchor="end" fill="#E5484D" opacity="${zeroOn ? 0.8 : 0}" style="transition:opacity .5s">R$ 0</text>
          <g clip-path="url(#mc-veil)">
            <path d="M ${c[0][0]},${y(Math.max(lo, 0)).toFixed(1)} L ${s(c.slice(0, split + 1))} L ${c[split][0]},${y(Math.max(lo, 0)).toFixed(1)} Z" fill="#F2F4F7" fill-opacity="${(0.06 * (1 - z)).toFixed(3)}"/>
            <path d="M ${s(c.slice(0, split + 1))}" fill="none" stroke="#F2F4F7" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
            <path d="M ${s(c.slice(split))}" fill="none" stroke="#9BA1AC" stroke-width="2.4" stroke-dasharray="4 7" stroke-linejoin="round" stroke-linecap="round"/>
            ${zeroOn ? `<line x1="${x(ti)}" x2="${x(ti)}" y1="${y(pts[ti]).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#E5484D" stroke-opacity=".7" stroke-dasharray="2 3"/>` : ''}
          </g>
          ${d >= TODAY ? `<circle cx="${x(split)}" cy="${y(pts[split]).toFixed(1)}" r="8" fill="#08090B"/><circle cx="${x(split)}" cy="${y(pts[split]).toFixed(1)}" r="4.5" fill="#F2F4F7"/>` : ''}
          ${lbl}
        </g>
        ${d < N - 0.01 ? `<line x1="${hx.toFixed(1)}" x2="${hx.toFixed(1)}" y1="${hy.toFixed(1)}" y2="${H - AX}" stroke="#F2F4F7" stroke-opacity=".18"/>
          <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="26" fill="url(#mc-glow)"/>
          <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5" fill="${d > TODAY ? '#08090B' : '#F2F4F7'}" stroke="#F2F4F7" stroke-width="2"/>` : `
          <text x="${W}" y="${(y(end) - 30).toFixed(1)}" text-anchor="end" font-family="Geist, sans-serif" font-size="12" fill="#737B88">fim do mês</text>
          <text x="${W}" y="${(y(end) - 12).toFixed(1)}" text-anchor="end" font-size="14" font-weight="500" fill="#9BA1AC">${brlShort(end)}</text>`}`;

      // The readout follows the head, digit by digit.
      const day = Math.round(d);
      setAmt(num, val, { dots: true });
      num.classList.toggle('is-neg', val < 0);
      cap.textContent = day < TODAY ? `saldo no dia ${pad(day)}` : day === TODAY ? `saldo hoje · dia ${pad(TODAY)}` : `previsto para o dia ${pad(day)}`;
      const k = Math.floor(d + 0.02);
      if (k !== last) {
        last = k;
        const seen = EVENTS.filter((e) => e.d <= k && (e.big || !e.rec || e.v >= 10000)).slice(-2).reverse();
        ev.innerHTML = seen.map((e) => `<p><b>${e.t}</b><span class="${e.dir === 'in' ? 'pos' : 'neg'}">${flow(e.v, e.dir)}</span> <span class="faint">· dia ${pad(e.d)}${e.rec ? '' : ' · previsto'}</span></p>`).join('');
      }
      const phase = d < TODAY - 0.5 ? 0 : d < TODAY + 1 ? 1 : d < 21.6 ? 2 : 3;
      says.forEach((e, i) => e.classList.toggle('on', i === phase));
      notif.classList.toggle('on', p >= 0.84);
    }
    build();
    addEventListener('resize', debounce(build, 150));
    scrub($('#scrub-mes'), paint);
  }

  /* ── Otto: voice, draft, confirmation, answer ───────────────────────────── */
  function otto() {
    const steps = $$('#otto-steps li');
    const now = $('#otto-now');
    const feed = $('#o-feed');
    const empty = $('#o-empty'), nova = $('#o-new');
    const input = $('#o-input'), draft = $('#o-draft'), send = $('#o-send');
    const rec = $('#o-rec'), trans = $('#o-trans'), clock = $('#o-clock'), traceEl = $('#o-trace');
    const card = $('[data-o="card"]'), cardLabel = $('#o-card-label'), confirm = $('#o-confirm');
    const trace = $('#otto-trace');
    const Q1 = 'gastei 42 e 90 no almoço, no nubank';
    const Q2 = 'e quanto posso gastar até o fim do mês?';
    const show = (k, on) => $(`[data-o="${k}"]`).classList.toggle('on', on);
    // The level trace: about three seconds of voice, in ink, drawn from a seeded sequence.
    traceEl.innerHTML = Array.from({ length: 32 }, () => '<i></i>').join('');
    const bars = $$('i', traceEl);
    let recording = false;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    setInterval(() => {
      if (!recording || document.hidden) return;
      const v = 0.15 + rnd() * 0.85 * (0.5 + 0.5 * Math.sin(performance.now() / 260));
      bars.forEach((b, i) => { if (i < bars.length - 1) b.style.height = bars[i + 1].style.height; });
      bars[bars.length - 1].style.height = `calc(${(3 + v * 19).toFixed(1)} * var(--u))`;
    }, 100);
    bars.forEach((b) => (b.style.height = 'calc(3 * var(--u))'));

    let lastStep = -1;
    function paint(p) {
      const P = clamp(p, 0, 0.9999) * 5;
      const i = Math.floor(P), t = P - i;
      steps.forEach((li, k) => { li.classList.toggle('on', k === i); li.style.setProperty('--p', k === i ? t.toFixed(3) : k < i ? 0 : 0); });
      if (i !== lastStep && now) {
        lastStep = i;
        const li = steps[i];
        now.innerHTML = `<p><span class="mono">${pad(i + 1)}</span><b>${li.querySelector('b').textContent}</b></p><em>${li.querySelector('em').textContent}</em>`;
      }
      const at = (step, tt) => i > step || (i === step && t >= tt);
      // 01 — recording
      recording = i === 0 && t >= 0.12;
      rec.classList.toggle('on', recording);
      if (recording) clock.textContent = `0:${pad(Math.min(4, Math.floor((t - 0.12) / 0.88 * 5)))}`;
      // 02 — transcribing, then the words land in the draft
      trans.classList.toggle('on', i === 1 && t < 0.3);
      let text = '';
      if (i === 1 && t >= 0.3) text = Q1.slice(0, Math.ceil(clamp((t - 0.3) / 0.55, 0, 1) * Q1.length));
      if (i === 4 && t < 0.35) text = Q2.slice(0, Math.ceil(clamp(t / 0.3, 0, 1) * Q2.length));
      draft.textContent = text;
      input.classList.toggle('has', !!text);
      input.classList.toggle('typing', !!text || (i === 1 && t >= 0.3));
      send.classList.toggle('live', !!text);
      // 03 — sent; Otto thinks; the plan arrives between two rules
      const sent1 = at(2, 0.06);
      empty.style.display = sent1 ? 'none' : '';
      nova.classList.toggle('on', sent1);
      show('u1', sent1);
      show('t1', i === 2 && t >= 0.06 && t < 0.34);
      show('card', at(2, 0.34));
      // 04 — confirmed
      confirm.classList.toggle('press', i === 3 && t >= 0.3 && t < 0.45);
      const done = at(3, 0.45);
      card.classList.toggle('done', done);
      cardLabel.textContent = done ? 'REGISTRAR GASTO' : 'CONFIRMAR · REGISTRAR GASTO';
      // 05 — the question, and the answer from the same engine the home screen draws
      show('u2', at(4, 0.36));
      show('t2', i === 4 && t >= 0.36 && t < 0.56);
      show('a2', at(4, 0.56));
      if (trace) trace.classList.toggle('on', at(4, 0.56));
    }
    scrub($('#scrub-otto'), paint);
    if (RM) { $$('#otto-steps li').forEach((li) => li.classList.add('on')); }
  }

  /* ── Registrar: the keypad, live ─────────────────────────────────────────── */
  function registrar() {
    const whole = $('#r-whole'), cts = $('#r-cts'), read = $('.r-read');
    const go = $('#r-go'), snack = $('#r-snack'), cat = $('#r-cat');
    const keys = $('#r-keys'), chips = $('#r-chips'), desc = $('#r-desc');
    let cents = 0, category = null, auto = true, inView = false;
    function show() {
      const p = parts(cents);
      whole.textContent = p.whole; cts.textContent = ',' + p.cents;
      read.classList.toggle('live', cents > 0);
      whole.classList.remove('bump'); void whole.offsetWidth; whole.classList.add('bump');
      go.disabled = cents === 0;
      cat.textContent = category || 'Outros';
      desc.textContent = `Opcional · fica “${category || 'Outros'}”`;
      cat.classList.toggle('set', !!category);
    }
    function press(k) {
      if (k === 'del') cents = Math.floor(cents / 10);
      else if (k === '00') { if (cents < 1e7) cents *= 100; }
      else if (cents < 1e8) cents = cents * 10 + Number(k);
      show();
    }
    function flash(btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 140); }
    function pick(name) {
      category = category === name ? null : name;
      $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === category)));
      show();
    }
    function commit() {
      if (!cents) return;
      snack.textContent = `Saída lançada: ${brl(cents)} em ${category || 'Outros'}.`;
      snack.classList.add('on');
      setTimeout(() => snack.classList.remove('on'), 2400);
      setTimeout(() => { cents = 0; category = null; $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', 'false')); show(); }, 900);
    }
    $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    keys.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; auto = false; press(b.dataset.k); });
    chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; auto = false; pick(b.dataset.cat); });
    go.addEventListener('click', () => { auto = false; commit(); });
    addEventListener('keydown', (e) => {
      if (!inView || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea')) return;
      let k = null;
      if (/^[0-9]$/.test(e.key)) k = e.key; else if (e.key === 'Backspace') k = 'del';
      if (k) { e.preventDefault(); auto = false; press(k); const b = $(`[data-k="${k}"]`, keys); if (b) flash(b); }
      else if (e.key === 'Enter' && cents && !e.target.closest('a, button')) { e.preventDefault(); auto = false; flash(go); commit(); }
    });
    show();
    go.disabled = true;
    const io = new IntersectionObserver(async (es) => {
      inView = es[0].isIntersecting;
      if (!inView || !auto || RM) return;
      io.disconnect();
      inView = true;
      new IntersectionObserver((x) => { inView = x[0].isIntersecting; }, { threshold: 0.3 }).observe(keys);
      // A first lançamento, typed by itself: four digits, a category, Lançar.
      await wait(700);
      for (const k of ['4', '2', '9', '0']) { if (!auto) return; const b = $(`[data-k="${k}"]`, keys); flash(b); press(k); await wait(300); }
      await wait(350); if (!auto) return;
      pick('Alimentação');
      await wait(650); if (!auto) return;
      flash(go); commit();
    }, { threshold: 0.45 });
    io.observe(keys);
  }

  /* ── Categorias: the month's spending, falling into a ring ──────────────── */
  const SLICES = [
    { k: 'Moradia', hue: '#D07A53', v: 185000, icon: 'M3.5 10.5 12 3.5l8.5 7M5.5 9v11h13V9M9.8 20v-6h4.4v6' },
    { k: 'Mercado', hue: '#2BA19D', v: 59419, icon: 'M2.5 3.5h2.3l2.4 11h10.4l2-7.5H6' },
    { k: 'Alimentação', hue: '#876114', v: 28960, cap: 21000, icon: 'M7 3v6.5a2 2 0 0 0 4 0V3 M9 9.5V21 M17 3c-1.6 1.4-2.2 3-2.2 5.2 0 1.7.7 2.6 2.2 2.8V21' },
    { k: 'Transporte', hue: '#3175BC', v: 28110, icon: 'M3 15.5v-3l2-5.2A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.3l2 5.2v3 M3.5 12.5h17' },
    { k: 'Demais', hue: '#737B88', v: 82915, rest: true, icon: 'M11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5L11 22 2 13l9.5-9.5Z M16.5 7.8h.01' },
  ];
  function categorias() {
    const SIZE = 208, STROKE = 26, R = (SIZE - STROKE) / 2, CIRC = 2 * Math.PI * R, GAP = 2 / CIRC, POP = 8;
    const sum = SLICES.reduce((n, s) => n + s.v, 0);
    let at = 0;
    const arcs = SLICES.map((s) => {
      const start = at; at += s.v / sum;
      const end = at - GAP;
      const broke = s.cap && s.v > s.cap ? start + (end - start) * (s.cap / s.v) : null;
      return { ...s, start, end, stop: at, broke, share: Math.round((s.v / sum) * 100) };
    });
    const svg = $('#donut-svg'), mid = $('#donut-mid'), legend = $('#legend'), top = $('#cat-legend-top');
    top.innerHTML = arcs.map((a) => `<li><i style="background:${a.hue}"></i>${a.k}</li>`).join('');
    const C = SIZE / 2;
    svg.innerHTML = `<g transform="rotate(-90 ${C} ${C})">
      <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#22262E" stroke-width="${STROKE}" opacity=".5"/>
      ${arcs.map((a, i) => `<circle class="arc" data-i="${i}" cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${a.hue}" stroke-width="${STROKE}"/>${a.broke != null ? `<circle class="arc over" data-i="${i}" cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#E5484D" stroke-width="${STROKE}"/>` : ''}`).join('')}
      ${arcs.filter((a) => a.broke != null).map((a) => { const ang = a.broke * 2 * Math.PI, h = (STROKE + POP) / 2 + 1; return `<line class="cut" x1="${C + (R - h) * Math.cos(ang)}" y1="${C + (R - h) * Math.sin(ang)}" x2="${C + (R + h) * Math.cos(ang)}" y2="${C + (R + h) * Math.sin(ang)}" stroke="#08090B" stroke-width="2"/>`; }).join('')}
    </g>`;
    const hueEls = $$('.arc:not(.over)', svg), overEls = $$('.arc.over', svg), cut = $('.cut', svg);
    legend.innerHTML = arcs.map((a, i) => {
      const pct = a.cap ? Math.round((a.v / a.cap) * 100) : null;
      return `<button type="button" class="lg-item" data-i="${i}" aria-pressed="false"><span class="dot" style="background:${a.hue}"></span><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:#9BA1AC;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none"><path d="${a.icon}"/></svg><span class="nm"><span>${a.k}</span><small><span class="mono">${a.share}%</span> das saídas${pct ? ` · <b><span class="mono">${pct}%</span> do teto</b>` : ''}</small></span><span class="v"><small>R$ </small>${parts(a.v).whole}<small>,${parts(a.v).cents}</small></span></button>`;
    }).join('');
    let focus = null, sweep = RM ? 1 : 0;
    function center() {
      if (focus == null) mid.innerHTML = `<span class="big neg"><small>R$</small>${group(Math.round(sum / 100))}</span><span class="lab">no total</span><span class="lab">8% abaixo dos 30 dias anteriores</span>`;
      else { const a = arcs[focus]; mid.innerHTML = `<span class="name">${a.k}</span><span class="big"><small>R$</small>${group(Math.round(a.v / 100))}</span><span class="lab"><span class="mono">${a.share}%</span> das saídas</span>`; }
    }
    function drawRing() {
      arcs.forEach((a, i) => {
        const hueEnd = a.broke ?? a.end;
        const len = Math.max(0, Math.min(sweep, hueEnd) - a.start) * CIRC;
        const st = focus === i ? STROKE + POP : STROKE;
        const op = focus != null && focus !== i ? 0.28 : 1;
        Object.assign(hueEls[i].style, { strokeDasharray: `${len} ${CIRC - len}`, strokeDashoffset: -a.start * CIRC, strokeWidth: st, opacity: op });
        if (a.broke != null) {
          const o = overEls[0];
          const l2 = Math.max(0, Math.min(sweep, a.end) - a.broke) * CIRC;
          Object.assign(o.style, { strokeDasharray: `${l2} ${CIRC - l2}`, strokeDashoffset: -a.broke * CIRC, strokeWidth: st, opacity: op });
          cut.style.opacity = sweep > a.broke ? 1 : 0;
        }
      });
      $$('.lg-item', legend).forEach((b, i) => { b.classList.toggle('dim', focus != null && focus !== i); b.setAttribute('aria-pressed', String(focus === i)); });
    }
    function toggle(i) { focus = focus === i ? null : i; center(); drawRing(); }
    svg.addEventListener('click', (e) => { const a = e.target.closest('.arc'); if (a) toggle(+a.dataset.i); else if (focus != null) toggle(focus); });
    svg.addEventListener('mouseover', (e) => { const a = e.target.closest('.arc'); if (a && FINE && focus !== +a.dataset.i) { focus = +a.dataset.i; center(); drawRing(); } });
    svg.addEventListener('mouseleave', () => { if (FINE && focus != null) { focus = null; center(); drawRing(); } });
    legend.addEventListener('click', (e) => { const b = e.target.closest('.lg-item'); if (b) toggle(+b.dataset.i); });
    center(); drawRing();

    // Particles (wide screens): the month's lançamentos as dots, sorted by category, falling into the ring.
    const canvas = $('#cat-canvas');
    const ctx = canvas.getContext('2d');
    const donut = $('#donut');
    let P = [], cw = 0, ch = 0, dpr = 1, ringXY = null;
    const wide = () => innerWidth > 860 && !RM;
    function seedParticles() {
      dpr = Math.min(2, devicePixelRatio || 1);
      cw = canvas.clientWidth; ch = canvas.clientHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      const cr = canvas.getBoundingClientRect(), dr = donut.getBoundingClientRect();
      const scale = dr.width / SIZE;
      ringXY = { x: dr.left - cr.left + dr.width / 2, y: dr.top - cr.top + dr.height / 2, r: R * scale, s: STROKE * scale };
      let rs = 11;
      const rand = () => ((rs = (rs * 48271) % 2147483647) / 2147483647);
      P = [];
      const total = 760;
      arcs.forEach((a, ai) => {
        const n = Math.max(24, Math.round(total * (a.v / sum)));
        // Each category starts as a loose cloud of its own, spread across the stage.
        const cx = cw * (0.5 + ai * 0.105), cy = ch * (0.26 + ((ai * 2) % 5) * 0.12);
        for (let j = 0; j < n; j++) {
          const ang = rand() * Math.PI * 2, rad = Math.pow(rand(), 0.7) * Math.min(cw, ch) * 0.34;
          const u = rand();
          const ta = (a.start + u * (a.end - a.start)) * Math.PI * 2 - Math.PI / 2;
          const tr = ringXY.r + (rand() - 0.5) * ringXY.s * 0.85;
          const over = a.broke != null && a.start + u * (a.end - a.start) > a.broke;
          P.push({ x0: cx + Math.cos(ang) * rad * 1.5, y0: cy + Math.sin(ang) * rad, x1: ringXY.x + Math.cos(ta) * tr, y1: ringXY.y + Math.sin(ta) * tr,
            c: over ? '#E5484D' : a.hue, r: 0.8 + rand() * 1.6, d: rand() * 0.35, tw: rand() * Math.PI * 2, glow: rand() < 0.08 });
        }
      });
    }
    let catP = 0;
    function particles(p) {
      if (!wide()) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const conv = clamp(p / 0.5, 0, 1);
      const fade = 1 - clamp((p - 0.5) / 0.12, 0, 1);
      if (fade <= 0) return;
      const tnow = performance.now() / 1000;
      for (const q of P) {
        const t = easeInOut(clamp((conv - q.d * 0.6) / (1 - q.d * 0.6), 0, 1));
        const drift = (1 - t) * 6;
        const x = lerp(q.x0, q.x1, t) + Math.cos(tnow * 0.7 + q.tw) * drift;
        const y = lerp(q.y0, q.y1, t) + Math.sin(tnow * 0.6 + q.tw) * drift;
        const a = (0.35 + 0.5 * t) * fade;
        if (q.glow) { ctx.globalAlpha = a * 0.25; ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(x, y, q.r * 4, 0, 7); ctx.fill(); }
        ctx.globalAlpha = a;
        ctx.fillStyle = q.c;
        ctx.beginPath(); ctx.arc(x, y, q.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function paint(p) {
      catP = p;
      if (wide()) {
        sweep = clamp((p - 0.48) / 0.2, 0, 1);
        top.style.opacity = 1 - clamp((p - 0.45) / 0.1, 0, 1);
        const show = clamp((p - 0.62) / 0.1, 0, 1);
        mid.style.opacity = show; legend.style.opacity = show;
        legend.style.pointerEvents = show > 0.5 ? '' : 'none';
      } else { top.style.opacity = 1; mid.style.opacity = 1; legend.style.opacity = 1; legend.style.pointerEvents = ''; }
      drawRing();
      particles(p);
    }
    // Small screens: no particles; the ring rules itself when it arrives.
    function narrow() {
      if (wide()) return;
      if (RM) { sweep = 1; drawRing(); return; }
      sweep = 0; drawRing();
      const io = new IntersectionObserver((es) => {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        tween(0, 1, 1100, (v) => { sweep = v; drawRing(); });
      }, { threshold: 0.4 });
      io.observe(donut);
    }
    seedParticles();
    let raf = 0;
    const loop = () => { raf = 0; if (wide() && catP > 0 && catP < 0.62) { particles(catP); raf = requestAnimationFrame(loop); } };
    const s = scrub($('#scrub-cat'), (p) => { paint(p); if (!raf) raf = requestAnimationFrame(loop); });
    addEventListener('resize', debounce(() => { seedParticles(); if (wide()) paint(s.p < 0 ? 0 : s.p); else narrow(); }, 200));
    if (!wide()) narrow(); else paint(0);
  }

  /* ── Dívida compartilhada ────────────────────────────────────────────────── */
  function divida() {
    const TOTAL = 10, EACH = 29160;
    let paid = 3, revoked = false;
    const first = { y: 2026, m: 7 };  // first installment: 10 de agosto de 2026
    const monthAt = (n) => { const d = new Date(first.y, first.m + n, 10); return d; };
    const ticks = $('#d-ticks'), count = $('#d-count'), left = $('#d-left'), next = $('#d-next'), endEl = $('#d-end');
    const pays = $('#d-pays'), page = $('#d-page'), payBtn = $('#d-pay'), revBtn = $('#d-revoke'), url = $('#d-url span');
    ticks.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<i class="${i < paid ? 'paid' : ''}"></i>`).join('');
    const payRow = (n) => { const d = monthAt(n - 1); return `<div class="pay"><span><span class="mono faint">${pad(n)}</span>&nbsp;&nbsp;${d.getDate()} de ${MONTHS[d.getMonth()]} <span class="faint">· no dia</span></span><span>R$ 291,60</span></div>`; };
    pays.innerHTML = [3, 2, 1].map(payRow).join('');
    const end = monthAt(TOTAL - 1);
    endEl.textContent = `${MONTHS[end.getMonth()]} de ${end.getFullYear()}`;
    function facts() {
      count.textContent = `${paid}/${TOTAL}`;
      if (paid < TOTAL) { const n = monthAt(paid); next.textContent = `${n.getDate()} de ${MONTHS[n.getMonth()]}`; }
      else { next.parentElement.style.display = 'none'; endEl.previousElementSibling.textContent = 'terminou'; }
    }
    facts();
    setAmt(left, (TOTAL - paid) * EACH);
    payBtn.addEventListener('click', () => {
      if (revoked || paid >= TOTAL) return;
      const from = (TOTAL - paid) * EACH;
      paid++;
      const t = ticks.children[paid - 1];
      t.classList.add('paid', 'just');
      setTimeout(() => t.classList.remove('just'), 1300);
      facts();
      pays.insertAdjacentHTML('afterbegin', payRow(paid));
      if (paid >= TOTAL) {
        left.innerHTML = '<span class="whole" style="font-family:var(--sans)">Quitada</span>';
        left.nextElementSibling.textContent = `todas as ${TOTAL} parcelas pagas`;
        payBtn.disabled = true;
      } else tween(from, (TOTAL - paid) * EACH, 700, (v) => setAmt(left, v));
    });
    revBtn.addEventListener('click', () => {
      revoked = !revoked;
      page.classList.toggle('revoked', revoked);
      revBtn.textContent = revoked ? 'Gerar um link novo' : 'Revogar o link';
      revBtn.classList.toggle('btn-danger', !revoked);
      payBtn.disabled = revoked || paid >= TOTAL;
      if (!revoked) url.textContent = 'otto-financas.vercel.app/divida/' + Math.random().toString(36).slice(2, 6) + '…';
      $('#d-live-word').textContent = revoked ? 'LINK REVOGADO' : 'AO VIVO';
    });
    const place = () => callouts('#div-stage', '#div-callouts', (stage) => {
      const sr = stage.getBoundingClientRect();
      const r = (el, fx = 1) => { const b = $(el).getBoundingClientRect(); return [b.left + b.width * fx - sr.left, b.top + b.height / 2 - sr.top]; };
      return [{ key: 'd-url', p: r('#d-url', 0.96) }, { key: 'd-live', p: r('#d-live-word', 1.04) }, { key: 'd-ticks', p: r('#d-ticks', 1) }];
    });
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { place(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe($('#div-stage'));
    addEventListener('resize', debounce(place, 200));
  }

  /* ── small things ─────────────────────────────────────────────────────────── */
  function details() {
    // The razão rows and the calendar speak about the same month as everything else.
    $$('.v-razao .vr-rule span:first-child').forEach((e, i) => { const d = new Date(Y, M, 13 + i); e.textContent = `${WK[d.getDay()]} ${pad(13 + i)}`; });
    const cal = $('#v-cal');
    if (cal) {
      const lead = (new Date(Y, M, 1).getDay() + 6) % 7;
      const outs = new Set(EVENTS.filter((e) => e.big && e.dir === 'out').map((e) => e.d).concat(FC.filter((e) => e.dir === 'out').map((e) => e.d)));
      const ins = new Set(EVENTS.filter((e) => e.dir === 'in').map((e) => e.d));
      let h = '';
      for (let i = 0; i < lead; i++) h += '<span></span>';
      for (let d = 1; d <= N; d++) h += `<span class="${d === TODAY ? 'today' : d < TODAY ? 'past' : ''} ${ins.has(d) ? 'in' : outs.has(d) ? 'out' : ''}">${d}</span>`;
      cal.innerHTML = h;
    }
    // The trinco row: the mark sleeps until something it trusts comes near.
    const lockRow = $('.v-lock') && $('.v-lock').closest('.lg-row');
    const lockMark = MARKS.find((m) => m.sleep);
    if (lockRow && lockMark && !RM) {
      const open = () => { lockMark.shut.t = 0; };
      const close = () => { lockMark.shut.t = 1; };
      lockRow.addEventListener('mouseenter', open); lockRow.addEventListener('mouseleave', close);
      lockRow.addEventListener('touchstart', () => { open(); setTimeout(close, 1800); }, { passive: true });
    }
  }

  /* ── boot ─────────────────────────────────────────────────────────────────── */
  mountWordmarks();
  reveals();
  tape();
  hero();
  heroHold();
  mes();
  otto();
  registrar();
  categorias();
  divida();
  details();

  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', requestScroll);
  requestScroll();

  if (!RM) {
    addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; pointer.at = performance.now(); setAway(false); }, { passive: true });
    addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { pointer.x = t.clientX; pointer.y = t.clientY; pointer.seen = true; pointer.at = performance.now(); } }, { passive: true });
    // OTTO closes its eyes when you leave, and opens them, widening, when you come back.
    document.documentElement.addEventListener('mouseleave', () => setAway(true));
    document.documentElement.addEventListener('mouseenter', () => setAway(false));
    document.addEventListener('visibilitychange', () => setAway(document.hidden));
    const loop = (t) => { if (!document.hidden) markFrame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();
