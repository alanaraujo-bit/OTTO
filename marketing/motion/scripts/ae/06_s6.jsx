// S6 (600-720): Otto, the assistant. A real suggested question typed into the real input
// (one capture per character, 2 frames each). Nothing is answered on screen that the app did not say.
var MAIN = getComp("OTTO_30s_9x16"), SCREEN = getComp("SCREEN_ui");
var SW = 1236, SH = 2745;
var rig = layerByName(MAIN, "PHONE RIG"), phone = layerByName(MAIN, "PHONE");
clearKeysFrom(xf(rig).property("ADBE Position"), 597); clearKeysFrom(xf(rig).property("ADBE Scale"), 597);
clearKeysFrom(xf(phone).property("ADBE Orientation"), 597);
rigKey(622, rigFrame([618, 1372.5], [540, 1185], 0.55), "out");
rigKey(716, rigFrame([618, 1372.5], [540, 1160], 0.565), "inout");
phoneOrient([[622, [3, 354, 0]], [716, [2, 358, 0]]], "out");

clearTag(SCREEN, "s6");
var o0 = addFootage(SCREEN, "otto_0.png", 600, 619); tagLayer(o0, "s6", "otto_0");
kf(xf(o0).property("ADBE Position"), [[600, [SW / 2 + 140, SH / 2]], [612, [SW / 2, SH / 2]]], "out");
kf(xf(o0).property("ADBE Opacity"), [[600, 0], [606, 100]], "out");
o0.motionBlur = true;
for (var c = 1; c <= 29; c++) {
  var a = 618 + (c - 1) * 2, b = c === 29 ? 726 : a + 2;
  var name = "otto_type_" + (c < 10 ? "0" : "") + c + ".png";
  var l = addFootage(SCREEN, name, a, b); tagLayer(l, "s6", name);
  xf(l).property("ADBE Position").setValue([SW / 2, SH / 2]);
}
clearTag(MAIN, "s6");
headline("s6", "ASSISTENTE", "Pergunte ao Otto.", 604, 720, { y: 228, size: 80 });
var sub = textLayer(MAIN, "Ele mostra antes de mudar qualquer coisa.", { font: "Geist-Regular", size: 34, color: COL.inkMuted, tracking: 0, pos: [540, 296] });
reveal(sub, 640, { dur: 0.8, stagger: 0.012, dy: 16, by: "words" }); tagLayer(sub, "s6", "S6 sub"); span(sub, 600, 720); exitText(sub, 704, 12);
sub.moveAfter(finishLayer());
save(); viewAt(MAIN, 690);
return "s6 ok";
