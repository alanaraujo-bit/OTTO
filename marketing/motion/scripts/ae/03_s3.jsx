// S3 (240-360): push into the month plot. The real curve draws itself: past up to today, then the
// dashed projection to the end of the month (home.png revealed over a clean plate of the same screen).
var MAIN = getComp("OTTO_30s_9x16"), SCREEN = getComp("SCREEN_ui");
var SW = 1236, SH = 2745;
var rig = layerByName(MAIN, "PHONE RIG"), phone = layerByName(MAIN, "PHONE");
clearKeysFrom(xf(rig).property("ADBE Position"), 200); clearKeysFrom(xf(rig).property("ADBE Scale"), 200);
clearKeysFrom(xf(phone).property("ADBE Orientation"), 200);

rigKey(232, rigFrame([618, 1372.5], [540, 1150], 0.615), "inout");      // S2 drift
rigKey(276, rigFrame([618, 900], [575, 1230], 0.92), "out");            // push into the plot
rigKey(356, rigFrame([618, 900], [570, 1215], 0.97), "inout");          // slow lean-in
phoneOrient([[236, [3, 356, 0]], [276, [2, 2, 0]], [356, [1, 4, 0]]], "out");

clearTag(SCREEN, "s3");
var plate = addFootage(SCREEN, "home_plate.png", 240, 366); tagLayer(plate, "s3", "home plate");
xf(plate).property("ADBE Position").setValue([SW / 2, SH / 2]);
var draw = addFootage(SCREEN, "home.png", 240, 366); tagLayer(draw, "s3", "home curve reveal");
xf(draw).property("ADBE Position").setValue([SW / 2, SH / 2]);
// Mask only the plot band; everything else of the screen stays as captured.
var m = draw.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); m.name = "reveal";
function band(x) { var s = new Shape(); s.vertices = [[40, 620], [x, 620], [x, 1150], [40, 1150]]; s.closed = true; return s; }
var mp = m.property("ADBE Mask Shape");
mp.setValueAtTime(F(250), band(60)); mp.setValueAtTime(F(298), band(840)); mp.setValueAtTime(F(306), band(840)); mp.setValueAtTime(F(336), band(1200));
for (var i = 1; i <= mp.numKeys; i++) mp.setTemporalEaseAtKey(i, [new KeyframeEase(0, i % 2 ? 6 : 94)], [new KeyframeEase(0, i % 2 ? 6 : 94)]);
m.property("ADBE Mask Feather").setValue([46, 0]);
// "hoje": a ring breathes out of today's point when the past is fully drawn.
var r = shapeLayer(SCREEN, "today ring"); var g = group(r, "ring"); ellipse(g, [60, 60]); stroke(g, COL.ink, 4);
xf(r).property("ADBE Position").setValue([836, 882]);
kf(xf(r).property("ADBE Scale"), [[298, [60, 60]], [324, [260, 260]]], "out");
kf(xf(r).property("ADBE Opacity"), [[298, 0], [300, 70], [324, 0]], "out");
span(r, 298, 326); tagLayer(r, "s3");

clearTag(MAIN, "s3");
headline("s3", "PROJEÇÃO", "Veja hoje como o seu\rmês vai fechar.", 244, 360, { y: 214, size: 76, leading: 86 });
save(); viewAt(MAIN, 300);
return "s3 ok";
