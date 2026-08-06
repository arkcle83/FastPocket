const { splitSegments, formatDuration } = window.FastPocketTextUtils;

const elements = {
  text: document.querySelector("#textInput"),
  title: document.querySelector("#documentTitle"),
  characterCount: document.querySelector("#characterCount"),
  segmentCount: document.querySelector("#segmentCount"),
  segmentList: document.querySelector("#segmentList"),
  position: document.querySelector("#positionLabel"),
  language: document.querySelector("#languageSelect"),
  voice: document.querySelector("#voiceSelect"),
  voiceName: document.querySelector("#voiceName"),
  voiceMeta: document.querySelector("#voiceMeta"),
  speed: document.querySelector("#speedRange"),
  speedValue: document.querySelector("#speedValue"),
  pitch: document.querySelector("#pitchRange"),
  pitchValue: document.querySelector("#pitchValue"),
  volume: document.querySelector("#volumeRange"),
  volumeValue: document.querySelector("#volumeValue"),
  quantize: document.querySelector("#quantizeToggle"),
  backendPill: document.querySelector("#backendPill"),
  backendLabel: document.querySelector("#backendLabel"),
  clipboard: document.querySelector("#clipboardButton"),
  open: document.querySelector("#openButton"),
  customVoice: document.querySelector("#customVoiceButton"),
  play: document.querySelector("#playButton"),
  playIcon: document.querySelector("#playIcon"),
  pause: document.querySelector("#pauseButton"),
  stop: document.querySelector("#stopButton"),
  previous: document.querySelector("#previousButton"),
  next: document.querySelector("#nextButton"),
  exportWav: document.querySelector("#exportWavButton"),
  exportMp3: document.querySelector("#exportMp3Button"),
  nowPlaying: document.querySelector("#nowPlaying"),
  liveWave: document.querySelector("#liveWave"),
  progress: document.querySelector("#progressFill"),
  elapsed: document.querySelector("#elapsedTime"),
  duration: document.querySelector("#durationTime"),
  toast: document.querySelector("#toast")
};

const state = {
  catalog: { languages: [], voices: [] },
  settings: { language: "french_24l", voice: "estelle", speed: 1, pitch: 0, volume: 0.9, quantize: false },
  segments: [],
  currentIndex: -1,
  audio: null,
  audioUrl: null,
  operation: 0,
  synthesisCache: new Map(),
  saveTimer: null,
  toastTimer: null,
  documentName: "Nouveau document"
};

const LANGUAGE_LABELS = {
  english: "English",
  english_2026_01: "English · Jan 2026",
  english_2026_04: "English · Apr 2026",
  french_24l: "Français · Haute qualité",
  french: "Français",
  german_24l: "Deutsch · Hohe Qualität",
  german: "Deutsch",
  portuguese_24l: "Português · Alta qualidade",
  portuguese: "Português",
  italian_24l: "Italiano · Alta qualità",
  italian: "Italiano",
  spanish_24l: "Español · Alta calidad",
  spanish: "Español"
};

function languageLabel(id) {
  return LANGUAGE_LABELS[id.replaceAll("-", "_")] || id.replaceAll("_", " · ");
}

function titleCase(value) {
  const name = String(value).split(/[\\/]/).pop().replace(/\.(wav|mp3|flac|safetensors)$/i, "");
  return name.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3600);
}

function setBackendStatus(payload) {
  const phase = payload.phase || "working";
  elements.backendPill.dataset.phase = phase;
  elements.backendLabel.textContent = payload.message || "Moteur Pocket TTS";
  if (phase === "error") showToast(payload.message, true);
}

function setRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const percentage = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty("--range", `${percentage}%`);
}

function syncControlLabels() {
  elements.speedValue.textContent = `${Number(elements.speed.value).toFixed(2)}×`;
  const pitch = Number(elements.pitch.value);
  elements.pitchValue.textContent = `${pitch > 0 ? "+" : ""}${pitch} st`;
  elements.volumeValue.textContent = `${Math.round(Number(elements.volume.value) * 100)}%`;
  [elements.speed, elements.pitch, elements.volume].forEach(setRangeFill);
}

function syncSettingsFromControls() {
  state.settings = {
    language: elements.language.value,
    voice: elements.voice.value,
    speed: Number(elements.speed.value),
    pitch: Number(elements.pitch.value),
    volume: Number(elements.volume.value),
    quantize: elements.quantize.checked
  };
}

