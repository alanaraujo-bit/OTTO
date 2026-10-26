// S1 (0-120): the numeral is the hero. A mechanical odometer settles on R$ 8.601,62 — the real
// "saldo hoje" of the home screen that appears next.
var MAIN = getComp("OTTO_30s_9x16"), NUM = getComp("NUMERAL_odometer");
// Tone the base world down: the ground must read as near-black.
function setOp(name, v) { for (var i = 1; i <= MAIN.numLayers; i++) if (MAIN.layer(i).name === name) xf(MAIN.layer(i)).property("ADBE Opacity").setValue(v); }
setOp("RIM field warm", 5); setOp("RIM field cool", 3.5); setOp("RIM edge bleed", 6);

while (NUM.numLayers) NUM.layer(1).remove();
NUM.motionBlurSamplesPerFrame = 64; NUM.motionBlurAdaptiveSampleLimit = 256; NUM.shutterAngle = 180; NUM.shutterPhase = -90;
var BIG = 240, SMALL = 72, L = 340, BW = 238; // baseline inside the 300px window
function measureAdv(font, size, tr) {
  var a = textLayer(NUM, "0", { font: font, size: size, tracking: tr, just: "left" });
  var b = textLayer(NUM, "00000", { font: font, size: size, tracking: tr, just: "left" });
  var w = (b.sourceRectAtTime(0, false).width - a.sourceRectAtTime(0, false).width) / 4;
  a.remove(); b.remove(); return w;
}
var advB = measureAdv("GeistMono-Medium", BIG, -40), advS = measureAdv("GeistMono-Regular", SMALL, 0);
var parts = [ // [text, big?, rolling?]
  ["R", 0, 0], ["$", 0, 0], [" ", 0, 0], ["8", 1, 1], [".", 1, 0], ["6", 1, 1], ["0", 1, 1], ["1", 1, 1], [",", 0, 0], ["6", 0, 1], ["2", 0, 1]
];
var total = 0; for (var i = 0; i < parts.length; i++) total += parts[i][1] ? advB : advS * (parts[i][0] === " " ? 0.5 : 1);
var x = (1080 - total) / 2, col = 0, strip = "";
for (var r = 0; r < 30; r++) strip += (r % 10) + (r < 29 ? "\r" : "");
for (var j = 0; j < parts.length; j++) {
  var p = parts[j], big = p[1], adv = big ? advB : advS * (p[0] === " " ? 0.5 : 1);
  if (p[0] !== " ") {
    var o = { font: big ? "GeistMono-Medium" : "GeistMono-Regular", size: big ? BIG : SMALL, tracking: big ? -40 : 0, just: "left",
      color: big ? COL.ink : COL.inkFaint, leading: L };
    var l = textLayer(NUM, p[2] ? strip : p[0], o);
    l.name = (p[2] ? "roll " : "static ") + p[0]; l.motionBlur = true;
    var pos = xf(l).property("ADBE Position");
    if (p[2]) {
      var d = parseInt(p[0], 10), rows = 10 + d, st = 6 + col * 3, en = st + 64 + col * 2;
      kf(pos, [[0, [x, BW]], [st, [x, BW]], [en, [x, BW - rows * L]]], "roll");
      col++;
    } else pos.setValue([x, BW]);
  }
  x += adv;
}
// Fade the whole numeral in as it starts to turn.
var main = null;
clearTag(MAIN, "s1");
var nl = MAIN.layers.add(NUM); tagLayer(nl, "s1", "S1 numeral"); nl.threeDLayer = true; nl.motionBlur = true; span(nl, 0, 124);
xf(nl).property("ADBE Position").setValue([540, 880, 0]);
// The odometer window: rows fade at its lips instead of being cut.
var wm = nl.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); wm.name = "window";
var ws = new Shape(); ws.vertices = [[-200, 42], [1280, 42], [1280, 260], [-200, 260]]; ws.closed = true;
wm.property("ADBE Mask Shape").setValue(ws); wm.property("ADBE Mask Feather").setValue([0, 76]);
kf(xf(nl).property("ADBE Opacity"), [[4, 0], [22, 100]], "out");
kf(xf(nl).property("ADBE Scale"), [[4, [104, 104, 104]], [100, [100, 100, 100]]], "out");

// The ledger rule draws out from the centre; the real label sits under it.
var rule = shapeLayer(MAIN, "S1 rule"); var g = group(rule, "rule");
pathShape(g, [[-420, 0], [420, 0]], false); stroke(g, COL.hairlineStrong, 2);
var tr = trim(g); kf(tr.property("ADBE Vector Trim Start"), [[14, 50], [60, 0]], "out"); kf(tr.property("ADBE Vector Trim End"), [[14, 50], [60, 100]], "out");
xf(rule).property("ADBE Position").setValue([540, 1010]);
tagLayer(rule, "s1"); span(rule, 0, 122);
var lab = textLayer(MAIN, "saldo hoje", { font: "Geist-Regular", size: 38, color: COL.inkMuted, tracking: 0, pos: [540, 1082] });
reveal(lab, 40, { dur: 0.9, stagger: 0.03, dy: 24 }); tagLayer(lab, "s1", "S1 label"); span(lab, 0, 122);
var eyebrow = textLayer(MAIN, "quinta-feira, 22 de outubro", { font: "Geist-Regular", size: 32, color: COL.inkFaint, tracking: 0, pos: [540, 690] });
reveal(eyebrow, 26, { dur: 0.8, stagger: 0.012, dy: 0, blur: 6 }); tagLayer(eyebrow, "s1", "S1 date"); span(eyebrow, 0, 122);
// Order under the finishing layers.
var fin = null; for (var k = 1; k <= MAIN.numLayers; k++) if (MAIN.layer(k).name === "FINISH grain") fin = MAIN.layer(k);
var mine = [nl, rule, lab, eyebrow]; for (var m = 0; m < mine.length; m++) mine[m].moveAfter(fin);
for (var k2 = 1; k2 <= MAIN.numLayers; k2++) if (MAIN.layer(k2).name === "FINISH vignette") MAIN.layer(k2).moveToBeginning();
for (var k3 = 1; k3 <= MAIN.numLayers; k3++) if (MAIN.layer(k3).name === "FINISH grain") MAIN.layer(k3).moveToBeginning();
save(); viewAt(MAIN, 70);
return { advB: advB, advS: advS, total: total };
