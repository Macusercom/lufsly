// Offline file analysis and report rendering with PNG/PDF/copy export.
// Ported from the LUFSly extension side panel: the DSP, chart drawing and
// PDF writer are unchanged, only the chrome.* APIs and the single-file
// assumption were removed.

import { LoudnessAnalyzer, powerToLufs, lufsToPower, ABS_GATE_LUFS } from './dsp/loudness-core.js';
import { msg } from './i18n.js';

const HOP_SEC = 0.1;          // one short-term history point per 100 ms
const SHORTTERM_OFFSET = 30;  // short-term values only begin after 3 s

// Rolling loudness range. LRA proper (EBU Tech 3342) describes a whole
// programme; sliding a window over it shows how the range moves instead.
const DR_WINDOW_HOPS = 300;   // 30 s of short-term values per window
const DR_STEP_HOPS = 5;       // evaluate every 0.5 s — a 21 k-hop file would
                              // otherwise sort a 300-value window 21 k times
                              // for a chart only ~600 px wide
const DR_MIN_HOPS = 100;      // emit once 10 s is available, so short files
                              // still get a curve rather than nothing

// Same gating and percentiles as LoudnessAnalyzer._lra, applied to one window.
// Kept identical on purpose: this is the time-resolved view of the LRA figure
// in the table, so the two must agree.
export function lraOf(values) {
  if (values.length < 2) return null;
  let energy = 0;
  for (const l of values) energy += lufsToPower(l);
  const relGate = powerToLufs(energy / values.length) - 20;
  const gated = values.filter((l) => l >= relGate);
  if (gated.length < 2) return null;
  gated.sort((a, b) => a - b);
  const perc = (q) => {
    const idx = q * (gated.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return gated[lo] + (gated[hi] - gated[lo]) * (idx - lo);
  };
  return perc(0.95) - perc(0.1);
}

// history is shortTermHistory, which floors silence at ABS_GATE_LUFS; _lra
// reads shortTermLoudness, which simply omits those. Filter to match.
// windowHops = Infinity measures the whole file, which must reproduce stats.lra.
export function rollingLra(history, windowHops = DR_WINDOW_HOPS, stepHops = DR_STEP_HOPS) {
  const values = [];
  const firstEnd = Math.min(DR_MIN_HOPS, history.length);
  const at = (end) => {
    const start = Math.max(0, end - windowHops);
    const win = [];
    for (let i = start; i < end; i++) {
      if (history[i] >= ABS_GATE_LUFS) win.push(history[i]);
    }
    return lraOf(win) ?? 0;
  };
  // Strictly on the step grid: the series is positioned as t0 + i * hop, so an
  // off-grid tail point would be drawn at the wrong time. The curve therefore
  // ends up to one step (0.5 s) short of the file, which is sub-pixel.
  for (let end = firstEnd; end <= history.length; end += stepHops) values.push(at(end));
  return {
    values,
    // Each point describes the window ending at its own timestamp.
    t0: SHORTTERM_OFFSET * HOP_SEC + (firstEnd - 1) * HOP_SEC,
    hop: stepHops * HOP_SEC,
  };
}

const $ = (id) => document.getElementById(id);

// decodeAudioData always resamples to the context's own rate, which defaults
// to the output device (often 44.1 kHz). That would both misreport the file's
// sample rate and measure a resampled signal instead of the original. So read
// the real rate out of the container first and decode into a context running
// at exactly that rate — then nothing is resampled.
//
// Returns null for formats we cannot cheaply sniff (M4A/AAC), where we fall
// back to the browser's default and report what we actually measured.
function sniffSampleRate(data) {
  const b = new Uint8Array(data);
  const dv = new DataView(data);
  const tag = (o, s) => String.fromCharCode(...b.subarray(o, o + s.length)) === s;
  if (b.length < 16) return null;

  // WAV / RIFF: walk the chunk list to the fmt chunk.
  if (tag(0, 'RIFF') && tag(8, 'WAVE')) {
    let o = 12;
    while (o + 8 <= b.length) {
      const size = dv.getUint32(o + 4, true);
      if (tag(o, 'fmt ')) return dv.getUint32(o + 12, true);
      o += 8 + size + (size & 1);
    }
    return null;
  }

  // FLAC STREAMINFO: 20-bit sample rate starting at byte 10 of the block.
  if (tag(0, 'fLaC') && b.length > 30) {
    return (b[18] << 12) | (b[19] << 4) | (b[20] >> 4);
  }

  // Ogg: Vorbis carries its rate; Opus always decodes at 48 kHz.
  if (tag(0, 'OggS')) {
    for (let o = 0; o < Math.min(b.length - 16, 65536); o++) {
      if (tag(o, 'OpusHead')) return 48000;
      if (b[o] === 0x01 && tag(o + 1, 'vorbis')) return dv.getUint32(o + 12, true);
    }
    return null;
  }

  // MP3: skip any ID3v2 tag, then read the first frame header.
  let o = 0;
  if (tag(0, 'ID3')) {
    o = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  }
  const RATES = {
    3: [44100, 48000, 32000],  // MPEG 1
    2: [22050, 24000, 16000],  // MPEG 2
    0: [11025, 12000, 8000],   // MPEG 2.5
  };
  for (let i = o; i < Math.min(b.length - 4, o + 65536); i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (b[i + 1] >> 3) & 0x03;
    const idx = (b[i + 2] >> 2) & 0x03;
    if (idx === 3 || !RATES[version]) continue;
    return RATES[version][idx];
  }
  return null;
}

// What the file actually is, read from the container rather than trusted from
// the extension or the browser's MIME guess. Walks the same headers as
// sniffSampleRate. Both fields are null when they cannot be established —
// the report shows a dash rather than inventing a value.
//
// Must run before decoding: decodeAudioData detaches the ArrayBuffer.
function sniffFormat(data) {
  const b = new Uint8Array(data);
  const dv = new DataView(data);
  if (b.length < 16) return { codec: null, encoder: null };

  const tag = (o, s) => String.fromCharCode(...b.subarray(o, o + s.length)) === s;
  // Trailing NULs and padding are common in these string fields.
  const ascii = (o, n) => String.fromCharCode(...b.subarray(o, o + n))
    .replace(/\0[\s\S]*$/, '').trim();
  const find = (needle, from, to) => {
    const end = Math.min(b.length - needle.length, to);
    for (let i = from; i <= end; i++) if (tag(i, needle)) return i;
    return -1;
  };

  // ---- WAV / RIFF ----
  if (tag(0, 'RIFF') && tag(8, 'WAVE')) {
    const WAVE_FORMATS = {
      1: 'PCM', 3: 'IEEE float', 6: 'A-law', 7: 'µ-law', 0x11: 'IMA ADPCM', 0x55: 'MP3',
    };
    let codec = 'WAV', encoder = null;
    let o = 12;
    while (o + 8 <= b.length) {
      const size = dv.getUint32(o + 4, true);
      if (tag(o, 'fmt ')) {
        let fmt = dv.getUint16(o + 8, true);
        const bits = dv.getUint16(o + 22, true);
        // Extensible: the real format is the first half of the SubFormat GUID.
        if (fmt === 0xfffe && o + 34 <= b.length) fmt = dv.getUint16(o + 32, true);
        const name = WAVE_FORMATS[fmt] ?? `format ${fmt}`;
        codec = `WAV (${name}${bits ? ` ${bits}-bit` : ''})`;
      } else if (tag(o, 'LIST') && tag(o + 8, 'INFO')) {
        // ISFT is the "software" field, where encoders record themselves.
        const isft = find('ISFT', o + 12, o + 8 + size);
        if (isft > 0) encoder = ascii(isft + 8, dv.getUint32(isft + 4, true)) || null;
      }
      o += 8 + size + (size & 1);
    }
    return { codec, encoder };
  }

  // ---- FLAC ----
  if (tag(0, 'fLaC') && b.length > 30) {
    const bits = ((((b[20] & 1) << 4) | (b[21] >> 4)) + 1);
    let encoder = null;
    // Metadata blocks: 1 byte (last-flag + type) then a 24-bit length.
    let o = 4;
    while (o + 4 <= b.length) {
      const last = b[o] & 0x80, type = b[o] & 0x7f;
      const len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
      if (type === 4 && o + 8 <= b.length) {          // VORBIS_COMMENT
        const vlen = dv.getUint32(o + 4, true);
        encoder = ascii(o + 8, vlen) || null;
      }
      if (last) break;
      o += 4 + len;
    }
    return { codec: `FLAC (${bits}-bit)`, encoder };
  }

  // ---- Ogg: Opus or Vorbis ----
  if (tag(0, 'OggS')) {
    const limit = Math.min(b.length, 65536);
    const opus = find('OpusHead', 0, limit);
    if (opus >= 0) {
      const tags = find('OpusTags', 0, limit);
      const vendor = tags >= 0 ? ascii(tags + 12, dv.getUint32(tags + 8, true)) : '';
      return { codec: 'Opus', encoder: vendor || null };
    }
    const vorbis = find('vorbis', 0, limit);
    if (vorbis >= 0) {
      // Comment header is packet type 3 followed by "vorbis", then the vendor.
      let encoder = null;
      for (let i = 0; i < limit - 7; i++) {
        if (b[i] === 0x03 && tag(i + 1, 'vorbis')) {
          encoder = ascii(i + 11, dv.getUint32(i + 7, true)) || null;
          break;
        }
      }
      return { codec: 'Vorbis', encoder };
    }
    return { codec: 'Ogg', encoder: null };
  }

  // ---- MP4 / M4A: brand only, no box walking ----
  if (tag(4, 'ftyp')) {
    const brand = ascii(8, 4);
    const codec = /M4A|mp4|iso|M4B/i.test(brand) ? 'AAC (M4A)' : `MP4 (${brand})`;
    return { codec, encoder: null };
  }

  // ---- MP3 ----
  // Two encoder claims can coexist: the LAME tag names the codec that actually
  // encoded the audio, while ID3's TSSE is whatever muxed the file (ffmpeg
  // writes "Lavf…" there). For a row labelled "Encoder" the codec wins, with
  // TSSE as the fallback for files LAME never touched.
  let o = 0, tsseEncoder = null;
  if (tag(0, 'ID3')) {
    const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
    for (const frame of ['TSSE', 'TENC']) {
      const at = find(frame, 10, 10 + size);
      if (at > 0) {
        const len = dv.getUint32(at + 4, false);
        // First byte of a text frame is the encoding marker.
        tsseEncoder = ascii(at + 11, Math.max(0, len - 1)) || null;
        if (tsseEncoder) break;
      }
    }
    o = 10 + size;
  }
  let encoder = null;
  // LAME stamps its version into the Xing/Info header of the first frame; the
  // exact offset varies with version and channel mode, so match the string.
  const lame = find('LAME', o, o + 8192);
  if (lame > 0) {
    const s = ascii(lame, 9);
    if (/^LAME\d/.test(s)) encoder = s.replace(/^LAME/, 'LAME ');
  }
  encoder ??= tsseEncoder;
  const LAYERS = { 1: 'Layer III', 2: 'Layer II', 3: 'Layer I' };
  const VERSIONS = { 3: 'MPEG-1', 2: 'MPEG-2', 0: 'MPEG-2.5' };
  const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  for (let i = o; i < Math.min(b.length - 4, o + 65536); i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (b[i + 1] >> 3) & 0x03;
    const layer = (b[i + 1] >> 1) & 0x03;
    const brIdx = b[i + 2] >> 4;
    if (layer === 0 || !VERSIONS[version]) continue;
    const table = version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3;
    const kbps = layer === 1 && brIdx > 0 && brIdx < 15 ? table[brIdx] : 0;
    const detail = [VERSIONS[version], LAYERS[layer], kbps ? `${kbps} kbps` : null]
      .filter(Boolean).join(', ');
    return { codec: `MP3 (${detail})`, encoder };
  }
  return { codec: null, encoder };
}

// Decode and measure one file. Progress is reported through the callback so
// the caller owns the UI; the AudioBuffer is released as soon as it has been
// walked, leaving only the ~10 values/s history behind.
export async function analyzeFile(file, onProgress) {
  const data = await file.arrayBuffer();
  const rate = sniffSampleRate(data);
  const format = sniffFormat(data);

  let buffer;
  if (rate >= 3000 && rate <= 768000) {
    // decodeAudioData detaches the buffer, so hand it a copy — the fallback
    // below still needs the original bytes.
    const off = new OfflineAudioContext(1, 1, rate);
    try {
      buffer = await off.decodeAudioData(data.slice(0));
    } catch {
      buffer = null; // sniffed wrong, or the browser refused the rate
    }
  }
  if (!buffer) {
    const ctx = new AudioContext();
    try {
      buffer = await ctx.decodeAudioData(data);
    } finally {
      ctx.close();
    }
  }

  const analyzer = new LoudnessAnalyzer(buffer.sampleRate, buffer.numberOfChannels);
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));

  const chunkLen = buffer.sampleRate; // 1 s per chunk, yield in between
  for (let pos = 0; pos < buffer.length; pos += chunkLen) {
    const end = Math.min(pos + chunkLen, buffer.length);
    analyzer.process(channels.map((ch) => ch.subarray(pos, end)));
    onProgress?.(end / buffer.length);
    await new Promise((r) => setTimeout(r));
  }

  // The analyzer's momentary/short-term fields are live-meter values: each one
  // is overwritten every 100 ms, so at the end of a file they describe only its
  // last 400 ms / 3 s. For a finished file the maxima are the useful figures —
  // they reveal overshoots the integrated value averages away. Both are derived
  // from data the analyzer already keeps, so the DSP core stays untouched.
  const stats = analyzer.getStats();
  stats.momentaryMax = maxPowerToLufs(analyzer.blockPowers);
  stats.shortTermMax = maxValue(analyzer.shortTermLoudness);

  return {
    bufferInfo: {
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
      codec: format.codec,
      encoder: format.encoder,
    },
    stats,
    history: analyzer.shortTermHistory,
    peaks: analyzer.truePeakHistory,
  };
}

