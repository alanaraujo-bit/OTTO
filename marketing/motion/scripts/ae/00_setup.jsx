// Project, folders, footage, comps and the base world (ground, rim light, camera, grain, audio).
var f = new File(AEP);
if (!(app.project.file && app.project.file.fsName === f.fsName)) {
  if (f.exists) app.open(f); else { app.newProject(); app.project.bitsPerChannel = 16; }
}
var fComps = folder("01_COMPS"), fPre = folder("02_PRECOMPS"), fUI = folder("03_UI_REAL"), fAud = folder("04_AUDIO");

function importDir(dir, filter, into) {
  var files = new Folder(dir).getFiles(filter), n = 0;
  for (var i = 0; i < files.length; i++) {
    if (findItem(files[i].name, "footage")) continue;
    var it = app.project.importFile(new ImportOptions(files[i])); it.parentFolder = into; n++;
  }
  return n;
}
var nUI = importDir(ROOT + "/assets/ui", "*.png", fUI);
var nAu = importDir(ROOT + "/assets/audio", function (x) { return /^(music|sfx)\.wav$/i.test(x.name); }, fAud);

var MAIN = makeComp("OTTO_30s_9x16", W, H, fComps);
var SCREEN = makeComp("SCREEN_ui", 1236, 2745, fPre);
var PHONE = makeComp("PHONE_device", 1284, 2793, fPre);
var NUM = makeComp("NUMERAL_odometer", 1080, 300, fPre);
var WM = makeComp("WORDMARK_otto", 1080, 420, fPre);
MAIN.motionBlur = true; MAIN.shutterAngle = 200; MAIN.shutterPhase = -100;
NUM.motionBlur = true; NUM.shutterAngle = 240; NUM.shutterPhase = -120;
SCREEN.motionBlur = true; PHONE.motionBlur = true;
MAIN.renderer = "ADBE Advanced 3d";

clearTag(MAIN, "base");
// Ground.
var bg = MAIN.layers.addSolid(C(COL.bg), "BG ground", W, H, 1, DUR / FPS);
tagLayer(bg, "base");

// Rim light: the screen-edge luminance of the app's own world, plus two soft fields at depth.
function glow(name, size, pos, z, hex, op, blur) {
  var l = shapeLayer(MAIN, name); var g = group(l, "field"); ellipse(g, size); fill(g, hex);
  l.threeDLayer = true; xf(l).property("ADBE Position").setValue([pos[0], pos[1], z]);
  xf(l).property("ADBE Opacity").setValue(op);
  fx(l, "ADBE Gaussian Blur 2").property("ADBE Gaussian Blur 2-0001").setValue(blur);
  return tagLayer(l, "base", name);
}
var g1 = glow("RIM field warm", [1500, 1300], [260, 520], 1400, COL.rim, 9, 420);
var g2 = glow("RIM field cool", [1400, 1500], [900, 1650], 1600, "C9D3E0", 6, 460);
kf(xf(g1).property("ADBE Position"), [[0, [200, 560, 1400]], [900, [380, 460, 1400]]], "inout");
kf(xf(g2).property("ADBE Position"), [[0, [960, 1700, 1600]], [900, [780, 1560, 1600]]], "inout");
var edge = shapeLayer(MAIN, "RIM edge bleed"); var ge = group(edge, "edge"); rect(ge, [W + 40, H + 40], 60); stroke(ge, COL.rim, 90);
fx(edge, "ADBE Gaussian Blur 2").property("ADBE Gaussian Blur 2-0001").setValue(140);
xf(edge).property("ADBE Opacity").setValue(10);
tagLayer(edge, "base");

// Camera: slow drift so depth reads as depth.
var cam = MAIN.layers.addCamera("CAM", [W / 2, H / 2]);
cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(2400);
kf(xf(cam).property("ADBE Anchor Point"), [[0, [W / 2, H / 2, 0]], [900, [W / 2 + 10, H / 2 - 10, 0]]], "linear");
kf(xf(cam).property("ADBE Position"), [[0, [W / 2 - 30, H / 2 + 20, -2400]], [900, [W / 2 + 30, H / 2 - 20, -2400]]], "inout");
tagLayer(cam, "base");

// Finishing: vignette + fine grain (top of stack).
var vig = MAIN.layers.addSolid([0, 0, 0], "FINISH vignette", W, H, 1, DUR / FPS);
var m = vig.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"); m.inverted = true;
var s = new Shape(); var rx = W * 0.62, ry = H * 0.56, k = 0.5523, cx = W / 2, cy = H / 2;
s.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
s.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
s.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]]; s.closed = true;
m.property("ADBE Mask Shape").setValue(s); m.property("ADBE Mask Feather").setValue([520, 520]);
xf(vig).property("ADBE Opacity").setValue(55);
tagLayer(vig, "base");
var grain = MAIN.layers.addSolid([0.5, 0.5, 0.5], "FINISH grain", W, H, 1, DUR / FPS); grain.adjustmentLayer = true;
var nz = fx(grain, "ADBE Noise"); nz.property(1).setValue(2.2); nz.property(2).setValue(false);
tagLayer(grain, "base");

// Audio.
var mu = MAIN.layers.add(footage("music.wav")); tagLayer(mu, "base", "AUDIO music");
var sx = MAIN.layers.add(footage("sfx.wav")); tagLayer(sx, "base", "AUDIO sfx");
// Order: bg at bottom.
bg.moveToEnd();

save(); viewAt(MAIN, 0);
return { imported: nUI + nAu, items: app.project.numItems, file: app.project.file.fsName };
