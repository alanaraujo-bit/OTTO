/**
 * OTTO — the launcher mark.
 *
 * Every icon asset in this project is rendered from the geometry below, once, by Chrome. Nothing is
 * traced, exported by hand, or resized from a bigger PNG — a launcher icon is read at 48dp far more
 * often than at 1024, and the only way to keep it honest at that size is to author it as vector and
 * re-render per slot rather than downscale one hero.
 *
 * The mark is the wordmark's face. `src/ui/Wordmark.tsx` establishes that OTTO's two O's are a pair
 * of eyes and that the T's share one crossbar — the same hairline that rules every field in the app.
 * The icon states exactly that and nothing else: two eyes, and the rule above them.
 *
 * Depth is built from lit strokes, not from a filter. Each ring is drawn three times — body, outer
 * lip, inner lip — with vertical gradients in objectBoundingBox space, which is what turns a flat
 * stroke into a machined torus lit from above. Filters are used only for the cast shadow and the
 * bloom, because those are the two things a gradient genuinely cannot do.
 *
 *   node tools/icon.mjs sheets            # variant + launcher-scale proof sheets
 *   node tools/icon.mjs ship <variant>    # overwrite assets/ with the chosen variant
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Design canvas. Also the Android adaptive canvas: 1024 = 108dp. */
const S = 1024;

/**
 * Adaptive-icon zones, in canvas px. The foreground layer is 108dp; the launcher shows the centre
 * 72dp and only guarantees the centre 66dp circle. Anything shipped in the foreground slot is
 * composed against SAFE, never against the full canvas.
 */
const VISIBLE = S * (72 / 108);
const SAFE_R = (S * (66 / 108)) / 2;

/**
 * The face.
 *
 * Read as a set of ratios, not as pixels: `dx` is a little over one ring diameter, which sets the
 * eyes close enough to read as a pair rather than as two unrelated circles, and the brow sits about
 * a third of a ring above them so it reads as a rule the eyes hang under — never as a lid.
 */
const G = {
  cx: 512,
  dx: 156,
  cy: 532,
  rc: 112,
  sw: 46,
  lens: 94,
  pupil: 42,
  pupilDy: -6,
  browY: 352,
  browHw: 276,
  browSw: 30,
};

/** Heavier everything: the themed monochrome icon is alpha-only and gets tinted, so hairlines die. */
const G_MONO = { ...G, sw: 58, browSw: 42, pupil: 48, lens: 0 };

// -- treatments ------------------------------------------------------------------------------------
// Each is a complete answer to "what is this object made of". They differ on the axis that actually
// decides the icon — how it separates from a wallpaper at 48dp — not on three shades of the same
// dark.

