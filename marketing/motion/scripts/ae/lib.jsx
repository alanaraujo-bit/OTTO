// ---- OTTO motion: shared ExtendScript helpers (prepended to every scene script) ----
var ROOT = "D:/PROJETOS/OTTO/marketing/motion";
var FPS = 30, W = 1080, H = 1920, DUR = 900;
var AEP = ROOT + "/OTTO_comercial_9x16.aep";
var COL = {
  bg: "08090B", surface: "101216", hairline: "22262E", hairlineStrong: "333945",
  ink: "F2F4F7", inkMuted: "9BA1AC", inkFaint: "737B88", positive: "3FBF74", negative: "E5484D", rim: "EDE7DD"
};
function C(hex) { return [parseInt(hex.substr(0, 2), 16) / 255, parseInt(hex.substr(2, 2), 16) / 255, parseInt(hex.substr(4, 2), 16) / 255]; }
function F(fr) { return fr / FPS; }

function findItem(name, type) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it.name !== name) continue;
    // Plain ifs: ExtendScript mis-parses `instanceof` inside chained ternaries.
    var ok = !type;
    if (type === "comp") ok = (it instanceof CompItem);
    if (type === "folder") ok = (it instanceof FolderItem);
    if (type === "footage") ok = (it instanceof FootageItem);
    if (ok) return it;
  }
  return null;
}
function getComp(name) { var c = findItem(name, "comp"); if (!c) throw new Error("comp not found: " + name); return c; }
function footage(name) { var f = findItem(name, "footage"); if (!f) throw new Error("footage not found: " + name); return f; }
function folder(name, parent) {
  var f = findItem(name, "folder"); if (!f) { f = app.project.items.addFolder(name); if (parent) f.parentFolder = parent; } return f;
}
function makeComp(name, w, h, parent) {
  var c = findItem(name, "comp");
  if (!c) { c = app.project.items.addComp(name, w, h, 1, DUR / FPS, FPS); c.bgColor = C(COL.bg); if (parent) c.parentFolder = parent; }
  return c;
}
// Remove every layer this scene created before (idempotent rebuilds).
function clearTag(comp, tag) {
  for (var i = comp.numLayers; i >= 1; i--) { var l = comp.layer(i); if (l.comment === tag) { l.locked = false; l.remove(); } }
}
function tagLayer(l, tag, name) { l.comment = tag; if (name) l.name = name; return l; }
function span(l, a, b) { l.inPoint = F(a); l.outPoint = F(b); return l; }

// Keyframes with designed easing. ease: 'out' (expo decel), 'inout', 'in', 'linear', 'hold'.
function easeArr(prop, v) {
  var t = prop.propertyValueType, n = 1;
  if (t === PropertyValueType.TwoD) n = 2; else if (t === PropertyValueType.ThreeD) n = 3;
  var a = []; for (var i = 0; i < n; i++) a.push(v); return a;
}
function kf(prop, keys, ease) {
  ease = ease || "out";
  for (var i = 0; i < keys.length; i++) prop.setValueAtTime(F(keys[i][0]), keys[i][1]);
  for (var j = 0; j < keys.length; j++) {
    var idx = prop.nearestKeyIndex(F(keys[j][0]));
    var spatial = prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
    if (spatial) { prop.setSpatialAutoBezierAtKey(idx, false); prop.setSpatialContinuousAtKey(idx, false);
      var z = prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL ? [0, 0, 0] : [0, 0]; prop.setSpatialTangentsAtKey(idx, z, z); }
    if (ease === "hold") { prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.HOLD); continue; }
    if (ease === "linear") { prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR); continue; }
    var inf = { out: [94, 6], inout: [75, 75], "in": [6, 94], soft: [60, 30], roll: [88, 45] }[ease];
    // [incoming influence, outgoing influence]
    prop.setTemporalEaseAtKey(idx, easeArr(prop, new KeyframeEase(0, inf[0])), easeArr(prop, new KeyframeEase(0, inf[1])));
  }
  return prop;
}

