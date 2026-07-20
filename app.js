// LUFSly Web — app shell: targets, local settings, file queue.

import { msg, initLang, onLangChange } from './i18n.js';
import { analyzeFile, initReport } from './report.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'lufsly-settings';

// ---------- presets ----------

// DR bands in LU: [upper bound, css class, i18n key]. Speech-oriented for
// podcast/streaming (2–4 LU normal), wider for broadcast/music.
const SPEECH_DR = {
  scaleMax: 8,
  ticks: [0, 2, 4, 6, 8],
  bands: [
    [2, 'darkred', 'drVeryLow'],
    [4, 'good', 'drNormal'],
    [6, 'warning', 'drMore'],
    [Infinity, 'critical', 'drVeryHigh'],
  ],
};
const MUSIC_DR = {
  scaleMax: 24,
  ticks: [0, 6, 12, 18, 24],
  bands: [
    [4, 'critical', 'drLow'],
    [7, 'warning', 'drOk'],
    [20, 'good', 'drGood'],
    [Infinity, 'warning', 'drVeryHigh'],
  ],
};

const PRESETS = {
  podcast: { target: -16, tolerance: 1, dr: SPEECH_DR },
  streaming: { target: -14, tolerance: 1, dr: SPEECH_DR },
  broadcast: { target: -23, tolerance: 0.5, dr: MUSIC_DR },
};

const DEFAULTS = {
  preset: 'podcast',
  customTarget: -16,
  tolerance: 1,
  tpLimit: -1,
  drMode: 'auto',
  drTarget: 4,
};

const settings = { ...DEFAULTS };

// A band table centred on the user's own LRA target: on target within ±50 %,
// below is over-compressed, above is unusually wide.
function customDrBands(target) {
  const scaleMax = Math.max(8, Math.ceil(target * 2));
  const step = scaleMax / 4;
  return {
    scaleMax,
    ticks: [0, 1, 2, 3, 4].map((i) => Math.round(i * step * 10) / 10),
    bands: [
      [target * 0.5, 'critical', 'drBelowTarget'],
      [target * 1.5, 'good', 'drOnTarget'],
      [Infinity, 'warning', 'drAboveTarget'],
    ],
  };
}

// Resolves the active target set, including "none" (no loudness target) and
// "custom" (user-entered target).
function currentPreset() {
  const base = settings.preset === 'none' ? { target: null, dr: SPEECH_DR }
    : settings.preset === 'custom' ? { target: settings.customTarget, dr: SPEECH_DR }
    : PRESETS[settings.preset] || PRESETS.podcast;
  return {
    target: base.target,
    tolerance: settings.tolerance,
    tpLimit: settings.tpLimit,
    dr: settings.drMode === 'custom' ? customDrBands(settings.drTarget) : base.dr,
  };
}

// One complete label for the active target. The stock preset names already
// carry their value ("Podcast (−16 LUFS)"), so only the custom one needs the
// number appended.
function targetLabel() {
  const p = currentPreset();
  if (p.target == null) return msg('presetNone');
  // Plain number, not fmt(), so a whole value reads "−18" like the presets do.
  if (settings.preset === 'custom') return `${msg('presetCustom')} (${String(p.target).replace('-', '−')} LUFS)`;
  return msg('preset' + settings.preset.charAt(0).toUpperCase() + settings.preset.slice(1));
}

