const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

test("Python worker reads and atomically persists validated desktop settings", async (context) => {
  const root = path.resolve(__dirname, "../..");
  const python = process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
  if (!fs.existsSync(python)) {
    context.skip("uv sync has not created .venv yet");
    return;
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "fastpocket-config-test-"));
  const child = spawn(python, ["-m", "pocket_tts.desktop_backend"], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, FASTPOCKET_CONFIG: path.join(temporary, "settings.json") },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const pending = new Map();
  let sequence = 0;
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const payload = JSON.parse(line);
    if (payload.id && pending.has(payload.id)) {
      const callback = pending.get(payload.id);
      pending.delete(payload.id);
      callback(payload);
    }
  });

  function request(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 10_000);
      pending.set(id, (payload) => {
        clearTimeout(timer);
        if (payload.error) reject(new Error(payload.error.message));
        else resolve(payload.result);
      });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  try {
    const saved = await request("settings:save", {
      language: "french_24l",
      voice: "estelle",
      speed: 9,
      pitch: -99,
      volume: 0.42,
      quantize: true
    });
    assert.equal(saved.speed, 1.8);
    assert.equal(saved.pitch, -6);
    assert.equal(saved.volume, 0.42);
    assert.equal(saved.quantize, true);

    const state = await request("app:get-state");
    assert.equal(state.settings.speed, 1.8);
    assert.ok(state.catalog.languages.some((item) => item.id === "french_24l"));
    assert.ok(state.catalog.voices.includes("estelle"));
  } finally {
    child.stdin.end();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