const TREATMENTS = {
  /** The instrument. Black machined slab, bezelled eyes over dark glass, warm light from above. */
  machined: {
    label: 'Machined',
    recess: { color: '#000000', o: 0.5 },
    bead: 0.5,
    grain: 0.075,
    ground: [['#1B1E25', 0], ['#0F1217', 0.46], ['#06070A', 1]],
    glow: { color: '#FFEFD8', inner: 0.2, mid: 0.05, cx: 512, cy: 130, r: 760 },
    vignette: 0.42,
    body: [['#FFFFFF', 0], ['#E4E8EE', 0.5], ['#9FA6B1', 1]],
    lipOut: [['#FFFFFF', 0.95, 0], ['#FFFFFF', 0.12, 0.38], ['#FFFFFF', 0, 0.58], ['#000000', 0.3, 0.9], ['#000000', 0.5, 1]],
    lipIn: [['#000000', 0.55, 0], ['#000000', 0.06, 0.44], ['#FFFFFF', 0, 0.62], ['#FFFFFF', 0.14, 0.86], ['#FFFFFF', 0.26, 1]],
    lens: [['#333A46', 0], ['#0D1015', 0.72], ['#161A21', 1]],
    sheen: 0.2,
    pupil: [['#FFFFFF', 0], ['#D3D9E1', 0.55], ['#A7AEB9', 1]],
    glint: null,
    shadow: { dy: 16, blur: 18, color: '#000000', o: 0.62 },
    bloom: null,
  },

  /** Inverted. Warm bone slab, the face cut into it in graphite. The only light-ground candidate. */
  bone: {
    label: 'Bone',
    recess: { color: '#6B5F49', o: 0.42 },
    bead: 0.3,
    grain: 0.05,
    ground: [['#FBF8F1', 0], ['#F0EBE0', 0.5], ['#DED7C8', 1]],
    glow: { color: '#FFFFFF', inner: 0.55, mid: 0.14, cx: 512, cy: 130, r: 780 },
    vignette: 0.1,
    body: [['#2C313A', 0], ['#1B1F26', 0.5], ['#0E1116', 1]],
    lipOut: [['#000000', 0.34, 0], ['#000000', 0.05, 0.4], ['#FFFFFF', 0, 0.6], ['#FFFFFF', 0.16, 0.9], ['#FFFFFF', 0.3, 1]],
    lipIn: [['#FFFFFF', 0.2, 0], ['#FFFFFF', 0.02, 0.42], ['#000000', 0, 0.6], ['#000000', 0.18, 1]],
    lens: [['#E7E0D2', 0], ['#CFC7B6', 1]],
    sheen: 0,
    pupil: [['#20242B', 0], ['#0C0F13', 1]],
    glint: 0.62,
    shadow: { dy: 14, blur: 20, color: '#4A4133', o: 0.4 },
    bloom: null,
  },

  /** The signal. Near-black, no glass, the mark emitting. Built to survive 48dp on any wallpaper. */
  beacon: {
    label: 'Beacon',
    recess: null,
    bead: 0,
    grain: 0.07,
    ground: [['#14171D', 0], ['#0A0C10', 0.55], ['#050608', 1]],
    glow: { color: '#FFF6E8', inner: 0.13, mid: 0.035, cx: 512, cy: 520, r: 560 },
    vignette: 0.5,
    body: [['#FFFFFF', 0], ['#FBFCFD', 0.6], ['#E6EAF0', 1]],
    lipOut: [['#FFFFFF', 0.9, 0], ['#FFFFFF', 0.2, 0.5], ['#FFFFFF', 0, 1]],
    lipIn: [['#000000', 0.2, 0], ['#000000', 0, 0.5], ['#FFFFFF', 0, 1]],
    lens: null,
    sheen: 0,
    pupil: [['#FFFFFF', 0], ['#FFFFFF', 1]],
    glint: null,
    shadow: { dy: 0, blur: 0.01, color: '#000000', o: 0 },
    bloom: { color: '#FFE9CC', o: 0.5, blur: 26 },
  },

  /**
   * The outlier, on purpose. DESIGN.md bans a brand hue on screens; the launcher is not a screen,
   * and a chroma ground is the loudest available answer to "stand out among other apps". Included so
   * the choice between no-hue and hue is made deliberately rather than by default.
   */
  ember: {
    label: 'Ember',
    recess: { color: '#4A1204', o: 0.5 },
    bead: 0.35,
    grain: 0.06,
    ground: [['#F0722A', 0], ['#D64A16', 0.52], ['#8E2A0C', 1]],
    glow: { color: '#FFD9A8', inner: 0.4, mid: 0.1, cx: 512, cy: 140, r: 780 },
    vignette: 0.28,
    body: [['#2A1810', 0], ['#1A0E09', 0.5], ['#0D0705', 1]],
    lipOut: [['#000000', 0.3, 0], ['#000000', 0.04, 0.4], ['#FFFFFF', 0, 0.6], ['#FFC98A', 0.3, 0.92], ['#FFD9A8', 0.5, 1]],
    lipIn: [['#FFB067', 0.26, 0], ['#FFB067', 0.02, 0.44], ['#000000', 0, 0.6], ['#000000', 0.2, 1]],
    lens: [['#C2440F', 0], ['#8A2A0A', 1]],
    sheen: 0.1,
    pupil: [['#1E0F08', 0], ['#0A0503', 1]],
    glint: 0.5,
    shadow: { dy: 14, blur: 18, color: '#4A1204', o: 0.5 },
    bloom: null,
  },
};

