#!/usr/bin/env node
// After Effects bridge: runs ExtendScript inside the running AE via `AfterFX.exe -r`,
// returns the script's result through a temp JSON file, and renders via aerender.
// Usage:
//   node ae-bridge.mjs mcp                      -> stdio MCP server (tools: ae_run_jsx, ae_run_jsx_file, ae_render, ae_status)
//   node ae-bridge.mjs run <file.jsx>           -> run a script file, print result
//   node ae-bridge.mjs eval "<jsx>"             -> run inline code, print result
//   node ae-bridge.mjs render <aep> <comp> <out> [omTemplate]
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AE_DIR = process.env.AE_DIR || "C:/Program Files/Adobe/Adobe After Effects 2026/Support Files";
const AFTERFX = path.join(AE_DIR, "AfterFX.exe");
const AERENDER = path.join(AE_DIR, "aerender.exe");
const TMP = path.join(os.tmpdir(), "ae-bridge");
fs.mkdirSync(TMP, { recursive: true });

const jsxString = (s) => JSON.stringify(s.replace(/\\/g, "/"));

export async function runJsx(code, timeoutMs = 600000) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const out = path.join(TMP, `${id}.json`);
  const script = path.join(TMP, `${id}.jsx`);
  // The user code runs as a function body; `return` sends a value back.
  const wrapped = `(function(){
  var __out = new File(${jsxString(out)});
  function __q(s){ return '"' + String(s).replace(/\\\\/g,'\\\\\\\\').replace(/"/g,'\\\\"').replace(/\\r?\\n/g,'\\\\n') + '"'; }
  function __ser(v){
    if (v === undefined || v === null) return "null";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "string") return __q(v);
    if (v instanceof Array){ var a=[]; for (var i=0;i<v.length;i++) a.push(__ser(v[i])); return "["+a.join(",")+"]"; }
    if (typeof v === "object"){ var p=[]; for (var k in v) if (v.hasOwnProperty(k)) p.push(__q(k)+":"+__ser(v[k])); return "{"+p.join(",")+"}"; }
    return __q(v);
  }
  var __res;
  try {
    app.beginSuppressDialogs();
    var __v = (function(){\n${code}\n})();
    __res = '{"ok":true,"result":' + __ser(__v) + '}';
  } catch (e) {
    __res = '{"ok":false,"error":' + __q(e.toString() + (e.line ? " (line " + e.line + ")" : "")) + '}';
  } finally { try { app.endSuppressDialogs(false); } catch (e2) {} }
  __out.encoding = "UTF-8"; __out.open("w"); __out.write(__res); __out.close();
})();`;
  fs.writeFileSync(script, wrapped, "utf8");
  spawn(AFTERFX, ["-r", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fs.existsSync(out)) {
      await new Promise((r) => setTimeout(r, 50));
      const txt = fs.readFileSync(out, "utf8");
      try { fs.unlinkSync(out); fs.unlinkSync(script); } catch {}
      try { return JSON.parse(txt); } catch { return { ok: false, error: "bad JSON from AE", raw: txt }; }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ok: false, error: `timeout after ${timeoutMs}ms (is After Effects running and idle?)` };
}

export function render(aep, comp, outFile, template) {
  const args = ["-project", aep, "-comp", comp, "-output", outFile, "-sound", "ON"];
  if (template) args.push("-OMtemplate", template);
  return new Promise((resolve) => {
    execFile(AERENDER, args, { maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
      const log = (stdout + stderr).split(/\r?\n/).filter((l) => /error|warning|finished|total time|PROGRESS:  \d+:\d+:\d+:\d+ \(\d+\)$/i.test(l)).slice(-40).join("\n");
      resolve({ ok: !err && fs.existsSync(outFile), output: outFile, log });
    });
  });
}

// ---------- minimal MCP (JSON-RPC 2.0 over stdio, newline-delimited) ----------
const TOOLS = [
  { name: "ae_status", description: "Check that After Effects is running and scriptable; returns version and open project info.", inputSchema: { type: "object", properties: {} } },
  { name: "ae_run_jsx", description: "Run ExtendScript code inside the running After Effects. The code is a function body: use `return` to send back a JSON-serializable value.", inputSchema: { type: "object", properties: { code: { type: "string" }, timeoutMs: { type: "number" } }, required: ["code"] } },
  { name: "ae_run_jsx_file", description: "Run a .jsx file inside After Effects (its contents become a function body; `return` sends a value back).", inputSchema: { type: "object", properties: { path: { type: "string" }, timeoutMs: { type: "number" } }, required: ["path"] } },
  { name: "ae_render", description: "Render a comp of a saved .aep with aerender.", inputSchema: { type: "object", properties: { project: { type: "string" }, comp: { type: "string" }, output: { type: "string" }, omTemplate: { type: "string" } }, required: ["project", "comp", "output"] } },
];

async function callTool(name, a) {
  if (name === "ae_status") return runJsx(`return {version: app.version, project: app.project.file ? app.project.file.fsName : null, items: app.project.numItems};`, 30000);
  if (name === "ae_run_jsx") return runJsx(a.code, a.timeoutMs);
  if (name === "ae_run_jsx_file") return runJsx(fs.readFileSync(a.path, "utf8"), a.timeoutMs);
  if (name === "ae_render") return render(a.project, a.comp, a.output, a.omTemplate);
  throw new Error(`unknown tool ${name}`);
}

function mcp() {
  const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
  let buf = "";
  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const { id, method, params } = msg;
      if (id === undefined) continue; // notification
      try {
        if (method === "initialize") send({ jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "after-effects", version: "1.0.0" } } });
        else if (method === "tools/list") send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        else if (method === "tools/call") {
          const r = await callTool(params.name, params.arguments || {});
          send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: r.ok === false } });
        } else if (method === "ping") send({ jsonrpc: "2.0", id, result: {} });
        else send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
      } catch (e) { send({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e) } }); }
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
const [cmd, ...rest] = isMain ? process.argv.slice(2) : [];
if (cmd === "mcp") mcp();
else if (cmd === "run") runJsx(fs.readFileSync(rest[0], "utf8")).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
else if (cmd === "eval") runJsx(rest[0]).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
else if (cmd === "render") render(...rest).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); });
else if (cmd) { console.error("usage: mcp | run <file> | eval <code> | render <aep> <comp> <out> [tpl]"); process.exit(2); }
