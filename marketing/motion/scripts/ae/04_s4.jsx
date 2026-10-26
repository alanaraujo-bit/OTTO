// S4 (360-480): the real capture flow. Lançar slides up; R$ 45,90 is typed key by key on the
// beat (keys at 375/390/405/420 = every beat at 120 BPM).
var MAIN = getComp("OTTO_30s_9x16"), SCREEN = getComp("SCREEN_ui");
var SW = 1236, SH = 2745;
var rig = layerByName(MAIN, "PHONE RIG"), phone = layerByName(MAIN, "PHONE");
clearKeysFrom(xf(rig).property("ADBE Position"), 357); clearKeysFrom(xf(rig).property("ADBE Scale"), 357);
clearKeysFrom(xf(phone).property("ADBE Orientation"), 357);
rigKey(388, rigFrame([618, 1372.5], [560, 1230], 0.6), "out");
rigKey(476, rigFrame([618, 1200], [558, 1140], 0.66), "inout");
phoneOrient([[388, [4, 8, 0]], [476, [2, 4, 0]]], "out");

clearTag(SCREEN, "s4");
var seq = [["lancar_0.png", 352, 377], ["lancar_1.png", 377, 392], ["lancar_2.png", 392, 407], ["lancar_3.png", 407, 422], ["lancar_4.png", 422, 484]];
var first = null;
for (var i = 0; i < seq.length; i++) {
  var l = addFootage(SCREEN, seq[i][0], seq[i][1], seq[i][2]); tagLayer(l, "s4", seq[i][0]);
  xf(l).property("ADBE Position").setValue([SW / 2, SH / 2]);
  if (i === 0) first = l;
}
// Route change: the screen rises over home (container motion, expo out).
kf(xf(first).property("ADBE Position"), [[352, [SW / 2, SH / 2 + SH]], [370, [SW / 2, SH / 2]]], "out");
first.motionBlur = true;
var keys = [[254, 2085, 375], [618, 2085, 390], [982, 2253, 405], [618, 2421, 420]];
for (var k = 0; k < keys.length; k++) ripple(SCREEN, "s4", [keys[k][0], keys[k][1]], keys[k][2] - 2);

clearTag(MAIN, "s4");
headline("s4", "LANÇAR", "Mais rápido que\rlembrar de anotar.", 364, 480, { y: 214, size: 76, leading: 86 });
save(); viewAt(MAIN, 430);
return "s4 ok";