// -- svg -------------------------------------------------------------------------------------------

/** `[color, offset]` or `[color, opacity, offset]`. */
const stops = (list) =>
  list
    .map((s) =>
      s.length === 2
        ? `<stop offset="${s[1]}" stop-color="${s[0]}"/>`
        : `<stop offset="${s[2]}" stop-color="${s[0]}" stop-opacity="${s[1]}"/>`,
    )
    .join('');

/** Vertical, in objectBoundingBox space — so every shape is lit from its own top, at any scale. */
const vgrad = (id, list) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops(list)}</linearGradient>`;

function defs(p, t, g) {
  const sh = t.shadow;
  return `<defs>
    ${vgrad(`${p}-body`, t.body)}
    ${vgrad(`${p}-lipO`, t.lipOut)}
    ${vgrad(`${p}-lipI`, t.lipIn)}
    ${vgrad(`${p}-pupil`, t.pupil)}
    ${t.lens ? `<radialGradient id="${p}-lens" cx="0.36" cy="0.28" r="0.82">${stops(t.lens)}</radialGradient>` : ''}
    ${t.ground ? vgrad(`${p}-ground`, t.ground) : ''}
    ${
      t.glow
        ? `<radialGradient id="${p}-glow" gradientUnits="userSpaceOnUse" cx="${t.glow.cx}" cy="${t.glow.cy}" r="${t.glow.r}">
             <stop offset="0" stop-color="${t.glow.color}" stop-opacity="${t.glow.inner}"/>
             <stop offset="0.52" stop-color="${t.glow.color}" stop-opacity="${t.glow.mid}"/>
             <stop offset="1" stop-color="${t.glow.color}" stop-opacity="0"/>
           </radialGradient>`
        : ''
    }
    <radialGradient id="${p}-vig" gradientUnits="userSpaceOnUse" cx="512" cy="430" r="720">
      <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="${t.vignette}"/>
    </radialGradient>
    <clipPath id="${p}-lensclip"><circle r="${g.lens}"/></clipPath>
    <filter id="${p}-soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    <filter id="${p}-inner" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="${g.lens ? g.lens * 0.11 : 10}"/>
    </filter>
    <filter id="${p}-bead" x="-90%" y="-90%" width="280%" height="280%">
      <feGaussianBlur stdDeviation="${g.pupil * 0.16}"/>
    </filter>
    <filter id="${p}-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0.62  0 0 0 0 0.62  0 0 0 0 0.64  0.4 0.4 0.4 0 -0.16"/>
    </filter>
    <filter id="${p}-cast" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${sh.dy}" stdDeviation="${sh.blur}" flood-color="${sh.color}" flood-opacity="${sh.o}"/>
    </filter>
    ${
      t.bloom
        ? `<filter id="${p}-bloom" x="-45%" y="-45%" width="190%" height="190%">
             <feGaussianBlur stdDeviation="${t.bloom.blur}"/>
             <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0.91  0 0 0 0 0.8  0 0 0 1 0"/>
           </filter>`
        : ''
    }
  </defs>`;
}

/**
 * One eye at the origin: glass, the recess that proves the glass is set below the rim, the bezel,
 * then the pupil sitting on its own contact shadow.
 *
 * The recess is a fat blurred stroke on the lens circle, nudged down and clipped to the lens — so it
 * banks up under the top of the rim and thins out at the bottom, which is what an inner shadow in a
 * bore actually does. Without it the bezel reads as painted on rather than as machined into.
 */
const eye = (p, t, g, flat) => {
  const lipW = Math.max(5, g.sw * 0.16);
  if (flat)
    return `<circle r="${g.rc}" fill="none" stroke="#fff" stroke-width="${g.sw}"/>
            <circle cy="${g.pupilDy}" r="${g.pupil}" fill="#fff"/>`;
  return `
    ${
      t.lens
        ? `<g clip-path="url(#${p}-lensclip)">
             <circle r="${g.lens}" fill="url(#${p}-lens)"/>
             ${t.sheen ? `<ellipse cx="-22" cy="-36" rx="60" ry="30" fill="#fff" opacity="${t.sheen}" transform="rotate(-26 -22 -36)" filter="url(#${p}-soft)"/>` : ''}
             ${t.recess ? `<circle cy="${g.lens * 0.13}" r="${g.lens}" fill="none" stroke="${t.recess.color}" stroke-width="${g.lens * 0.4}" opacity="${t.recess.o}" filter="url(#${p}-inner)"/>` : ''}
           </g>`
        : ''
    }
    <circle r="${g.rc}" fill="none" stroke="url(#${p}-body)" stroke-width="${g.sw}"/>
    <circle r="${g.rc + g.sw / 2 - lipW / 2}" fill="none" stroke="url(#${p}-lipO)" stroke-width="${lipW}"/>
    <circle r="${g.rc - g.sw / 2 + lipW / 2}" fill="none" stroke="url(#${p}-lipI)" stroke-width="${lipW}"/>
    ${t.bead ? `<circle cy="${g.pupilDy + g.pupil * 0.16}" r="${g.pupil}" fill="#000" opacity="${t.bead}" filter="url(#${p}-bead)"/>` : ''}
    <circle cy="${g.pupilDy}" r="${g.pupil}" fill="url(#${p}-pupil)"/>
    ${t.glint ? `<circle cx="${-g.pupil * 0.33}" cy="${g.pupilDy - g.pupil * 0.36}" r="${g.pupil * 0.22}" fill="#fff" opacity="${t.glint}"/>` : ''}`;
};

/**
 * The crossbar, given the same lit treatment so it belongs to the same object as the eyes.
 *
 * Drawn as a rounded rect, never a stroked `<line>`: a line's bounding box has zero height, and an
 * objectBoundingBox gradient over a degenerate box is not painted at all. The bar was there and
 * invisible.
 */
const brow = (p, t, g, flat) => {
  const lipW = Math.max(4, g.browSw * 0.2);
  const x = g.cx - g.browHw - g.browSw / 2;
  const w = 2 * g.browHw + g.browSw;
  const y = g.browY - g.browSw / 2;
  if (flat)
    return `<rect x="${x}" y="${y}" width="${w}" height="${g.browSw}" rx="${g.browSw / 2}" fill="#fff"/>`;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${g.browSw}" rx="${g.browSw / 2}" fill="url(#${p}-body)"/>
    <rect x="${x + lipW}" y="${y}" width="${w - lipW * 2}" height="${lipW}" rx="${lipW / 2}" fill="url(#${p}-lipO)"/>`;
};

