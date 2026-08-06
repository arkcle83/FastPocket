const { app, BrowserWindow, clipboard, dialog, ipcMain } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");
const crypto = require("node:crypto");
const ffmpegStatic = require("ffmpeg-static");
const { PDFParse } = require("pdf-parse");

const ROOT = __dirname;
const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;
let mainWindow = null;
let pythonBridge = null;
let audioDirectory = null;

class PythonBridge {
  constructor() {
    this.child = null;
    this.pending = new Map();
    this.sequence = 0;
    this.ready = null;
  }

  start() {
    if (this.child && !this.child.killed) return this.ready;

    const launch = resolvePythonLaunch();
    this.child = spawn(launch.command, [...launch.args, "-m", "pocket_tts.desktop_backend"], {
      cwd: ROOT,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        FASTPOCKET_CONFIG: path.join(app.getPath("userData"), "settings.json"),
        FASTPOCKET_AUDIO_DIR: audioDirectory
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Le backend Python ne répond pas.")), 120_000);
      const onReady = (payload) => {
        if (payload.phase === "ready") {
          clearTimeout(timeout);
          this._readyListener = null;
          resolve();
        }
      };
      this._readyListener = onReady;
    });

    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this._onLine(line));
    this.child.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) console.error(`[Pocket TTS] ${message}`);
    });
    this.child.on("error", (error) => this._failAll(error));
    this.child.on("exit", (code) => {
      const error = new Error(`Le backend Python s’est arrêté (code ${code ?? "inconnu"}).`);
      this._failAll(error);
      this.child = null;
      sendStatus({ phase: "error", message: error.message });
    });
    return this.ready;
  }

  _onLine(line) {
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      console.error(`[Pocket TTS] Sortie JSON invalide : ${line}`);
      return;
    }

    if (payload.event === "status") {
      if (this._readyListener) this._readyListener(payload);
      sendStatus(payload);
      return;
    }

    const pending = this.pending.get(payload.id);
    if (!pending) return;
    this.pending.delete(payload.id);
    clearTimeout(pending.timeout);
    if (payload.error) pending.reject(new Error(payload.error.message));
    else pending.resolve(payload.result);
  }

  _failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async request(method, params = {}, timeoutMs = 10 * 60_000) {
    await this.start();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Délai dépassé pour ${method}.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  stop() {
    if (!this.child || this.child.killed) return;
    this.child.stdin.end();
    setTimeout(() => {
      if (this.child && !this.child.killed) this.child.kill();
    }, 1000).unref();
  }
}

function resolvePythonLaunch() {
  const explicit = process.env.FASTPOCKET_PYTHON;
  if (explicit && fs.existsSync(explicit)) return { command: explicit, args: [] };

  const venvPython = process.platform === "win32"
    ? path.join(ROOT, ".venv", "Scripts", "python.exe")
    : path.join(ROOT, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) return { command: venvPython, args: [] };

  const locator = process.platform === "win32" ? "where.exe" : "which";
  if (spawnSync(locator, ["uv"], { windowsHide: true }).status === 0) {
    return { command: "uv", args: ["run", "python"] };
  }
  return { command: process.platform === "win32" ? "python" : "python3", args: [] };
}

function sendStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("backend:status", payload);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} invalide.`);
  }
}

function assertSynthesisRequest(request) {
  assertPlainObject(request, "Requête de synthèse");
  if (typeof request.text !== "string" || !request.text.trim() || request.text.length > 4000) {
    throw new TypeError("Le segment doit contenir entre 1 et 4 000 caractères.");
  }
  if (typeof request.language !== "string" || typeof request.voice !== "string") {
    throw new TypeError("Langue ou voix invalide.");
  }
  const pitch = Number(request.pitch ?? 0);
  if (!Number.isFinite(pitch) || pitch < -6 || pitch > 6) {
    throw new TypeError("Le pitch doit être compris entre -6 et +6 demi-tons.");
  }
}

function getFfmpegPath() {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
  if (spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status === 0) return "ffmpeg";
  throw new Error("FFmpeg est introuvable. Réinstalle les dépendances avec npm install.");
}

function atempoChain(value) {
  const filters = [];
  let remaining = value;
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters;
}

function buildAudioFilters({ sampleRate, pitch = 0, speed = 1, volume = 1 }) {
  const pitchFactor = Math.pow(2, Number(pitch) / 12);
  const filters = [
    `asetrate=${Number(sampleRate)}*${pitchFactor.toFixed(8)}`,
    `aresample=${Number(sampleRate)}`,
    ...atempoChain(Number(speed) / pitchFactor),
    `volume=${Math.min(1, Math.max(0, Number(volume))).toFixed(4)}`
  ];
  return filters.join(",");
}

function runFfmpeg(input, output, filters, format) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-filter:a", filters];
  if (format === "mp3") args.push("-codec:a", "libmp3lame", "-q:a", "2");
  else args.push("-codec:a", "pcm_s16le");
  args.push("-f", format, output);

  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`FFmpeg a échoué : ${stderr.trim() || `code ${code}`}`));
    });
  });
}

async function transformForPlayback(sourcePath, sampleRate, pitch) {
  if (Math.abs(Number(pitch)) < 0.01) return sourcePath;
  const output = path.join(audioDirectory, `pitched-${crypto.randomUUID()}.wav`);
  const filters = buildAudioFilters({ sampleRate, pitch, speed: 1, volume: 1 });
  return runFfmpeg(sourcePath, output, filters, "wav");
}

async function readPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: "#111310",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(ROOT, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.on("closed", () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle("app:get-state", () => pythonBridge.request("app:get-state"));
  ipcMain.handle("settings:save", (_event, settings) => {
    assertPlainObject(settings, "Paramètres");
    return pythonBridge.request("settings:save", settings);
  });

  ipcMain.handle("document:clipboard", () => ({ text: clipboard.readText(), name: "Presse-papiers" }));
  ipcMain.handle("document:open", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Ouvrir un texte ou un PDF",
      properties: ["openFile"],
      filters: [
        { name: "Documents", extensions: ["txt", "md", "pdf"] },
        { name: "Tous les fichiers", extensions: ["*"] }
      ]
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const extension = path.extname(filePath).toLowerCase();
    if (![".txt", ".md", ".pdf"].includes(extension)) {
      throw new Error("Format non pris en charge. Utilise un fichier TXT, Markdown ou PDF.");
    }
    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_DOCUMENT_BYTES) throw new Error("Le document dépasse la limite de 30 Mo.");
    const buffer = await fsp.readFile(filePath);
    const text = extension === ".pdf"
      ? await readPdf(buffer)
      : buffer.toString("utf8");
    return { text, name: path.basename(filePath), path: filePath };
  });

  ipcMain.handle("voice:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choisir un échantillon de voix",
      properties: ["openFile"],
      filters: [{ name: "Audio ou voix exportée", extensions: ["wav", "mp3", "flac", "safetensors"] }]
    });
    if (result.canceled) return null;
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });

  ipcMain.handle("tts:synthesize", async (_event, request) => {
    assertSynthesisRequest(request);
    const result = await pythonBridge.request("tts:synthesize", request);
    const transformed = await transformForPlayback(result.path, result.sampleRate, request.pitch);
    const bytes = await fsp.readFile(transformed);
    return { bytes, duration: result.duration, mime: "audio/wav" };
  });

  ipcMain.handle("tts:export", async (_event, request) => {
    assertPlainObject(request, "Requête d’export");
    if (!Array.isArray(request.segments) || request.segments.length === 0) {
      throw new TypeError("Aucun texte à exporter.");
    }
    if (request.segments.length > 5000 || request.segments.some((segment) => typeof segment !== "string" || !segment.trim() || segment.length > 4000)) {
      throw new TypeError("Le texte d’export contient un segment invalide.");
    }
    assertSynthesisRequest({ ...request, text: request.segments[0] });
    const format = request.format === "mp3" ? "mp3" : "wav";
    const save = await dialog.showSaveDialog(mainWindow, {
      title: `Exporter en ${format.toUpperCase()}`,
      defaultPath: `fastpocket-${new Date().toISOString().slice(0, 10)}.${format}`,
      filters: [{ name: format === "mp3" ? "Audio MP3" : "Audio WAV", extensions: [format] }]
    });
    if (save.canceled || !save.filePath) return { canceled: true };

    const result = await pythonBridge.request("tts:export", request, 60 * 60_000);
    const filters = buildAudioFilters({
      sampleRate: result.sampleRate,
      pitch: request.pitch,
      speed: request.speed,
      volume: request.volume
    });
    await runFfmpeg(result.path, save.filePath, filters, format);
    return { canceled: false, path: save.filePath };
  });
}

app.whenReady().then(async () => {
  audioDirectory = path.join(app.getPath("temp"), "fastpocket", String(process.pid));
  await fsp.mkdir(audioDirectory, { recursive: true });
  pythonBridge = new PythonBridge();
  registerIpc();
  createWindow();
  pythonBridge.start().catch((error) => sendStatus({ phase: "error", message: error.message }));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  pythonBridge?.stop();
  if (audioDirectory && audioDirectory.startsWith(app.getPath("temp"))) {
    fsp.rm(audioDirectory, { recursive: true, force: true }).catch(() => {});
  }
});