function scheduleSettingsSave() {
  syncSettingsFromControls();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      state.settings = await window.fastPocket.saveSettings(state.settings);
    } catch (error) {
      showToast(`Paramètres non enregistrés : ${error.message}`, true);
    }
  }, 250);
}

function populateLanguages() {
  elements.language.replaceChildren();
  for (const language of state.catalog.languages) {
    const option = document.createElement("option");
    option.value = language.id;
    option.textContent = languageLabel(language.id);
    elements.language.append(option);
  }
  elements.language.value = state.settings.language;
}

function populateVoices() {
  elements.voice.replaceChildren();
  for (const voice of state.catalog.voices) {
    const option = document.createElement("option");
    option.value = voice;
    option.textContent = titleCase(voice);
    elements.voice.append(option);
  }
  if (!state.catalog.voices.includes(state.settings.voice)) {
    const custom = document.createElement("option");
    custom.value = state.settings.voice;
    custom.textContent = `${titleCase(state.settings.voice)} · local`;
    elements.voice.append(custom);
  }
  elements.voice.value = state.settings.voice;
  updateVoiceCard();
}

function updateVoiceCard() {
  const selectedLanguage = state.catalog.languages.find((item) => item.id === elements.language.value);
  elements.voiceName.textContent = titleCase(elements.voice.value || "—");
  elements.voiceMeta.textContent = `${languageLabel(elements.language.value)} · ${Math.round((selectedLanguage?.sampleRate || 24000) / 1000)} kHz`;
}

function applySettings() {
  populateLanguages();
  populateVoices();
  elements.speed.value = state.settings.speed;
  elements.pitch.value = state.settings.pitch;
  elements.volume.value = state.settings.volume;
  elements.quantize.checked = state.settings.quantize;
  syncControlLabels();
}

function setDocument(documentData) {
  if (!documentData) return;
  elements.text.value = documentData.text || "";
  state.documentName = documentData.name || "Nouveau document";
  elements.title.textContent = state.documentName;
  refreshSegments();
  stopPlayback();
}

function refreshSegments(invalidateCache = true) {
  state.segments = splitSegments(elements.text.value);
  elements.characterCount.textContent = elements.text.value.length.toLocaleString("fr-FR");
  elements.segmentCount.textContent = state.segments.length.toLocaleString("fr-FR");
  if (invalidateCache) state.synthesisCache.clear();
  if (state.currentIndex >= state.segments.length) state.currentIndex = -1;
  renderSegments();
}

function renderSegments() {
  elements.segmentList.replaceChildren();
  if (!state.segments.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const glyph = document.createElement("span");
    glyph.className = "empty-glyph";
    glyph.textContent = "Aa";
    const copy = document.createElement("p");
    copy.textContent = "Le texte découpé apparaîtra ici pendant la lecture.";
    empty.append(glyph, copy);
    elements.segmentList.append(empty);
    elements.position.textContent = "— / —";
    return;
  }

  const fragment = document.createDocumentFragment();
  state.segments.forEach((segment, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment-item";
    if (index === state.currentIndex) button.classList.add("active");
    else if (index < state.currentIndex) button.classList.add("played");
    button.dataset.index = String(index);

    const number = document.createElement("span");
    number.className = "segment-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "segment-text";
    copy.textContent = segment;
    button.append(number, copy);
    fragment.append(button);
  });
  elements.segmentList.append(fragment);
  elements.position.textContent = state.currentIndex >= 0
    ? `${state.currentIndex + 1} / ${state.segments.length}`
    : `— / ${state.segments.length}`;
}

function selectActiveSegment(index) {
  state.currentIndex = index;
  renderSegments();
  const active = elements.segmentList.querySelector(".active");
  active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  elements.nowPlaying.textContent = state.segments[index] || "En attente d’un texte";
}

function synthesisKey(index) {
  return JSON.stringify({
    text: state.segments[index],
    language: state.settings.language,
    voice: state.settings.voice,
    pitch: state.settings.pitch,
    quantize: state.settings.quantize
  });
}