/**
 * @param scale 1 fills a full-bleed square; ~0.78 pulls the mark inside the adaptive safe circle.
 */
function markGroup(p, t, g, { scale = 1, flat = false } = {}) {
  const inner = `${brow(p, t, g, flat)}
    <g transform="translate(${g.cx - g.dx},${g.cy})">${eye(p, t, g, flat)}</g>
    <g transform="translate(${g.cx + g.dx},${g.cy})">${eye(p, t, g, flat)}</g>`;
  const lit =
    t.bloom && !flat
      ? `<g filter="url(#${p}-bloom)" opacity="${t.bloom.o}">${inner}</g>${inner}`
      : flat || t.shadow.o === 0
        ? inner
        : `<g filter="url(#${p}-cast)">${inner}</g>`;
  return `<g transform="translate(512,512) scale(${scale}) translate(-512,-512)">${lit}</g>`;
}

const open = (w) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${S} ${S}">`;

/**
 * Two scales, on purpose. HERO fills a full-bleed square the way a store listing wants; the adaptive
 * foreground is FG of it, because the launcher crops to 72dp of the 108dp canvas and parallaxes
 * inside that. One number reused for both would be wrong in one of the two places.
 */
const HERO = 1.17;
const FG = 0.78;
/**
 * The Android 12+ splash masks the icon to a circle and treats the inner two thirds of the canvas as
 * the safe area. The mark's furthest point is a brow cap at r=332 of 512, so anything above ~1.03
 * puts a rounded cap outside that circle. 1.5 looked right in a rectangular frame and would have
 * shipped with the bar clipped at both ends.
 */