function textLayer(comp, str, o) {
  var l = comp.layers.addText(str);
  var p = l.property("ADBE Text Properties").property("ADBE Text Document");
  var d = p.value;
  d.resetCharStyle(); d.resetParagraphStyle();
  d.font = o.font || "Geist-Medium"; d.fontSize = o.size || 64; d.applyFill = true; d.fillColor = C(o.color || COL.ink);
  d.applyStroke = false; d.tracking = o.tracking === undefined ? -20 : o.tracking;
  if (o.leading) { d.autoLeading = false; d.leading = o.leading; }
  var jf = ParagraphJustification.CENTER_JUSTIFY;
  if (o.just === "left") jf = ParagraphJustification.LEFT_JUSTIFY;
  if (o.just === "right") jf = ParagraphJustification.RIGHT_JUSTIFY;
  d.justification = jf;
  p.setValue(d);
  if (o.pos) l.property("ADBE Transform Group").property("ADBE Position").setValue(o.pos);
  return l;
}
// Staggered reveal: chars/words rise, unblur and fade in from `start` (frames). Expo-out per unit.
function reveal(l, start, o) {
  o = o || {};
  var anims = l.property("ADBE Text Properties").property("ADBE Text Animators");
  var a = anims.addProperty("ADBE Text Animator"); a.name = "Reveal";
  var props = a.property("ADBE Text Animator Properties");
  props.addProperty("ADBE Text Position 3D").setValue([0, o.dy === undefined ? 46 : o.dy, 0]);
  props.addProperty("ADBE Text Opacity").setValue(0);
  if (o.blur !== 0) props.addProperty("ADBE Text Blur").setValue([o.blur || 10, o.blur || 10]);
  var sel = a.property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
  sel.property("ADBE Text Range Type2").setValue(o.by === "words" ? 3 : o.by === "lines" ? 4 : 2);
  sel.property("ADBE Text Expressible Amount").expression =
    "var s=" + F(start) + ", d=" + (o.stagger === undefined ? 0.028 : o.stagger) + ", dur=" + (o.dur || 0.8) + ";\n" +
    "var p=Math.min(Math.max((time-s-(textIndex-1)*d)/dur,0),1);\n" +
    "var e=p>=1?1:1-Math.pow(2,-10*p);\n" +
    "[100*(1-e),100*(1-e),100*(1-e)];";
  return l;
}
// Exit: drift up + fade, then end the layer.
function exitText(l, at, len) {
  len = len || 10;
  var tr = l.property("ADBE Transform Group");
  var p = tr.property("ADBE Position").valueAtTime(F(at), false);
  kf(tr.property("ADBE Position"), [[at, p], [at + len, [p[0], p[1] - 28]]], "in");
  kf(tr.property("ADBE Opacity"), [[at, 100], [at + len, 0]], "in");
  l.outPoint = F(at + len);
  return l;
}