// ---------- settings storage (localStorage, no cookies) ----------

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) {
        if (stored[k] !== undefined) settings[k] = stored[k];
      }
    }
  } catch {
    // Corrupt or unavailable storage — fall back to defaults rather than
    // leaving the app unusable.
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function applySettingsToUi() {
  $('preset').value = settings.preset;
  $('custom-target').value = settings.customTarget;
  $('tolerance').value = settings.tolerance;
  $('tp-limit').value = settings.tpLimit;
  $('dr-mode').value = settings.drMode;
  $('dr-target').value = settings.drTarget;
  // Each inline value input appears beside its own select rather than
  // becoming a field of its own; the grid column already has room for both.
  $('custom-target-field').hidden = settings.preset !== 'custom';
  $('dr-custom-field').hidden = settings.drMode !== 'custom';
}

// Everything that depends on the targets, re-scored from stored stats.
// No file is ever analyzed twice.
function onTargetsChanged() {
  saveSettings();
  applySettingsToUi();
  renderQueue();
  report.refresh();
}

// ---------- formatting & verdicts (shared with the report) ----------

function fmt(v, unit = '') {
  if (v == null || !isFinite(v)) return '–';
  return v.toFixed(1).replace('-', '−') + unit;
}

function drBand(lra, preset) {
  const bands = preset.dr.bands;
  for (const [limit, cls, key] of bands) {
    if (lra < limit) return { cls, key };
  }
  const last = bands[bands.length - 1];
  return { cls: last[1], key: last[2] };
}

// Returns null when there is no loudness target ("none").
function loudnessVerdict(integrated, preset) {
  if (preset.target == null) return null;
  const diff = integrated - preset.target;
  if (Math.abs(diff) <= preset.tolerance) return { cls: 'good', text: msg('justRight') };
  if (diff < 0) return { cls: 'warning', text: msg('tooQuiet', [Math.abs(diff).toFixed(1)]) };
  return { cls: 'critical', text: msg('tooLoud', [diff.toFixed(1)]) };
}

// Offsets are relative to the configured True Peak limit, chosen so the
// default −1 dBTP reproduces the extension exactly: red at/over the clip
// point, yellow above −0.95, green below.
function peakClass(maxTruePeak, preset) {
  if (!isFinite(maxTruePeak)) return '';
  const limit = preset?.tpLimit ?? -1;
  if (maxTruePeak > limit + 0.9) return 'critical';
  if (maxTruePeak > limit + 0.05) return 'warning';
  return 'good';
}

const report = initReport({
  fmt, drBand, peakClass, loudnessVerdict,
  getPreset: currentPreset,
  getTargetLabel: targetLabel,
});

// ---------- queue ----------

let queue = [];
let activeId = null;
let nextId = 1;
let analyzing = false;

function renderQueue() {
  const list = $('queue-list');
  list.textContent = '';
  $('queue-card').hidden = queue.length === 0;
  if (queue.length === 0) {
    report.hide();
    return;
  }

  const preset = currentPreset();
  for (const entry of queue) {
    const s = entry.stats;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'queue-item' + (entry.id === activeId ? ' active' : '');

    const loudV = isFinite(s.integrated) ? loudnessVerdict(s.integrated, preset) : null;
    const name = document.createElement('div');
    name.className = 'qname';
    const badge = document.createElement('span');
    badge.className = 'badge ' + (loudV ? loudV.cls : '');
    const label = document.createElement('span');
    label.textContent = entry.fileName;
    label.title = entry.fileName;
    name.append(badge, label);

    const vals = document.createElement('div');
    vals.className = 'qvals';
    const cells = [
      [fmt(s.integrated, ' LUFS'), loudV ? loudV.cls : '', msg('colIntegrated')],
      [fmt(s.maxTruePeak, ' dBTP'), peakClass(s.maxTruePeak, preset), msg('colTruePeak')],
      [s.lra != null ? fmt(s.lra, ' LU') : '–', s.lra != null ? drBand(s.lra, preset).cls : '', msg('colLra')],
    ];
    for (const [text, cls, labelText] of cells) {
      const cell = document.createElement('div');
      cell.className = 'qval' + (cls ? ' val-' + cls : '');
      cell.dataset.label = labelText;
      cell.textContent = text;
      vals.append(cell);
    }

    const remove = document.createElement('span');
    remove.className = 'queue-remove';
    remove.textContent = '✕';
    remove.title = msg('removeFile');
    remove.setAttribute('role', 'button');
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      removeEntry(entry.id);
    });

    item.append(name, vals, remove);
    item.addEventListener('click', () => selectEntry(entry.id));
    list.append(item);
  }
}

function selectEntry(id) {
  const entry = queue.find((e) => e.id === id);
  if (!entry) return;
  activeId = id;
  renderQueue();
  report.show(entry);
}