function synthesizeSegment(index) {
  const key = synthesisKey(index);
  if (!state.synthesisCache.has(key)) {
    const request = {
      text: state.segments[index],
      language: state.settings.language,
      voice: state.settings.voice,
      pitch: state.settings.pitch,
      quantize: state.settings.quantize
    };
    const promise = window.fastPocket.synthesize(request).catch((error) => {
      state.synthesisCache.delete(key);
      throw error;
    });
    state.synthesisCache.set(key, promise);
  }
  return state.synthesisCache.get(key);
}

function prefetch(index) {
  if (index < state.segments.length) synthesizeSegment(index).catch(() => {});
}

function disposeAudio() {
  if (state.audio) {
    state.audio.pause();
    state.audio.removeAttribute("src");
    state.audio.load();
    state.audio = null;
  }
  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = null;
  }
  elements.liveWave.classList.remove("active");
  elements.playIcon.textContent = "▶";
}

function audioBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value?.type === "Buffer" && Array.isArray(value.data)) return new Uint8Array(value.data);
  return new Uint8Array(value);
}

async function playIndex(index) {
  refreshSegments(false);
  if (!state.segments.length) {
    showToast("Ajoute un texte avant de lancer la lecture.", true);
    elements.text.focus();
    return;
  }

  const boundedIndex = Math.min(Math.max(index, 0), state.segments.length - 1);
  const operation = ++state.operation;
  disposeAudio();
  selectActiveSegment(boundedIndex);
  syncSettingsFromControls();
  setBackendStatus({ phase: "synthesizing", message: `Préparation du segment ${boundedIndex + 1}…` });

  try {
    const result = await synthesizeSegment(boundedIndex);
    if (operation !== state.operation) return;

    state.audioUrl = URL.createObjectURL(new Blob([audioBytes(result.bytes)], { type: result.mime }));
    const audio = new Audio(state.audioUrl);
    state.audio = audio;
    audio.volume = state.settings.volume;
    audio.playbackRate = state.settings.speed;
    audio.preservesPitch = true;

    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("play", () => {
      elements.liveWave.classList.add("active");
      elements.playIcon.textContent = "❚❚";
      setBackendStatus({ phase: "ready", message: "Lecture en cours" });
    });
    audio.addEventListener("pause", () => {
      elements.liveWave.classList.remove("active");
      elements.playIcon.textContent = "▶";
    });
    audio.addEventListener("ended", () => {
      if (operation !== state.operation) return;
      if (boundedIndex + 1 < state.segments.length) playIndex(boundedIndex + 1);
      else finishPlayback();
    }, { once: true });
    audio.addEventListener("error", () => showToast("Impossible de lire l’audio généré.", true), { once: true });

    await audio.play();
    prefetch(boundedIndex + 1);
  } catch (error) {
    if (operation !== state.operation) return;
    setBackendStatus({ phase: "error", message: error.message });
    showToast(`Synthèse impossible : ${error.message}`, true);
  }
}

function updateProgress() {
  if (!state.audio) return;
  const current = state.audio.currentTime || 0;
  const duration = state.audio.duration || 0;
  elements.elapsed.textContent = formatDuration(current);
  elements.duration.textContent = formatDuration(duration);
  elements.progress.style.width = `${duration ? (current / duration) * 100 : 0}%`;
}

function finishPlayback() {
  disposeAudio();
  state.currentIndex = state.segments.length - 1;
  renderSegments();
  elements.progress.style.width = "100%";
  setBackendStatus({ phase: "ready", message: "Lecture terminée" });
  showToast("Lecture terminée.");
}

function togglePlay() {
  if (state.audio && state.audio.paused) {
    state.audio.play().catch((error) => showToast(error.message, true));
    return;
  }
  if (state.audio && !state.audio.paused) {
    state.audio.pause();
    return;
  }
  playIndex(state.currentIndex >= 0 && state.currentIndex < state.segments.length - 1 ? state.currentIndex : 0);
}

function pausePlayback() {
  state.audio?.pause();
  if (state.audio) setBackendStatus({ phase: "ready", message: "Lecture en pause" });
}

function stopPlayback() {
  state.operation += 1;
  disposeAudio();
  state.currentIndex = -1;
  elements.nowPlaying.textContent = "En attente d’un texte";
  elements.progress.style.width = "0";
  elements.elapsed.textContent = "00:00";
  elements.duration.textContent = "00:00";
  renderSegments();
}