const SPLASH = 1;

/** ground + mark: the composed icon. */
export function iconSVG(key, { w = S, scale = HERO, uid = key } = {}) {
  const t = TREATMENTS[key];
  return `${open(w)}${defs(uid, t, G)}
    <rect width="${S}" height="${S}" fill="url(#${uid}-ground)"/>
    ${t.glow ? `<rect width="${S}" height="${S}" fill="url(#${uid}-glow)"/>` : ''}
    <rect width="${S}" height="${S}" fill="url(#${uid}-vig)"/>
    ${t.grain ? `<rect width="${S}" height="${S}" filter="url(#${uid}-grain)" opacity="${t.grain}"/>` : ''}
    <rect width="${S}" height="${S}" fill="url(#${uid}-vig)"/>
    ${t.grain ? `<rect width="${S}" height="${S}" filter="url(#${uid}-grain)" opacity="${t.grain}"/>` : ''}
    ${markGroup(uid, t, G, { scale })}
  </svg>`;
}

/** mark only, on transparency — the adaptive foreground and the splash. */
export function markSVG(key, { w = S, scale = 1, uid = `${key}f` } = {}) {
  const t = TREATMENTS[key];
  return `${open(w)}${defs(uid, t, G)}${markGroup(uid, t, G, { scale })}</svg>`;
}

/** ground only — the adaptive background. Mask-agnostic: gradients, never a contour. */
export function groundSVG(key, { w = S, uid = `${key}b` } = {}) {
  const t = TREATMENTS[key];
  return `${open(w)}${defs(uid, t, G)}
    <rect width="${S}" height="${S}" fill="url(#${uid}-ground)"/>
    ${t.glow ? `<rect width="${S}" height="${S}" fill="url(#${uid}-glow)"/>` : ''}
    <rect width="${S}" height="${S}" fill="url(#${uid}-vig)"/>
    ${t.grain ? `<rect width="${S}" height="${S}" filter="url(#${uid}-grain)" opacity="${t.grain}"/>` : ''}
    <rect width="${S}" height="${S}" fill="url(#${uid}-vig)"/>
    ${t.grain ? `<rect width="${S}" height="${S}" filter="url(#${uid}-grain)" opacity="${t.grain}"/>` : ''}
  </svg>`;
}

/** Alpha-only silhouette for the themed icon. Fatter, because the system tints what survives. */
export function monoSVG(key, { w = S, scale = 1, uid = `${key}m` } = {}) {
  const t = TREATMENTS[key];
  return `${open(w)}${defs(uid, t, G_MONO)}${markGroup(uid, t, G_MONO, { scale, flat: true })}</svg>`;
}

// -- rasteriser ------------------------------------------------------------------------------------