// Looped rather than Math.max(...arr): a long file yields tens of thousands of
// entries, which is enough to overflow the argument list.
function maxValue(values) {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  return max;
}

function maxPowerToLufs(powers) {
  let max = 0;
  for (const p of powers) if (p > max) max = p;
  return max > 0 ? powerToLufs(max) : -Infinity;
}

export function initReport({ fmt, drBand, peakClass, loudnessVerdict, getPreset, getTargetLabel }) {
  let lastReportText = '';
  let current = null; // { fileName, bufferInfo, stats, history, model }
  // The charts of the report currently on screen, rebuilt on every render so a
  // hover on one can place the crosshair on all of them.
  const charts = [];

  // Read live so a colour change would be picked up; also keeps the exported
  // image in sync with the on-screen palette.
  const col = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const clsColor = (cls) => col(
    cls === 'good' ? '--good' : cls === 'warning' ? '--warning'
    : cls === 'serious' ? '--serious' : cls === 'critical' ? '--critical'
    : cls === 'darkred' ? '--darkred' : '--ink');

  $('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lastReportText);
      flash('btn-copy', 'copied', 'copyReport');
    } catch {
      // Clipboard is blocked without a user gesture in some browsers; the
      // click is one, but permission can still be denied.
    }
  });
  $('btn-save-png').addEventListener('click', () => exportPng());
  $('btn-save-pdf').addEventListener('click', () => exportPdf());

  function flash(id, onKey, offKey) {
    $(id).textContent = msg(onKey);
    setTimeout(() => { $(id).textContent = msg(offKey); }, 1500);
  }

  // Build the verdict + row model shared by the DOM view and the exported image.
  function buildModel(fileName, bufferInfo, s) {
    const preset = getPreset();
    const loudV = isFinite(s.integrated) ? loudnessVerdict(s.integrated, preset) : null;
    const verdicts = [];
    if (loudV) {
      verdicts.push({ cls: loudV.cls, text: msg('reportVerdictLoudness', [String(preset.target).replace('-', '−'), loudV.text]) });
    }
    if (isFinite(s.maxTruePeak)) {
      const cls = peakClass(s.maxTruePeak, preset);
      const val = s.maxTruePeak.toFixed(1).replace('-', '−');
      const inner = cls === 'critical' ? msg('peakClippedVerdict', [val]) : msg('peakOkVerdict', [val]);
      verdicts.push({ cls, text: msg('reportVerdictPeak', [inner]) });
    }
    if (s.lra != null) {
      const band = drBand(s.lra, preset);
      verdicts.push({ cls: band.cls, text: msg('reportVerdictDr', [msg(band.key)]) });
    }

    // rows: [label, value, colorClass, infoKey]
    const rows = [
      [msg('integrated'), fmt(s.integrated, ' LUFS'), loudV ? loudV.cls : '', 'infoIntegrated'],
      [msg('truePeakMax'), fmt(s.maxTruePeak, ' dBTP'), peakClass(s.maxTruePeak, preset), 'infoTruePeak'],
      [msg('lra'), s.lra != null ? fmt(s.lra, ' LU') : '–', s.lra != null ? drBand(s.lra, preset).cls : '', 'infoLra'],
      [msg('plr'), s.plr != null ? fmt(s.plr, ' dB') : '–', '', 'infoPlr'],
      [msg('momentaryMax'), fmt(s.momentaryMax, ' LUFS'), '', 'infoMomentaryMax'],
      [msg('shortTermMax'), fmt(s.shortTermMax, ' LUFS'), '', 'infoShortTermMax'],
      [msg('duration'), formatTime(s.durationSec), '', null],
      [msg('sampleRate'), bufferInfo.sampleRate + ' Hz', '', null],
      [msg('channels'), String(bufferInfo.numberOfChannels), '', null],
      [msg('codec'), bufferInfo.codec || '–', '', 'infoCodec'],
      [msg('encoder'), bufferInfo.encoder || '–', '', 'infoEncoder'],
    ];
    return { fileName, preset, targetLabel: getTargetLabel(), verdicts, rows };
  }

  function show(entry) {
    render(entry, true);
  }

  // Re-render from stored stats — used when a target changes or the language
  // is switched. No re-analysis needed.
  function refresh() {
    if (current) render(current, false);
  }

  function hide() {
    $('report').hidden = true;
    current = null;
  }

  // LRA does not depend on the target, so the series survives a target or
  // language change untouched — only its band colours are re-derived. Keeps
  // "changing a target re-scores instantly, no re-analysis" true.
  function drSeries(entry) {
    entry.dr ??= rollingLra(entry.history);
    return entry.dr;
  }

  function drChartOpts(preset, durationSec) {
    const dr = preset.dr;
    return {
      yMin: 0, yMax: dr.scaleMax, ticks: [...dr.ticks].reverse(),
      durationSec, unit: 'LU',
      bandOf: (v) => clsColor(drBand(v, preset).cls),
    };
  }

  function render(entry, scroll) {
    const { fileName, bufferInfo, stats: s, history, peaks = [] } = entry;
    const model = buildModel(fileName, bufferInfo, s);
    current = { fileName, bufferInfo, stats: s, history, peaks, model, entry };
    $('report-file').textContent = fileName;

    const verdictsEl = $('report-verdicts');
    verdictsEl.textContent = '';
    for (const v of model.verdicts) {
      const div = document.createElement('div');
      div.className = 'verdict';
      const badge = document.createElement('span');
      badge.className = 'badge ' + v.cls;
      const span = document.createElement('span');
      span.textContent = v.text;
      div.append(badge, span);
      verdictsEl.append(div);
    }

    buildDrBar(model.preset, s.lra);

    const table = $('report-table');
    table.textContent = '';
    for (const [k, v, cls, info] of model.rows) {
      const row = document.createElement('div');
      row.className = 'metric';
      const label = document.createElement('span');
      label.className = 'metric-label';
      label.textContent = k;
      if (info) {
        const ic = document.createElement('span');
        ic.className = 'info';
        const t = msg(info);
        ic.title = t;
        ic.setAttribute('aria-label', t);
        ic.setAttribute('tabindex', '0');
        ic.setAttribute('role', 'img');
        label.append(' ', ic);
      }
      const value = document.createElement('span');
      value.className = 'metric-value' + (cls ? ' val-' + cls : '');
      value.textContent = v;
      row.append(label, value);
      table.append(row);
    }

    // Unhide before drawing: a hidden section has clientWidth 0, which would
    // size the canvas from the fallback and stretch it to the wrong aspect.
    $('report').hidden = false;
    // Rebuilt below; without this every re-render (target or language change)
    // would leave the previous run's charts in the registry.
    charts.length = 0;
    const tpLimit = model.preset.tpLimit ?? -1;
    drawChartOnScreen('report-chart', 'chart-tip',
      { values: history, t0: LOUDNESS_T0, hop: HOP_SEC },
      { yMin: -40, yMax: 0, step: 10, durationSec: s.durationSec, unit: 'LUFS',
        limit: null, target: model.preset.target });
    drawChartOnScreen('peak-chart', 'peak-tip',
      { values: peaks, t0: PEAK_T0, hop: HOP_SEC },
      { yMin: -40, yMax: 3, step: 10, durationSec: s.durationSec, unit: 'dBTP',
        limit: tpLimit });
    drawChartOnScreen('dr-chart', 'dr-tip', drSeries(entry),
      drChartOpts(model.preset, s.durationSec));

    const clipEl = $('clip-times');
    clipEl.textContent = clipSummary(peaks, tpLimit);
    clipEl.hidden = !clipEl.textContent;

    lastReportText = [
      `LUFSly – ${msg('reportTitle')}: ${fileName}`,
      ...model.rows.map(([k, v]) => `${k}: ${v}`),
      `${msg('presetLabel')}: ${model.targetLabel}`,
    ].join('\n');

    if (scroll) $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Coloured band bar with a pointer at the measured LRA.
  function buildDrBar(preset, lra) {
    const dr = preset.dr;
    const bar = $('dr-bar');
    bar.textContent = '';
    let prev = 0;
    for (const [limit, cls] of dr.bands) {
      const upper = isFinite(limit) ? limit : dr.scaleMax;
      const seg = document.createElement('div');
      seg.className = 'dr-seg ' + cls;
      seg.style.flexGrow = String(Math.max(0.001, upper - prev));
      bar.appendChild(seg);
      prev = upper;
      if (prev >= dr.scaleMax) break;
    }
    if (lra != null) {
      const pointer = document.createElement('div');
      pointer.className = 'dr-pointer';
      pointer.style.left = Math.min(100, (lra / dr.scaleMax) * 100) + '%';
      bar.appendChild(pointer);
    }

    const scale = $('dr-scale');
    scale.textContent = '';
    for (const t of dr.ticks) {
      const span = document.createElement('span');
      span.textContent = t;
      scale.appendChild(span);
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')} min`;
  }

  // Axis ticks and clip times want a bare clock, without formatTime's " min".
  function formatClock(sec) {
    const t = Math.max(0, Math.round(sec));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
  }

  // ---- chart drawing (shared by screen and export) ----

  // Both charts share one time domain so their x axes line up: the loudness
  // series only starts at 3 s (short-term needs a full 3 s window) while peaks
  // start at the first 100 ms hop. x therefore comes from absolute time, never
  // from the array index — indexing would shift the peak chart 3 s left.
  const LOUDNESS_T0 = SHORTTERM_OFFSET * HOP_SEC;
  const PEAK_T0 = HOP_SEC;

  // One point per pixel column, carrying that column's maximum. Columns the
  // series does not reach stay empty rather than being interpolated across, so
  // a chart whose series starts late (loudness at 3 s) keeps its gap.
  function decimate(values, xAt, plotX0, plotW) {
    const cols = Math.max(1, Math.round(plotW));
    if (values.length <= cols) {
      return values.map((v, i) => ({ x: xAt(i), v }));
    }
    const max = new Array(cols).fill(-Infinity);
    for (let i = 0; i < values.length; i++) {
      const c = Math.min(cols - 1, Math.max(0, Math.round(xAt(i) - plotX0)));
      if (values[i] > max[c]) max[c] = values[i];
    }
    const out = [];
    for (let c = 0; c < cols; c++) {
      if (max[c] > -Infinity) out.push({ x: plotX0 + c, v: max[c] });
    }
    return out;
  }

  const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  function niceTimeStep(span, target = 6) {
    return TIME_STEPS.find((s) => s >= span / target) ?? TIME_STEPS[TIME_STEPS.length - 1];
  }

  // series: { values, t0, hop }
  // opts: { yMin, yMax, step | ticks, durationSec, unit, target, limit, bandOf }
  //   step   — even grid spacing; ticks — explicit gridlines, for the DR scale
  //            whose max depends on the preset (8 speech / 24 music / custom).
  //   target — the loudness goal: amber reference line, no markers.
  //   limit  — the peak ceiling: red line, plus a dot on every hop above it.
  //   bandOf — colours the curve per point, echoing the DR bar's bands.
  function drawChartInto(ctx, rect, series, opts) {
    const { values, t0, hop } = series;
    const { yMin, yMax, step, ticks, durationSec, target, limit, unit, bandOf } = opts;
    ctx.save();
    ctx.fillStyle = col('--page');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const padL = 32, padR = 10, padT = 8, padB = 26;
    const plotW = rect.w - padL - padR;
    const plotH = rect.h - padT - padB;
    const span = durationSec > 0 ? durationSec : 1;
    const xAtTime = (t) => rect.x + padL + Math.min(1, Math.max(0, t / span)) * plotW;
    const xAt = (i) => xAtTime(t0 + i * hop);
    const yAt = (v) => rect.y + padT + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = col('--grid');
    ctx.fillStyle = col('--muted');
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    // Anchored on 0 rather than yMax, so headroom above 0 dBTP stays unlabelled
    // instead of yielding a 3 / −7 / −17 ladder.
    const gridLines = ticks ?? (() => {
      const out = [];
      for (let v = Math.floor(yMax / step) * step; v >= yMin; v -= step) out.push(v);
      return out;
    })();
    for (const v of gridLines) {
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(rect.x + padL, y);
      ctx.lineTo(rect.x + rect.w - padR, y);
      ctx.stroke();
      ctx.fillText(String(v).replace('-', '−'), rect.x + padL - 4, y + 3);
    }

    drawTimeAxis(ctx, rect, padL, padR, padB, span, xAtTime);

    if (values.length >= 2) {
      // A 35-minute file is ~21 k hops across ~570 px — 37 line segments per
      // pixel column, which is pure overdraw and reads as a solid block. Reduce
      // to one point per column first, keeping each column's maximum since that
      // is what a peak reading means. The hover tooltip still indexes the full
      // series, so no resolution is lost to the reader.
      const points = decimate(values, xAt, rect.x + padL, plotW);

      // Soft fill under the contour, then the contour itself on top.
      const baseY = yAt(yMin);
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      let i = 0;
      while (i < points.length - 1) {
        const color = bandOf ? bandOf(points[i].v) : col('--accent');
        let j = i + 1;
        while (j < points.length - 1 && (!bandOf || bandOf(points[j].v) === color)) j++;

        // Only single-colour series get the fill. Filling a band-coloured curve
        // draws each run down to the baseline, so every band change becomes a
        // hard vertical edge and the chart turns into a barcode.
        if (!bandOf) {
          ctx.beginPath();
          ctx.moveTo(points[i].x, baseY);
          for (let k = i; k <= j; k++) ctx.lineTo(points[k].x, yAt(points[k].v));
          ctx.lineTo(points[j].x, baseY);
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();
        }

        ctx.strokeStyle = color;
        ctx.beginPath();
        for (let k = i; k <= j; k++) {
          const y = yAt(points[k].v);
          k === i ? ctx.moveTo(points[k].x, y) : ctx.lineTo(points[k].x, y);
        }
        ctx.stroke();
        i = j;
      }
    } else {
      // Files under ~3 s never produce a short-term value.
      ctx.fillStyle = col('--muted');
      ctx.textAlign = 'center';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('–', rect.x + rect.w / 2, rect.y + rect.h / 2);
    }

    if (target != null) {
      drawLimitLine(ctx, rect.x + padL, rect.x + rect.w - padR, yAt(target),
        String(target).replace('-', '−') + ' ' + unit, col('--warning'));
    }

    if (limit != null) {
      // Every hop over the limit gets a dot, so a single overshoot and a
      // continuously clipped passage look different at a glance.
      ctx.fillStyle = col('--critical');
      for (let i = 0; i < values.length; i++) {
        if (values[i] <= limit) continue;
        ctx.beginPath();
        ctx.arc(xAt(i), yAt(values[i]), 2, 0, Math.PI * 2);
        ctx.fill();
      }
      drawLimitLine(ctx, rect.x + padL, rect.x + rect.w - padR, yAt(limit),
        String(limit).replace('-', '−') + ' ' + unit, col('--critical'));
    }

    ctx.restore();
    return { padL, padR, padT, plotW, plotH, xAt, yAt, xAtTime };
  }

  function drawTimeAxis(ctx, rect, padL, padR, padB, span, xAtTime) {
    const step = niceTimeStep(span);
    const yBase = rect.y + rect.h - padB;
    const xEnd = rect.x + rect.w - padR;
    ctx.save();
    ctx.strokeStyle = col('--grid');
    ctx.fillStyle = col('--muted');
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let t = 0; t <= span + 1e-6; t += step) {
      const x = xAtTime(t);
      ctx.beginPath();
      ctx.moveTo(x, yBase);
      ctx.lineTo(x, yBase + 4);
      ctx.stroke();
      // Nudge the end labels inward so they cannot run off either edge.
      ctx.textAlign = t === 0 ? 'left' : (x > xEnd - 16 ? 'right' : 'center');
      ctx.fillText(formatClock(t), x, yBase + 15);
    }
    ctx.restore();
  }

  function drawLimitLine(ctx, x0, x1, y, label, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(label).width;
    ctx.fillStyle = col('--surface');
    ctx.fillRect(x1 - w - 5, y - 14, w + 5, 13);
    ctx.fillStyle = color;
    ctx.fillText(label, x1 - 1, y - 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Consecutive over-limit hops are one event, not thirty: coalesce runs less
  // than a second apart so the listed times stay readable.
  function clipEvents(values, limit, t0, hop, gapSec = 1) {
    const times = [];
    let last = -Infinity;
    for (let i = 0; i < values.length; i++) {
      if (values[i] <= limit) continue;
      const t = t0 + i * hop;
      if (t - last > gapSec) times.push(t);
      last = t;
    }
    return times;
  }

  function clipSummary(peaks, limit) {
    const times = clipEvents(peaks, limit, PEAK_T0, HOP_SEC);
    if (!times.length) return '';
    const shown = times.slice(0, 5).map(formatClock).join(', ');
    const rest = times.length - 5;
    const label = msg('clipTimes', [String(limit).replace('-', '−'), shown]);
    return rest > 0 ? `${label} ${msg('clipMore', [rest])}` : label;
  }

  function drawChartOnScreen(canvasId, tipId, series, opts) {
    const canvas = $(canvasId);
    const cssW = canvas.parentElement.clientWidth || 300;
    const cssH = 170;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const map = drawChartInto(ctx, { x: 0, y: 0, w: cssW, h: cssH }, series, opts);

    const tip = $(tipId);
    const cursor = canvas.parentElement.querySelector('.chart-cursor');
    // The cursor is a positioned element rather than a canvas redraw: moving a
    // div costs nothing, whereas repainting the chart on every mousemove would
    // redraw tens of thousands of points.
    charts.push({ cursor, map });

    const { values, t0, hop } = series;
    const hideCursors = () => {
      for (const c of charts) if (c.cursor) c.cursor.hidden = true;
    };
    const hideAll = () => { tip.hidden = true; hideCursors(); };
    canvas.onmousemove = (e) => {
      if (values.length < 2) return hideAll();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      // Invert the time mapping, then land on this series' nearest sample.
      const t = ((x - map.padL) / map.plotW) * opts.durationSec;
      const i = Math.round((t - t0) / hop);
      if (i < 0 || i >= values.length) return hideAll();
      const tAt = t0 + i * hop;
      tip.textContent = `${formatClock(tAt)} · ${values[i].toFixed(1).replace('-', '−')} ${opts.unit}`;
      tip.style.left = map.xAt(i) + 'px';
      tip.style.top = map.yAt(values[i]) + 'px';
      tip.hidden = false;
      // The charts share a time axis, so mark the same instant on all of them.
      // Positioned per chart from its own map rather than by copying pixels, so
      // this still holds if a chart is ever sized differently.
      for (const c of charts) {
        if (!c.cursor) continue;
        c.cursor.style.left = c.map.xAtTime(tAt) + 'px';
        c.cursor.style.top = c.map.padT + 'px';
        c.cursor.style.height = c.map.plotH + 'px';
        c.cursor.hidden = false;
      }
    };
    canvas.onmouseleave = hideAll;
  }

  // ---- export ----

  // Compose the whole report into an offscreen canvas (2× for crisp output).
  function renderReportImage() {
    if (!current) return null;
    const { model, history, peaks = [], stats, entry } = current;
    const durationSec = stats.durationSec;
    const target = model.preset.target;
    const tpLimit = model.preset.tpLimit ?? -1;
    const clipLine = clipSummary(peaks, tpLimit);
    const scale = 2;
    const W = 660;
    const P = 26;
    const rowH = 24;
    const headerH = 74;
    const verdictH = model.verdicts.length * 24 + 10;
    const tableH = model.rows.length * rowH + 12;
    const chartH = 190;
    const clipH = clipLine ? 18 : 0;
    const footerH = 30;
    const H = P + headerH + verdictH + tableH + 26 + chartH * 3 + clipH + footerH;

    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = col('--surface');
    ctx.fillRect(0, 0, W, H);

    let y = P;
    ctx.fillStyle = col('--ink');
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LUFSly – ' + msg('reportTitle'), P, y + 6);
    y += 26;
    ctx.fillStyle = col('--muted');
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(truncate(ctx, model.fileName, W - 2 * P), P, y + 4);
    y += 14;
    ctx.fillText(`${msg('presetLabel')}: ${model.targetLabel}`, P, y + 8);
    y = P + headerH;

    ctx.font = '13px system-ui, sans-serif';
    for (const v of model.verdicts) {
      ctx.fillStyle = clsColor(v.cls);
      ctx.beginPath();
      ctx.arc(P + 5, y - 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col('--ink');
      ctx.fillText(v.text, P + 18, y);
      y += 24;
    }
    y += 10;

    ctx.font = '13px system-ui, sans-serif';
    for (const [k, val, cls] of model.rows) {
      ctx.strokeStyle = col('--grid');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(P, y + 6);
      ctx.lineTo(W - P, y + 6);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = col('--muted');
      ctx.fillText(k, P, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = cls ? clsColor(cls) : col('--ink');
      ctx.font = (cls ? '600 ' : '') + '13px system-ui, sans-serif';
      ctx.fillText(val, W - P, y);
      ctx.font = '13px system-ui, sans-serif';
      y += rowH;
    }
    y += 20;

    ctx.textAlign = 'left';
    ctx.fillStyle = col('--muted');
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(msg('loudnessHistory'), P, y);
    y += 8;
    drawChartInto(ctx, { x: P, y, w: W - 2 * P, h: chartH - 20 },
      { values: history, t0: LOUDNESS_T0, hop: HOP_SEC },
      { yMin: -40, yMax: 0, step: 10, durationSec, unit: 'LUFS', target });
    y += chartH - 20 + 22;

    ctx.textAlign = 'left';
    ctx.fillStyle = col('--muted');
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(msg('peakHistory'), P, y);
    y += 8;
    drawChartInto(ctx, { x: P, y, w: W - 2 * P, h: chartH - 20 },
      { values: peaks, t0: PEAK_T0, hop: HOP_SEC },
      { yMin: -40, yMax: 3, step: 10, durationSec, unit: 'dBTP', limit: tpLimit });
    y += chartH - 20;

    if (clipLine) {
      ctx.fillStyle = col('--critical');
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(truncate(ctx, clipLine, W - 2 * P), P, y + 14);
    }
    y += clipH + 22;

    ctx.textAlign = 'left';
    ctx.fillStyle = col('--muted');
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(msg('drHistory'), P, y);
    y += 8;
    drawChartInto(ctx, { x: P, y, w: W - 2 * P, h: chartH - 20 },
      drSeries(entry), drChartOpts(model.preset, durationSec));

    return canvas;
  }

  function truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 4 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function baseName() {
    const n = current?.model.fileName || 'report';
    return 'LUFSly_' + n.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportPng() {
    const canvas = renderReportImage();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) download(blob, baseName() + '.png');
      flash('btn-save-png', 'saved', 'savePng');
    }, 'image/png');
  }

  function exportPdf() {
    const canvas = renderReportImage();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      blob.arrayBuffer().then((buf) => {
        const pdf = buildPdf(new Uint8Array(buf), canvas.width, canvas.height);
        download(pdf, baseName() + '.pdf');
        flash('btn-save-pdf', 'saved', 'savePdf');
      });
    }, 'image/jpeg', 0.92);
  }

  // Minimal single-page PDF embedding the report as a JPEG image (DCTDecode).
  function buildPdf(jpegBytes, pxW, pxH) {
    const pageW = 595.28, pageH = 841.89; // A4 in points
    const margin = 28;
    const s = Math.min((pageW - 2 * margin) / pxW, (pageH - 2 * margin) / pxH);
    const iw = pxW * s, ih = pxH * s;
    const ix = (pageW - iw) / 2;
    const iy = pageH - margin - ih;

    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let len = 0;
    const push = (bytes) => { parts.push(bytes); len += bytes.length; };
    const pushStr = (str) => push(enc.encode(str));
    const obj = (n, body) => { offsets[n] = len; pushStr(`${n} 0 obj\n${body}\nendobj\n`); };

    pushStr('%PDF-1.4\n%âãÏÓ\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
    const content = `q\n${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    obj(4, `<< /Length ${content.length} >>\nstream\n${content}endstream`);

    offsets[5] = len;
    pushStr(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    push(jpegBytes);
    pushStr('\nendstream\nendobj\n');

    const xrefPos = len;
    let xref = `xref\n0 6\n0000000000 65535 f \n`;
    for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    pushStr(xref);
    pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

    return new Blob(parts, { type: 'application/pdf' });
  }

  return { show, refresh, hide, getCurrentName: () => current?.fileName ?? null };
}