function moveSegment(delta) {
  if (!state.segments.length) return;
  const base = state.currentIndex < 0 ? 0 : state.currentIndex;
  playIndex(Math.min(Math.max(base + delta, 0), state.segments.length - 1));
}

async function exportAudio(format) {
  refreshSegments(false);
  if (!state.segments.length) {
    showToast("Il n’y a aucun texte à exporter.", true);
    return;
  }
  syncSettingsFromControls();
  elements.exportWav.disabled = true;
  elements.exportMp3.disabled = true;
  try {
    const result = await window.fastPocket.exportAudio({
      ...state.settings,
      segments: state.segments,
      format
    });
    if (!result.canceled) showToast(`Export ${format.toUpperCase()} enregistré : ${result.path}`);
  } catch (error) {
    showToast(`Export impossible : ${error.message}`, true);
  } finally {
    elements.exportWav.disabled = false;
    elements.exportMp3.disabled = false;
  }
}

function clearVoiceCacheAndSave() {
  state.synthesisCache.clear();
  updateVoiceCard();
  scheduleSettingsSave();
}

function bindEvents() {
  let textTimer;
  elements.text.addEventListener("input", () => {
    clearTimeout(textTimer);
    textTimer = setTimeout(refreshSegments, 120);
  });
  elements.segmentList.addEventListener("click", (event) => {
    const button = event.target.closest(".segment-item");
    if (button) playIndex(Number(button.dataset.index));
  });

  elements.clipboard.addEventListener("click", async () => {
    try { setDocument(await window.fastPocket.readClipboard()); }
    catch (error) { showToast(error.message, true); }
  });
  elements.open.addEventListener("click", async () => {
    try { setDocument(await window.fastPocket.openDocument()); }
    catch (error) { showToast(`Lecture du fichier impossible : ${error.message}`, true); }
  });
  elements.customVoice.addEventListener("click", async () => {
    try {
      const voice = await window.fastPocket.chooseVoice();
      if (!voice) return;
      state.settings.voice = voice.path;
      populateVoices();
      clearVoiceCacheAndSave();
    } catch (error) { showToast(error.message, true); }
  });

  elements.language.addEventListener("change", () => {
    const model = state.catalog.languages.find((item) => item.id === elements.language.value);
    if (model?.defaultVoice) elements.voice.value = model.defaultVoice;
    if (!elements.voice.value && elements.voice.options.length) elements.voice.selectedIndex = 0;
    clearVoiceCacheAndSave();
  });
  elements.voice.addEventListener("change", clearVoiceCacheAndSave);
  elements.pitch.addEventListener("input", () => { syncControlLabels(); state.synthesisCache.clear(); scheduleSettingsSave(); });
  elements.speed.addEventListener("input", () => {
    syncControlLabels();
    if (state.audio) state.audio.playbackRate = Number(elements.speed.value);
    scheduleSettingsSave();
  });
  elements.volume.addEventListener("input", () => {
    syncControlLabels();
    if (state.audio) state.audio.volume = Number(elements.volume.value);
    scheduleSettingsSave();
  });
  elements.quantize.addEventListener("change", clearVoiceCacheAndSave);

  elements.play.addEventListener("click", togglePlay);
  elements.pause.addEventListener("click", pausePlayback);
  elements.stop.addEventListener("click", stopPlayback);
  elements.previous.addEventListener("click", () => moveSegment(-1));
  elements.next.addEventListener("click", () => moveSegment(1));
  elements.exportWav.addEventListener("click", () => exportAudio("wav"));
  elements.exportMp3.addEventListener("click", () => exportAudio("mp3"));

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      togglePlay();
    } else if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      moveSegment(-1);
    } else if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      moveSegment(1);
    }
  });
  window.addEventListener("beforeunload", disposeAudio);
}

async function initialize() {
  bindEvents();
  window.fastPocket.onBackendStatus(setBackendStatus);
  try {
    const initial = await window.fastPocket.getState();
    state.catalog = initial.catalog;
    state.settings = initial.settings;
    applySettings();
    setDocument({
      name: "Démo FastPocket",
      text: "Bienvenue dans FastPocket.\nColle un texte ou ouvre un document PDF.\nLa ligne en cours sera surlignée pendant que Pocket TTS la lit."
    });
    setBackendStatus({ phase: "ready", message: "Moteur local prêt" });
  } catch (error) {
    setBackendStatus({ phase: "error", message: error.message });
  }
}

initialize();
