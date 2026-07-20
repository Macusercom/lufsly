// Offline file analysis and report rendering with PNG/PDF/copy export.
// Ported from the LevelCheck extension side panel: the DSP, chart drawing and
// PDF writer are unchanged, only the chrome.* APIs and the single-file
// assumption were removed.

import { LoudnessAnalyzer } from './dsp/loudness-core.js';
import { msg } from './i18n.js';

const HOP_SEC = 0.1;          // one short-term history point per 100 ms
const SHORTTERM_OFFSET = 30;  // short-term values only begin after 3 s

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

// Decode and measure one file. Progress is reported through the callback so
// the caller owns the UI; the AudioBuffer is released as soon as it has been
// walked, leaving only the ~10 values/s history behind.
export async function analyzeFile(file, onProgress) {
  const data = await file.arrayBuffer();
  const rate = sniffSampleRate(data);

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

  return {
    bufferInfo: { sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels },
    stats: analyzer.getStats(),
    history: analyzer.shortTermHistory,
  };
}

export function initReport({ fmt, drBand, peakClass, loudnessVerdict, getPreset, getTargetLabel }) {
  let lastReportText = '';
  let current = null; // { fileName, bufferInfo, stats, history, model }

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
      [msg('momentary'), fmt(s.momentary, ' LUFS'), '', 'infoMomentary'],
      [msg('shortTerm'), fmt(s.shortTerm, ' LUFS'), '', 'infoShortTerm'],
      [msg('duration'), formatTime(s.durationSec), '', null],
      [msg('sampleRate'), bufferInfo.sampleRate + ' Hz', '', null],
      [msg('channels'), String(bufferInfo.numberOfChannels), '', null],
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

  function render(entry, scroll) {
    const { fileName, bufferInfo, stats: s, history } = entry;
    const model = buildModel(fileName, bufferInfo, s);
    current = { fileName, bufferInfo, stats: s, history, model };
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
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = k;
      if (info) {
        const ic = document.createElement('span');
        ic.className = 'info';
        const t = msg(info);
        ic.title = t;
        ic.setAttribute('aria-label', t);
        ic.setAttribute('tabindex', '0');
        ic.setAttribute('role', 'img');
        td1.append(' ', ic);
      }
      const td2 = document.createElement('td');
      td2.textContent = v;
      if (cls) td2.className = 'val-' + cls;
      tr.append(td1, td2);
      table.append(tr);
    }

    drawChartOnScreen(history, model.preset.target);

    lastReportText = [
      `LevelCheck – ${msg('reportTitle')}: ${fileName}`,
      ...model.rows.map(([k, v]) => `${k}: ${v}`),
      `${msg('presetLabel')}: ${model.targetLabel}`,
    ].join('\n');

    $('report').hidden = false;
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

  // ---- chart drawing (shared by screen and export) ----

  function drawChartInto(ctx, rect, history, target) {
    ctx.save();
    ctx.fillStyle = col('--page');
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const yMin = -40, yMax = 0;
    const padL = 32, padR = 10, padT = 8, padB = 18;
    const plotW = rect.w - padL - padR;
    const plotH = rect.h - padT - padB;
    const xAt = (i) => rect.x + padL + (history.length < 2 ? 0 : (i / (history.length - 1)) * plotW);
    const yAt = (v) => rect.y + padT + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * plotH;

    ctx.strokeStyle = col('--grid');
    ctx.fillStyle = col('--muted');
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (let v = yMax; v >= yMin; v -= 10) {
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(rect.x + padL, y);
      ctx.lineTo(rect.x + rect.w - padR, y);
      ctx.stroke();
      ctx.fillText(String(v).replace('-', '−'), rect.x + padL - 4, y + 3);
    }

    if (history.length >= 2) {
      // series first, thin, so the target line stays legible on top
      ctx.strokeStyle = col('--accent');
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = xAt(i), y = yAt(history[i]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // Files under ~3 s never produce a short-term value.
      ctx.fillStyle = col('--muted');
      ctx.textAlign = 'center';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('–', rect.x + rect.w / 2, rect.y + rect.h / 2);
    }

    if (target != null) drawTargetLine(ctx, rect.x + padL, rect.x + rect.w - padR, yAt(target), target);
    ctx.restore();
    return { padL, padR, plotW, xAt, yAt };
  }

  function drawTargetLine(ctx, x0, x1, y, target) {
    ctx.save();
    ctx.strokeStyle = col('--warning');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = String(target).replace('-', '−') + ' LUFS';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(label).width;
    ctx.fillStyle = col('--surface');
    ctx.fillRect(x1 - w - 5, y - 14, w + 5, 13);
    ctx.fillStyle = col('--warning');
    ctx.fillText(label, x1 - 1, y - 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawChartOnScreen(history, target) {
    const canvas = $('report-chart');
    const cssW = canvas.parentElement.clientWidth || 300;
    const cssH = 170;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const map = drawChartInto(ctx, { x: 0, y: 0, w: cssW, h: cssH }, history, target);

    const tip = $('chart-tip');
    canvas.onmousemove = (e) => {
      if (history.length < 2) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const i = Math.round(((x - map.padL) / map.plotW) * (history.length - 1));
      if (i < 0 || i >= history.length) { tip.hidden = true; return; }
      const t = (i + SHORTTERM_OFFSET) * HOP_SEC;
      tip.textContent = `${formatTime(t)} · ${history[i].toFixed(1)} LUFS`;
      tip.style.left = map.xAt(i) + 'px';
      tip.style.top = map.yAt(history[i]) + 'px';
      tip.hidden = false;
    };
    canvas.onmouseleave = () => { tip.hidden = true; };
  }

  // ---- export ----

  // Compose the whole report into an offscreen canvas (2× for crisp output).
  function renderReportImage() {
    if (!current) return null;
    const { model, history } = current;
    const target = model.preset.target;
    const scale = 2;
    const W = 660;
    const P = 26;
    const rowH = 24;
    const headerH = 74;
    const verdictH = model.verdicts.length * 24 + 10;
    const tableH = model.rows.length * rowH + 12;
    const chartH = 190;
    const footerH = 30;
    const H = P + headerH + verdictH + tableH + 26 + chartH + footerH;

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
    ctx.fillText('LevelCheck – ' + msg('reportTitle'), P, y + 6);
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
    drawChartInto(ctx, { x: P, y, w: W - 2 * P, h: chartH - 20 }, history, target);

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
    return 'LevelCheck_' + n.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
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
