// S7 (720-900): the device recedes into the dark and the OTTO mark draws itself from the app's own
// geometry (viewBox 388x100, stroke 9): rings, stems, then the bar from x1 to x2 — and it wakes up:
// pupils, gaze, a blink and a double blink, as the native Wordmark does.
var MAIN = getComp("OTTO_30s_9x16"), WM = getComp("WORDMARK_otto");
var rig = layerByName(MAIN, "PHONE RIG"), phone = layerByName(MAIN, "PHONE");
clearKeysFrom(xf(rig).property("ADBE Position"), 717); clearKeysFrom(xf(rig).property("ADBE Scale"), 717);
clearKeysFrom(xf(phone).property("ADBE Orientation"), 717);
var op = xf(phone).property("ADBE Opacity"); clearKeysFrom(op, 700);
rigKey(764, rigFrame([618, 1372.5], [540, 940], 0.3), "in");
phoneOrient([[764, [10, 24, 0]]], "in");
kf(op, [[722, 100], [752, 0]], "inout");
phone.outPoint = F(754);

// ---- WORDMARK_otto ----
while (WM.numLayers) WM.layer(1).remove();
var K = 2.2, OX = (1080 - 388 * K) / 2, OY = (420 - 100 * K) / 2, SWK = 9 * K;
function P(x, y) { return [OX + x * K, OY + y * K]; }
function ring(name, cx, at) {
  var l = shapeLayer(WM, name); var g = group(l, "o"); ellipse(g, [91 * K, 91 * K]); stroke(g, COL.ink, SWK);
  var t = trim(g); kf(t.property("ADBE Vector Trim End"), [[at, 0], [at + 26, 100]], "out");
  xf(l).property("ADBE Position").setValue(P(cx, 50)); return l;
}
function line(name, a, b, at, len) {
  var l = shapeLayer(WM, name); var g = group(l, "l"); pathShape(g, [a, b], false); stroke(g, COL.ink, SWK, 1);
  var t = trim(g); kf(t.property("ADBE Vector Trim End"), [[at, 0], [at + len, 100]], "out");
  xf(l).property("ADBE Position").setValue([0, 0]); xf(l).property("ADBE Anchor Point").setValue([0, 0]); return l;
}
ring("O left", 50, 732); ring("O right", 338, 736);
line("T stem 1", P(158, 0), P(158, 100), 740, 18); line("T stem 2", P(230, 0), P(230, 100), 743, 18);
line("T bar", P(122, 4.5), P(266, 4.5), 750, 17); // 560ms on the app's bezier(0.16,1,0.3,1)
function pupil(name, cx) {
  var l = shapeLayer(WM, name); var g = group(l, "p"); ellipse(g, [26 * K, 26 * K]); fill(g, COL.ink);
  var base = P(cx, 50), dx = 9 * K * 0.85, dy = 5 * K;
  kf(xf(l).property("ADBE Position"), [[792, base], [800, [base[0] - dx, base[1] + dy * 0.4]], [828, [base[0] - dx, base[1] + dy * 0.4]],
    [838, [base[0] + dx, base[1] + dy * 0.2]], [866, [base[0] + dx, base[1] + dy * 0.2]], [876, base]], "out");
  var sc = xf(l).property("ADBE Scale");
  kf(sc, [[774, [0, 0]], [782, [112, 112]], [788, [100, 100]],
    [820, [100, 100]], [822, [104, 0]], [826, [100, 100]],
    [856, [100, 100]], [858, [104, 0]], [861, [100, 100]], [863, [104, 0]], [867, [100, 100]]], "inout");
  return l;
}
pupil("pupil left", 50); pupil("pupil right", 338);

// ---- MAIN ----
clearTag(MAIN, "s7");
var fin = finishLayer();
var wm = MAIN.layers.add(WM); tagLayer(wm, "s7", "S7 wordmark"); span(wm, 720, 900);
xf(wm).property("ADBE Position").setValue([540, 860]);
kf(xf(wm).property("ADBE Scale"), [[730, [96, 96]], [900, [101, 101]]], "out");
wm.motionBlur = true; wm.moveAfter(fin);
var tl = textLayer(MAIN, "Comece pelo próximo gasto.", { font: "Geist-Medium", size: 60, color: COL.ink, tracking: -25, pos: [540, 1150] });
reveal(tl, 790, { dur: 0.9, stagger: 0.025 }); tagLayer(tl, "s7", "S7 tagline"); span(tl, 720, 900); tl.moveAfter(fin);
var sb = textLayer(MAIN, "Para Android · sem conectar no seu banco.", { font: "Geist-Regular", size: 32, color: COL.inkFaint, tracking: 0, pos: [540, 1222] });
reveal(sb, 808, { dur: 0.8, stagger: 0.04, dy: 14, by: "words" }); tagLayer(sb, "s7", "S7 sub"); span(sb, 720, 900); sb.moveAfter(fin);
var rl = shapeLayer(MAIN, "S7 rule"); var g = group(rl, "r"); pathShape(g, [[-60, 0], [60, 0]], false); stroke(g, COL.hairlineStrong, 2);
var tr = trim(g); kf(tr.property("ADBE Vector Trim Start"), [[784, 50], [806, 0]], "out"); kf(tr.property("ADBE Vector Trim End"), [[784, 50], [806, 100]], "out");
xf(rl).property("ADBE Position").setValue([540, 1052]); tagLayer(rl, "s7"); span(rl, 720, 900); rl.moveAfter(fin);
// Out to black.
var blk = MAIN.layers.addSolid([0, 0, 0], "S7 fade out", W, H, 1, DUR / FPS); tagLayer(blk, "s7");
kf(xf(blk).property("ADBE Opacity"), [[882, 0], [900, 100]], "in"); blk.moveBefore(fin);
save(); viewAt(MAIN, 840);
return "s7 ok";