function shapeLayer(comp, name) { var l = comp.layers.addShape(); l.name = name; return l; }
function group(l, name) {
  var g = l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name = name || "g"; return g;
}
function rect(g, size, round) {
  var r = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
  r.property("ADBE Vector Rect Size").setValue(size); r.property("ADBE Vector Rect Roundness").setValue(round || 0); return r;
}
function ellipse(g, size) {
  var e = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");
  e.property("ADBE Vector Ellipse Size").setValue(size); return e;
}
function pathShape(g, verts, closed) {
  var p = g.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");
  var s = new Shape(); s.vertices = verts; s.closed = !!closed; p.property("ADBE Vector Shape").setValue(s); return p;
}
function fill(g, hex, op) {
  var f = g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
  f.property("ADBE Vector Fill Color").setValue(C(hex)); if (op !== undefined) f.property("ADBE Vector Fill Opacity").setValue(op); return f;
}
function stroke(g, hex, w, cap) {
  var s = g.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");
  s.property("ADBE Vector Stroke Color").setValue(C(hex)); s.property("ADBE Vector Stroke Width").setValue(w);
  if (cap) s.property("ADBE Vector Stroke Line Cap").setValue(cap); return s;
}
function trim(g) { return g.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim"); }
function xf(l) { return l.property("ADBE Transform Group"); }
function fx(l, match, name) { var e = l.property("ADBE Effect Parade").addProperty(match); if (name) e.name = name; return e; }
function addFootage(comp, name, a, b) { var l = comp.layers.add(footage(name)); if (a !== undefined) span(l, a, b); return l; }
function viewAt(comp, frame) { try { comp.openInViewer(); comp.time = F(frame); } catch (e) {} }
function save() { app.project.save(new File(AEP)); }
// Phone rig framing: device point p (screen px + 24 bezel) lands on main point q at total device scale s.
var RIG_ANCH = [346, 474], RIG_MATCH = 1.82;
function rigFrame(screenPt, q, s) {
  var p = [screenPt[0] + 24, screenPt[1] + 24];
  var sc = s / RIG_MATCH * 100;
  return { pos: [q[0] - s * (p[0] - RIG_ANCH[0]), q[1] - s * (p[1] - RIG_ANCH[1]), 0], scale: [sc, sc, sc] };
}
function layerByName(comp, name) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i); return null; }
// Key a rig framing at frame `at` (adds to existing keys).
function rigKey(at, f, ease) {
  var rig = layerByName(getComp("OTTO_30s_9x16"), "PHONE RIG");
  kf(xf(rig).property("ADBE Position"), [[at, f.pos]], ease); kf(xf(rig).property("ADBE Scale"), [[at, f.scale]], ease);
}
function phoneOrient(keys, ease) { kf(xf(layerByName(getComp("OTTO_30s_9x16"), "PHONE")).property("ADBE Orientation"), keys, ease); }
function finishLayer() { return layerByName(getComp("OTTO_30s_9x16"), "FINISH grain"); }
// Clear keys of a property after frame `from` (so a scene can re-key its own range).
function clearKeysFrom(prop, from) { for (var i = prop.numKeys; i >= 1; i--) if (prop.keyTime(i) >= F(from) - 0.0001) prop.removeKey(i); }
// Touch ripple on the device screen (SCREEN_ui coords).
function ripple(comp, tag, pt, at) {
  var l = shapeLayer(comp, "touch " + at); var g = group(l, "t"); ellipse(g, [190, 190]); fill(g, COL.ink);
  xf(l).property("ADBE Position").setValue(pt);
  kf(xf(l).property("ADBE Scale"), [[at, [40, 40]], [at + 14, [120, 120]]], "out");
  kf(xf(l).property("ADBE Opacity"), [[at, 0], [at + 2, 30], [at + 16, 0]], "out");
  span(l, at, at + 17); return tagLayer(l, tag);
}
function headline(tag, eyebrowTxt, txt, a, b, o) {
  o = o || {};
  var M = getComp("OTTO_30s_9x16"), fin = finishLayer();
  var eb = textLayer(M, eyebrowTxt, { font: "Geist-SemiBold", size: 24, color: COL.inkFaint, tracking: 220, pos: [540, o.ebY || 136] });
  reveal(eb, a + 10, { dur: 0.7, stagger: 0.03, dy: 0, blur: 4 }); tagLayer(eb, tag, tag + " eyebrow"); span(eb, a, b); exitText(eb, b - 12, 10);
  var hl = textLayer(M, txt, { font: "Geist-Medium", size: o.size || 80, color: COL.ink, tracking: -30, leading: o.leading || 88, pos: [540, o.y || 228] });
  reveal(hl, a + 14, { dur: 0.9, stagger: 0.03 }); tagLayer(hl, tag, tag + " headline"); span(hl, a, b); exitText(hl, b - 14, 12);
  eb.moveAfter(fin); hl.moveAfter(fin);
  return hl;
}