function removeEntry(id) {
  queue = queue.filter((e) => e.id !== id);
  if (activeId === id) {
    activeId = queue.length ? queue[queue.length - 1].id : null;
    if (activeId != null) {
      renderQueue();
      report.show(queue.find((e) => e.id === activeId));
      return;
    }
    report.hide();
  }
  renderQueue();
}

$('btn-clear-queue').addEventListener('click', () => {
  queue = [];
  activeId = null;
  report.hide();
  renderQueue();
});

// ---------- analysis ----------

function setProgress(text, fraction) {
  const box = $('analyze-progress');
  box.hidden = false;
  box.classList.remove('error');
  $('progress-text').textContent = text;
  $('progress-fill').style.width = Math.round((fraction ?? 0) * 100) + '%';
}

function setError(text) {
  const box = $('analyze-progress');
  box.hidden = false;
  box.classList.add('error');
  $('progress-text').textContent = text;
  $('progress-fill').style.width = '0%';
  setTimeout(() => { if (!analyzing) box.hidden = true; }, 5000);
}

// Files are processed one at a time: a single decoded AudioBuffer at a time
// keeps memory sane when several long WAVs are dropped together.
async function enqueueFiles(files) {
  const list = Array.from(files).filter((f) => f && f.size > 0);
  if (!list.length || analyzing) return;
  analyzing = true;

  for (const file of list) {
    setProgress(msg('decoding', [file.name]), 0);
    try {
      const result = await analyzeFile(file, (frac) => {
        setProgress(msg('analyzing', [file.name, String(Math.round(frac * 100))]), frac);
      });
      const entry = { id: nextId++, fileName: file.name, ...result };
      queue.push(entry);
      activeId = entry.id;
      renderQueue();
      report.show(entry);
    } catch {
      // Unsupported codec or corrupt file: report it and keep going so one
      // bad file does not abort the rest of the batch.
      setError(`${file.name}: ${msg('decodeError')}`);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  analyzing = false;
  $('analyze-progress').hidden = !$('analyze-progress').classList.contains('error');
}

// ---------- file input & drag and drop ----------

const filePicker = document.createElement('input');
filePicker.type = 'file';
filePicker.accept = 'audio/*';
filePicker.multiple = true;
filePicker.hidden = true;
document.body.appendChild(filePicker);
filePicker.addEventListener('change', () => {
  enqueueFiles(filePicker.files);
  filePicker.value = '';
});

const dropZone = $('drop-zone');
dropZone.addEventListener('click', () => filePicker.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filePicker.click(); }
});

// Drop anywhere on the page, not just on the zone. The depth counter keeps the
// overlay stable while the pointer crosses child elements.
const overlay = $('drop-overlay');
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) overlay.hidden = true;
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  dropZone.classList.remove('dragover');
  if (e.dataTransfer?.files?.length) enqueueFiles(e.dataTransfer.files);
});

// ---------- target controls ----------

$('preset').addEventListener('change', () => {
  settings.preset = $('preset').value;
  // Adopt the preset's own tolerance (Broadcast is tighter), which the user
  // can then override in the field next to it.
  const p = PRESETS[settings.preset];
  if (p) settings.tolerance = p.tolerance;
  onTargetsChanged();
});

for (const [id, key, min, max] of [
  ['custom-target', 'customTarget', -40, 0],
  ['tolerance', 'tolerance', 0, 10],
  ['tp-limit', 'tpLimit', -10, 0],
  ['dr-target', 'drTarget', 0.5, 30],
]) {
  $(id).addEventListener('input', () => {
    const v = parseFloat($(id).value);
    if (isNaN(v) || v < min || v > max) return;
    settings[key] = v;
    saveSettings();
    renderQueue();
    report.refresh();
  });
}

$('dr-mode').addEventListener('change', () => {
  settings.drMode = $('dr-mode').value;
  onTargetsChanged();
});

$('btn-reset-targets').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  onTargetsChanged();
});

// ---------- init ----------

loadSettings();
applySettingsToUi();
initLang();
// The queue and report hold translated text, so both are rebuilt on switch.
onLangChange(() => {
  applySettingsToUi();
  renderQueue();
  report.refresh();
});

window.addEventListener('resize', () => report.refresh());
