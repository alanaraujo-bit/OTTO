// S2 (120-240): match cut from the typographic numeral to the real home screen, then the device
// settles in 2.5D. Builds the PHONE device precomp and the phone RIG every later scene animates.
var MAIN = getComp("OTTO_30s_9x16"), SCREEN = getComp("SCREEN_ui"), PHONE = getComp("PHONE_device");
var PW = 1284, PH = 2793, SW = 1236, SH = 2745;

// ---- PHONE_device: body, screen in a rounded matte, rim highlight, faint glass sheen ----
while (PHONE.numLayers) PHONE.layer(1).remove();
var body = shapeLayer(PHONE, "body"); var gb = group(body, "body"); rect(gb, [PW, PH], 150); fill(gb, "060708"); stroke(gb, "2A2F38", 3);
xf(body).property("ADBE Position").setValue([PW / 2, PH / 2]);
var scr = PHONE.layers.add(SCREEN); scr.name = "screen"; xf(scr).property("ADBE Position").setValue([PW / 2, PH / 2]);
var matte = shapeLayer(PHONE, "screen matte"); var gm = group(matte, "m"); rect(gm, [SW, SH], 118); fill(gm, "FFFFFF");
xf(matte).property("ADBE Position").setValue([PW / 2, PH / 2]);
matte.moveBefore(scr); scr.setTrackMatte(matte, TrackMatteType.ALPHA);
var sheen = PHONE.layers.addSolid([1, 1, 1], "glass sheen", SW, SH, 1, DUR / FPS);
xf(sheen).property("ADBE Position").setValue([PW / 2, PH / 2]);
var rp = fx(sheen, "ADBE Ramp");
kf(rp.property("ADBE Ramp-0001"), [[0, [-300, 0]], [900, [500, 0]]], "linear");      // start point
kf(rp.property("ADBE Ramp-0003"), [[0, [900, 1600]], [900, [1700, 1600]]], "linear"); // end point
rp.property("ADBE Ramp-0002").setValue([1, 1, 1, 1]); rp.property("ADBE Ramp-0004").setValue([0, 0, 0, 1]);
sheen.blendingMode = BlendingMode.SCREEN; xf(sheen).property("ADBE Opacity").setValue(7);
var matte2 = matte.duplicate(); matte2.name = "sheen matte"; matte2.moveBefore(sheen); sheen.setTrackMatte(matte2, TrackMatteType.ALPHA);
var rim = shapeLayer(PHONE, "rim highlight"); var gr = group(rim, "r"); rect(gr, [PW - 4, PH - 4], 148); stroke(gr, COL.ink, 2.5);
xf(rim).property("ADBE Position").setValue([PW / 2, PH / 2]); xf(rim).property("ADBE Opacity").setValue(20);
rim.moveToBeginning();

// ---- SCREEN_ui: the real home ----
clearTag(SCREEN, "s2");
var home = addFootage(SCREEN, "home.png", 96, 240); tagLayer(home, "s2", "home");
xf(home).property("ADBE Position").setValue([SW / 2, SH / 2]);

// ---- MAIN: rig + phone ----
clearTag(MAIN, "s2");
var fin = null; for (var k = 1; k <= MAIN.numLayers; k++) if (MAIN.layer(k).name === "FINISH grain") fin = MAIN.layer(k);
var rig = MAIN.layers.addNull(DUR / FPS); rig.name = "PHONE RIG"; rig.threeDLayer = true; tagLayer(rig, "s2");
xf(rig).property("ADBE Anchor Point").setValue([0, 0, 0]);
var phone = MAIN.layers.add(PHONE); tagLayer(phone, "s2", "PHONE"); phone.threeDLayer = true; phone.motionBlur = true;
span(phone, 96, 900);
phone.setParentWithJump(rig);
// The numeral "8.601" sits at (346, 474) in device coordinates; 182% makes it match the 240px numeral.
var MATCH = 1.82, ANCH = [346, 474], CEN = [PW / 2, PH / 2];
xf(phone).property("ADBE Anchor Point").setValue([ANCH[0], ANCH[1], 0]);
xf(phone).property("ADBE Position").setValue([0, 0, 0]);
xf(phone).property("ADBE Scale").setValue([MATCH * 100, MATCH * 100, MATCH * 100]);
// rigFor: where the rig must be so device point p lands on main point q at total phone scale s.
function rigFor(p, q, s) { return { pos: [q[0], q[1], 0], scale: s / MATCH * 100, anchorShift: [(p[0] - ANCH[0]) * s, (p[1] - ANCH[1]) * s] }; }
var finalScale = 0.6, finalCenter = [540, 1150];
var fpos = [finalCenter[0] + (ANCH[0] - CEN[0]) * finalScale, finalCenter[1] + (ANCH[1] - CEN[1]) * finalScale, 0];
var rpos = xf(rig).property("ADBE Position"), rsc = xf(rig).property("ADBE Scale");
var s2 = finalScale / MATCH * 100;
kf(rpos, [[100, [529.2, 882, 0]], [108, [529.2, 882, 0]], [158, fpos]], "out");
kf(rsc, [[100, [100, 100, 100]], [108, [100, 100, 100]], [158, [s2, s2, s2]]], "out");
// 2.5D: the device turns into the light as it settles, then drifts.
kf(xf(phone).property("ADBE Orientation"), [[108, [0, 0, 0]], [158, [6, 352, 0]], [240, [3, 356, 0]]], "out");
kf(xf(phone).property("ADBE Opacity"), [[97, 0], [107, 100]], "out");

// The numeral rides the same rig and hands over to the real one.
var num = null; for (var n = 1; n <= MAIN.numLayers; n++) if (MAIN.layer(n).name === "S1 numeral") num = MAIN.layer(n);
num.setParentWithJump(rig);
xf(num).property("ADBE Position").setValue([540 - 529.2, 880 - 882, 0]);
var nop = xf(num).property("ADBE Opacity");
kf(nop, [[103, 100], [112, 0]], "inout");
// S1 dressing leaves before the cut.
var names = ["S1 rule", "S1 label", "S1 date"];
for (var a = 1; a <= MAIN.numLayers; a++) for (var b = 0; b < names.length; b++) if (MAIN.layer(a).name === names[b]) exitText(MAIN.layer(a), 88, 10);

// Headline.
var eb = textLayer(MAIN, "INÍCIO", { font: "Geist-SemiBold", size: 24, color: COL.inkFaint, tracking: 220, pos: [540, 136] });
reveal(eb, 132, { dur: 0.7, stagger: 0.03, dy: 0, blur: 4 }); tagLayer(eb, "s2", "S2 eyebrow"); span(eb, 120, 240); exitText(eb, 226, 10);
var hl = textLayer(MAIN, "Abriu, já sabe.", { font: "Geist-Medium", size: 84, color: COL.ink, tracking: -30, pos: [540, 228] });
reveal(hl, 136, { dur: 0.9, stagger: 0.035 }); tagLayer(hl, "s2", "S2 headline"); span(hl, 120, 240); exitText(hl, 224, 12);

// Stack order: rig/phone just under the finishing layers, text above the phone.
phone.moveAfter(fin); rig.moveAfter(fin); eb.moveAfter(fin); hl.moveAfter(fin);
save(); viewAt(MAIN, 180);
return { finalRigPos: fpos, rigScale: s2 };