const doc = (body, bg = 'transparent') =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:${bg}}
   svg,img{display:block}</style>${body}`;

async function shoot(browser, html, w, h, out, transparent = false) {
  const page = await browser.newPage();
  await page.setViewport({ width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: 1 });
  await page.setContent(doc(html), { waitUntil: 'load' });
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

/** Superellipse, the launcher mask shape. Sampled — this is a mock, not a shipped path. */
function squircle(size, n = 5) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = Math.sign(c) * Math.abs(c) ** (2 / n) * r;
    const y = Math.sign(s) * Math.abs(s) ** (2 / n) * r;
    pts.push(`${(r + x).toFixed(2)} ${(r + y).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export { TREATMENTS, S, VISIBLE, SAFE_R, squircle, shoot, doc, CHROME, G };

// -- entry -----------------------------------------------------------------------------------------

/**
 * Only when run as the entry point. Importing this module must render nothing — a substring test on
 * the URL fires for the importer too, which quietly re-ran the whole sheet build on every import.
 */
const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoked) {
  const [cmd, arg] = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    // --allow-file-access-from-files is what verify needs: Chrome will load an <img> from file://
    // but silently refuses a CSS url(), so the monochrome tint tiles mask to nothing without it.
    args: [
      '--no-sandbox',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
    ],
  });

  if (cmd === 'ship') {
    const key = arg;
    if (!TREATMENTS[key]) throw new Error(`unknown variant: ${key}`);
    await mkdir('assets', { recursive: true });
    // The grain is not decoration — without it the slab renders as flat digital black and the
    // gradient steps. It is also incompressible, and costs ~750KB at 1024. So the ground is only
    // paid for at full resolution where it is actually seen large; the adaptive background never
    // needs more than 432px (108dp at xxxhdpi), and 512 buys the same dither for a quarter of it.
    const BG = 512;
    await shoot(browser, iconSVG(key), S, S, 'assets/icon.png');
    await shoot(browser, groundSVG(key, { w: BG }), BG, BG, 'assets/android-icon-background.png');
    await shoot(browser, markSVG(key, { scale: FG }), S, S, 'assets/android-icon-foreground.png', true);
    await shoot(browser, monoSVG(key, { scale: FG }), S, S, 'assets/android-icon-monochrome.png', true);
    await shoot(browser, markSVG(key, { scale: SPLASH }), S, S, 'assets/splash-icon.png', true);
    await shoot(browser, iconSVG(key, { w: 196 }), 196, 196, 'assets/favicon.png');
    console.log(`shipped: ${key}`);
  } else if (cmd === 'verify') {
    // Reads the PNGs that were actually written, not the SVG they came from. Every slot is shown
    // wearing the transform the system applies to it — mask, 72dp crop, monochrome tint, splash
    // ground — because that is the only place these can be wrong.
    const tint = (bg, ink, label) =>
      `<div class="c"><div class="tile" style="background:${bg};clip-path:path('${squircle(150)}')">
         <div class="mono" style="background:${ink}"></div></div><div class="lb">${label}</div></div>`;
    /**
     * The 108->72dp crop, applied to whichever layers are asked for. `only` exists because the
     * themed monochrome icon goes through this same crop: sizing it with `mask-size:contain` instead
     * shows the silhouette about a third smaller than the device will, and much further from the
     * mask edge than it really sits.
     */
    const crop = (mask, size, only) => {
      const inner = size * (108 / 72);
      const off = (size - inner) / 2;
      const layer = (f) =>
        `<img src="../../assets/${f}.png" style="position:absolute;width:${inner}px;height:${inner}px;left:${off}px;top:${off}px">`;
      const bg = only === 'android-icon-monochrome' ? '' : layer('android-icon-background');
      return `<div class="tile" style="width:${size}px;height:${size}px;${mask};overflow:hidden;position:relative">
        ${bg}${layer(only ?? 'android-icon-foreground')}
      </div>`;
    };
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#0B0B0C;padding:36px;width:max-content;
        font:500 11px/1.4 -apple-system,Segoe UI,sans-serif;color:#6c727c}
      h3{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#4a4f57;margin:26px 0 12px;font-weight:600}
      .row{display:flex;gap:24px;align-items:flex-end}
      .c{display:flex;flex-direction:column;gap:10px;align-items:center}
      .lb{letter-spacing:.06em}
      .tile{width:150px;height:150px}
      /* Longhand. Chrome ignores the -webkit-mask shorthand's "center/cover" form and the tile
         renders empty, which reads as a blank monochrome asset rather than as a broken mock. */
      .mono{width:100%;height:100%;
        -webkit-mask-image:url(../../assets/android-icon-monochrome.png);
        -webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;
        mask-image:url(../../assets/android-icon-monochrome.png);
        mask-size:contain;mask-repeat:no-repeat;mask-position:center}
      img{display:block}
      .phone{width:200px;height:420px;background:#08090B;border-radius:26px;
        display:flex;align-items:center;justify-content:center;border:1px solid #22262E}
    </style>
    <h3>icon.png &mdash; mascara squircle e circular</h3>
    <div class="row">
      <div class="c"><img src="../../assets/icon.png" style="width:150px;height:150px;clip-path:path('${squircle(150)}')"><div class="lb">squircle</div></div>
      <div class="c"><img src="../../assets/icon.png" style="width:150px;height:150px;border-radius:50%"><div class="lb">circulo</div></div>
      <div class="c"><img src="../../assets/icon.png" style="width:96px;height:96px;clip-path:path('${squircle(96)}')"><div class="lb">48dp @2x</div></div>
      <div class="c"><img src="../../assets/icon.png" style="width:56px;height:56px;clip-path:path('${squircle(56)}')"><div class="lb">56px</div></div>
    </div>

    <h3>adaptive &mdash; fundo + frente, recortado nos 72dp que o launcher mostra</h3>
    <div class="row">
      <div class="c">${crop(`clip-path:path('${squircle(150)}')`, 150)}<div class="lb">squircle</div></div>
      <div class="c">${crop('border-radius:50%', 150)}<div class="lb">circulo</div></div>
      <div class="c">${crop('border-radius:16px', 150)}<div class="lb">rounded square</div></div>
      <div class="c">${crop(`clip-path:path('${squircle(96)}')`, 96)}<div class="lb">48dp @2x</div></div>
    </div>

    <h3>monochrome &mdash; icone tematizado, o sistema tinge o alpha</h3>
    <div class="row">
      <!-- Also forces the decode. A mask-image is not network activity Chrome waits on, so with the
           asset referenced only from CSS every tinted tile screenshots empty. -->
      <div class="c">${crop(`clip-path:path('${squircle(150)}')`, 150, 'android-icon-monochrome')}
        <div class="lb">silhueta, recorte real</div></div>
      ${tint('#3A2E1F', '#E8C79A', 'tema quente')}
      ${tint('#1E2A3A', '#A8C8E8', 'tema frio')}
      ${tint('#E8E4DC', '#3A3630', 'tema claro')}
    </div>

    <h3>splash &mdash; sobre #08090B, imageWidth 160</h3>
    <div class="row">
      <div class="phone"><img src="../../assets/splash-icon.png" style="width:160px"></div>
      <div class="c"><div class="tile" style="width:150px;height:150px;background:#08090B;border-radius:50%">
        <img src="../../assets/splash-icon.png" style="width:150px;height:150px"></div>
        <div class="lb">mascara circular (Android 12+)</div></div>
      <div class="c"><img src="../../assets/favicon.png" style="width:48px;height:48px"><div class="lb">favicon 48</div></div>
      <div class="c"><img src="../../assets/favicon.png" style="width:32px;height:32px"><div class="lb">32</div></div>
      <div class="c"><img src="../../assets/favicon.png" style="width:16px;height:16px"><div class="lb">16</div></div>
    </div>`;
    await mkdir('shots/icon', { recursive: true });
    await writeFile('shots/icon/verify.html', html);
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1180, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL('shots/icon/verify.html').href, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: 'shots/icon/6-verify.png', fullPage: true });
    await page.close();
    console.log('verify -> shots/icon/6-verify.png');
  } else {
    await mkdir('shots/icon', { recursive: true });
    const keys = Object.keys(TREATMENTS);

    // 1. The hero sheet — each candidate under the launcher mask it will actually wear.
    const cell = (k, size) =>
      `<div class="cell"><div class="mask" style="width:${size}px;height:${size}px;clip-path:path('${squircle(size)}')">${iconSVG(k, { w: size, uid: `h${k}${size}` })}</div><div class="lb">${TREATMENTS[k].label}</div></div>`;
    await shoot(
      browser,
      `<style>body{background:#0B0B0C;font:500 15px/1.4 -apple-system,Segoe UI,sans-serif;color:#8b8f96;
        display:grid;grid-template-columns:repeat(2,1fr);gap:56px 64px;padding:64px;width:max-content}
       .cell{display:flex;flex-direction:column;align-items:center;gap:18px}
       .mask{filter:drop-shadow(0 10px 24px rgba(0,0,0,.55))}
       .lb{letter-spacing:.08em;text-transform:uppercase;font-size:12px}</style>
       ${keys.map((k) => cell(k, 340)).join('')}`,
      340 * 2 + 64 * 3,
      2 * (340 + 18 + 18) + 56 + 128,
      'shots/icon/1-hero.png',
    );

    // 2. The sheet that decides it. Launcher scale, real mask, real neighbours.
    const NB = ['#FF2D2D', '#0C3B2E', '#FF3D9A', '#E8471E', '#1B4BFF', '#7B2FF7', '#FFFFFF', '#101012'];
    const nb = (c, size) =>
      `<div class="mask" style="width:${size}px;height:${size}px;clip-path:path('${squircle(size)}');background:${c}"></div>`;
    const row = (size, label) =>
      `<div class="rl">${label}</div><div class="row">
        ${NB.slice(0, 3).map((c) => nb(c, size)).join('')}
        ${keys.map((k) => `<div class="mask" style="width:${size}px;height:${size}px;clip-path:path('${squircle(size)}')">${iconSVG(k, { w: size, uid: `r${k}${size}` })}</div>`).join('')}
        ${NB.slice(3, 6).map((c) => nb(c, size)).join('')}
      </div>`;
    const circleRow = (size) =>
      `<div class="rl">mascara circular &middot; ${size}px</div><div class="row">
        ${keys.map((k) => `<div class="mask" style="width:${size}px;height:${size}px;border-radius:50%">${iconSVG(k, { w: size, uid: `c${k}${size}` })}</div>`).join('')}
      </div>`;
    await shoot(
      browser,
      `<style>body{background:#101215;background-image:radial-gradient(120% 80% at 20% 0%,#1d2330 0%,#0a0c10 60%);
         font:500 12px/1.4 -apple-system,Segoe UI,sans-serif;color:#6c727c;padding:40px;width:max-content}
       .row{display:flex;gap:18px;align-items:center;margin:10px 0 30px}
       .rl{letter-spacing:.1em;text-transform:uppercase}
       .mask{overflow:hidden;filter:drop-shadow(0 3px 8px rgba(0,0,0,.6))}</style>
       ${row(112, 'squircle &middot; 112px (56dp @2x)')}
       ${row(96, 'squircle &middot; 96px (48dp @2x)')}
       ${row(56, 'squircle &middot; 56px — verdade em miniatura')}
       ${circleRow(112)}`,
      1380,
      800,
      'shots/icon/2-launcher.png',
    );

    // 3. Adaptive-layer proof, cropped the way a launcher actually crops.
    // Both layers are 108dp; only the centre 72dp is ever shown, and the mask is applied to that.
    // A mock that masks the whole canvas shows a mark ~30% smaller than the device will.
    const CROP = 108 / 72;
    const TILE = 240;
    const INNER = TILE * CROP;
    const OFF = (TILE - INNER) / 2;
    const layers = keys
      .map(
        (k) => `<div class="col">
          <div class="lb">${TREATMENTS[k].label}</div>
          <div class="tile" style="clip-path:path('${squircle(TILE)}')">
            <div class="inner" style="width:${INNER}px;height:${INNER}px;left:${OFF}px;top:${OFF}px">
              <div class="m">${groundSVG(k, { w: INNER, uid: `lb${k}` })}</div>
              <div class="m">${markSVG(k, { w: INNER, scale: FG, uid: `lf${k}` })}</div>
              <svg class="m" width="${INNER}" height="${INNER}" viewBox="0 0 1024 1024">
                <circle cx="512" cy="512" r="${SAFE_R}" fill="none" stroke="#3FBF74" stroke-width="5" stroke-dasharray="16 14"/>
              </svg>
            </div>
          </div>
        </div>`,
      )
      .join('');
    await shoot(
      browser,
      `<style>body{background:#0B0B0C;display:flex;gap:36px;padding:40px;width:max-content;
         font:500 12px/1.4 -apple-system,Segoe UI,sans-serif;color:#6c727c}
       .col{display:flex;flex-direction:column;gap:14px;align-items:center}
       .lb{letter-spacing:.1em;text-transform:uppercase}
       .tile{position:relative;width:${TILE}px;height:${TILE}px;overflow:hidden}
       .inner{position:absolute}
       .m{position:absolute;inset:0}</style>${layers}`,
      4 * TILE + 3 * 36 + 80,
      360,
      'shots/icon/3-adaptive.png',
    );

    console.log('sheets -> shots/icon/');
  }

  await browser.close();
}
