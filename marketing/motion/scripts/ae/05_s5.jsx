// S5 (480-600): "Tudo o que um mês tem." Four real screens on the beat (cuts at 480/510/540/570),
// each scrolling its real full-length capture while the device turns slowly through 3D.
var MAIN = getComp("OTTO_30s_9x16"), SCREEN = getComp("SCREEN_ui");
var SW = 1236, SH = 2745;
var rig = layerByName(MAIN, "PHONE RIG"), phone = layerByName(MAIN, "PHONE");
clearKeysFrom(xf(rig).property("ADBE Position"), 477); clearKeysFrom(xf(rig).property("ADBE Scale"), 477);
clearKeysFrom(xf(phone).property("ADBE Orientation"), 477);
rigKey(500, rigFrame([618, 1372.5], [540, 1250], 0.6), "out");
rigKey(596, rigFrame([618, 1372.5], [540, 1235], 0.63), "inout");
phoneOrient([[500, [4, 348, 0]], [596, [3, 10, 0]]], "inout");

clearTag(SCREEN, "s5");
// [tall capture, fixed tab bar source or null, label, scroll px]
var shots = [["razao_tall.png", "razao.png", "RAZÃO", 1500], ["analise_tall.png", "analise.png", "ANÁLISE", 1100],
             ["recorrencias_tall.png", null, "RECORRÊNCIAS E DÍVIDAS", 900], ["contas_tall.png", null, "CONTAS E CARTÕES", 700]];
var cuts = [480, 510, 540, 570, 604];
clearTag(MAIN, "s5");
var fin = finishLayer();
for (var i = 0; i < shots.length; i++) {
  var a = cuts[i], b = cuts[i + 1], s = shots[i];
  var l = addFootage(SCREEN, s[0], a, b + 4); tagLayer(l, "s5", s[0]);
  var hT = footage(s[0]).height;
  // Top of the tall frame aligned with the top of the screen, then a real scroll.
  var y0 = hT / 2, y1 = hT / 2 - s[3];
  kf(xf(l).property("ADBE Position"), [[a, [SW / 2 + (i ? 90 : 0), y0]], [a + 8, [SW / 2, y0 - s[3] * 0.08]], [b + 4, [SW / 2, y1]]], "out");
  if (i) kf(xf(l).property("ADBE Opacity"), [[a, 0], [a + 5, 100]], "out");
  l.motionBlur = true;
  // The tab bar stays fixed while the list scrolls: take it from the device-size capture.
  if (s[1]) {
    var bar = addFootage(SCREEN, s[1], a, b + 4); tagLayer(bar, "s5", s[1] + " tabbar");
    xf(bar).property("ADBE Position").setValue([SW / 2, SH / 2]);
    var bm = bar.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var sh = new Shape(); sh.vertices = [[0, 2440], [SW, 2440], [SW, SH], [0, SH]]; sh.closed = true;
    bm.property("ADBE Mask Shape").setValue(sh); bm.property("ADBE Mask Feather").setValue([0, 30]);
    if (i) kf(xf(bar).property("ADBE Opacity"), [[a, 0], [a + 5, 100]], "out");
  }
  // The label changes with the screen.
  var lab = textLayer(MAIN, s[2], { font: "Geist-SemiBold", size: 24, color: COL.inkFaint, tracking: 220, pos: [540, 136] });
  reveal(lab, a + (i ? 0 : 8), { dur: 0.45, stagger: 0.015, dy: 0, blur: 4 }); tagLayer(lab, "s5", "S5 label " + i);
  span(lab, a, b); if (i === shots.length - 1) exitText(lab, b - 10, 8);
  lab.moveAfter(fin);
}
var hl = textLayer(MAIN, "Tudo o que um\rmês tem.", { font: "Geist-Medium", size: 76, color: COL.ink, tracking: -30, leading: 86, pos: [540, 214] });
reveal(hl, 490, { dur: 0.9, stagger: 0.03 }); tagLayer(hl, "s5", "S5 headline"); span(hl, 480, 600); exitText(hl, 586, 12);
hl.moveAfter(fin);
save(); viewAt(MAIN, 525);
return "s5 ok";
