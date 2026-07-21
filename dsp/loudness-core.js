// Loudness measurement core per ITU-R BS.1770-4 / EBU R128.
// Pure functions and classes, shared between the AudioWorklet (live) and
// the offline file analyzer. No DOM, no chrome.* APIs.

export const ABS_GATE_LUFS = -70;

const SUBBLOCK_SEC = 0.1;          // 100 ms hop → 75 % overlap on 400 ms blocks
const MOMENTARY_SUBBLOCKS = 4;     // 400 ms
const SHORTTERM_SUBBLOCKS = 30;    // 3 s
const OVERSAMPLE = 4;              // true-peak oversampling factor
const TP_TAPS_PER_PHASE = 12;
const TP_FLOOR_DBTP = -100;        // digital silence is −Infinity dB; floor it for plots

export function powerToLufs(power) {
  return power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity;
}

export function lufsToPower(lufs) {
  return Math.pow(10, (lufs + 0.691) / 10);
}

// K-weighting filter coefficients recomputed for the actual sample rate
// (analog prototype parameters from the BS.1770 filter derivation).
export function kWeightingCoeffs(fs) {
  // Stage 1: high-shelf boost
  let f0 = 1681.9744509555319;
  let G = 3.99984385397;
  let Q = 0.7071752369554193;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + Vb * K / Q + K * K) / a0,
    b1: 2 * (K * K - Vh) / a0,
    b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };

  // Stage 2: high-pass
  f0 = 38.13547087613982;
  Q = 0.5003270373253953;
  K = Math.tan(Math.PI * f0 / fs);
  a0 = 1 + K / Q + K * K;
  const highpass = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  return [shelf, highpass];
}

// Per-channel cascade of biquads (direct form II transposed).
export class BiquadChain {
  constructor(coeffs, nChannels) {
    this.coeffs = coeffs;
    this.state = [];
    for (let c = 0; c < nChannels; c++) {
      this.state.push(coeffs.map(() => ({ z1: 0, z2: 0 })));
    }
  }

  // Filters `input` (Float32Array) of channel `ch` into `out` (same length).
  process(ch, input, out) {
    const n = input.length;
    out.set(input);
    for (let s = 0; s < this.coeffs.length; s++) {
      const { b0, b1, b2, a1, a2 } = this.coeffs[s];
      const st = this.state[ch][s];
      let z1 = st.z1, z2 = st.z2;
      for (let i = 0; i < n; i++) {
        const x = out[i];
        const y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        out[i] = y;
      }
      st.z1 = z1;
      st.z2 = z2;
    }
  }

  reset() {
    for (const chState of this.state) {
      for (const st of chState) { st.z1 = 0; st.z2 = 0; }
    }
  }
}

// 4x-oversampling true-peak meter: polyphase windowed-sinc interpolator
// (12 taps per phase). Meets the BS.1770 ±0.3 dB accuracy easily.
export class TruePeakMeter {
  constructor(nChannels) {
    this.nChannels = nChannels;
    this.phases = TruePeakMeter.buildPhases();
    this.histLen = TP_TAPS_PER_PHASE;
    this.history = [];
    for (let c = 0; c < nChannels; c++) {
      this.history.push(new Float32Array(this.histLen));
    }
    this.maxPeak = 0; // linear
  }

  static buildPhases() {
    const taps = OVERSAMPLE * TP_TAPS_PER_PHASE;
    const center = (taps - 1) / 2;
    const h = new Float64Array(taps);
    for (let n = 0; n < taps; n++) {
      const t = (n - center) / OVERSAMPLE;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      // Blackman window
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (taps - 1))
        + 0.08 * Math.cos((4 * Math.PI * n) / (taps - 1));
      h[n] = sinc * w;
    }
    // Normalize each polyphase branch to unity DC gain
    const phases = [];
    for (let p = 0; p < OVERSAMPLE; p++) {
      const branch = new Float64Array(TP_TAPS_PER_PHASE);
      let sum = 0;
      for (let k = 0; k < TP_TAPS_PER_PHASE; k++) {
        branch[k] = h[p + k * OVERSAMPLE];
        sum += branch[k];
      }
      for (let k = 0; k < TP_TAPS_PER_PHASE; k++) branch[k] /= sum;
      phases.push(branch);
    }
    return phases;
  }

  // Returns the linear true-peak max of this chunk (across channels).
  process(channels) {
    const phases = this.phases;
    let chunkMax = 0;
    for (let c = 0; c < channels.length && c < this.nChannels; c++) {
      const x = channels[c];
      const hist = this.history[c];
      const n = x.length;
      for (let i = 0; i < n; i++) {
        // shift history (12 taps – cheap enough)
        for (let k = this.histLen - 1; k > 0; k--) hist[k] = hist[k - 1];
        hist[0] = x[i];
        for (let p = 0; p < OVERSAMPLE; p++) {
          const br = phases[p];
          let acc = 0;
          for (let k = 0; k < TP_TAPS_PER_PHASE; k++) acc += br[k] * hist[k];
          const a = Math.abs(acc);
          if (a > chunkMax) chunkMax = a;
        }
      }
    }
    if (chunkMax > this.maxPeak) this.maxPeak = chunkMax;
    return chunkMax;
  }

  reset() {
    this.maxPeak = 0;
    for (const h of this.history) h.fill(0);
  }
}

export function linearToDb(v) {
  return v > 0 ? 20 * Math.log10(v) : -Infinity;
}

// Streaming loudness analyzer. Feed arbitrary-length chunks of raw
// (unweighted) channel data via process(); read metrics via getStats().
export class LoudnessAnalyzer {
  constructor(sampleRate, nChannels) {
    this.sampleRate = sampleRate;
    this.nChannels = nChannels;
    // L/R/C weight 1.0; surround channels (index 3+ after LFE skip) 1.41.
    // For typical browser audio (mono/stereo) all weights are 1.
    this.weights = [];
    for (let c = 0; c < nChannels; c++) {
      this.weights.push(c === 3 && nChannels >= 5 ? 0 /* LFE excluded */
        : c >= 4 ? 1.41 : 1.0);
    }
    this.filter = new BiquadChain(kWeightingCoeffs(sampleRate), nChannels);
    this.truePeak = new TruePeakMeter(nChannels);
    this.subLen = Math.round(sampleRate * SUBBLOCK_SEC);
    this.scratch = null;
    this.reset();
  }

  reset() {
    this.filter.reset();
    this.truePeak.reset();
    this.subPos = 0;
    this.subSum = 0;                       // weighted sum of squares, current sub-block
    this.subblocks = [];                   // ring of recent sub-block powers
    this.blockPowers = [];                 // 400 ms momentary powers ≥ abs gate (for integrated)
    this.shortTermLoudness = [];           // gated short-term values (for LRA)
    this.shortTermHistory = [];            // every short-term value, one per 100 ms hop (for plots)
    this.truePeakHistory = [];             // dBTP max per 100 ms hop (for plots)
    this.momentary = -Infinity;
    this.shortTerm = -Infinity;
    this.subTruePeak = 0;                  // linear peak so far in the open sub-block
    this.currentTruePeak = 0;
    this.silentSubblocks = 0;
    this.totalSamples = 0;
  }

  // channels: array of Float32Array, all same length
  process(channels) {
    const n = channels[0].length;
    this.totalSamples += n;
    if (!this.scratch || this.scratch.length < n) this.scratch = new Float32Array(n);

    // K-weight each channel, accumulate weighted squared sums into sub-blocks
    for (let c = 0; c < channels.length && c < this.nChannels; c++) {
      const w = this.weights[c];
      if (w === 0) continue;
      this.filter.process(c, channels[c], this.scratch);
      // store per-channel filtered data summed by sample position below
      if (c === 0) {
        if (!this.sqBuf || this.sqBuf.length < n) this.sqBuf = new Float32Array(n);
        this.sqBuf.fill(0, 0, n);
      }
      const sq = this.sqBuf;
      const f = this.scratch;
      for (let i = 0; i < n; i++) sq[i] += w * f[i] * f[i];
    }

    const sq = this.sqBuf;
    let i = 0;
    let chunkPeak = 0;
    while (i < n) {
      const take = Math.min(n - i, this.subLen - this.subPos);
      // Metered on the same segments as the loudness sub-blocks so each 100 ms
      // hop gets its own peak. The meter carries its filter history across
      // calls, so feeding it contiguous slices is equivalent to one call over
      // the whole chunk — the reported maxima are unchanged.
      const segPeak = this.truePeak.process(channels.map((ch) => ch.subarray(i, i + take)));
      if (segPeak > this.subTruePeak) this.subTruePeak = segPeak;
      if (segPeak > chunkPeak) chunkPeak = segPeak;
      let s = this.subSum;
      for (let j = i; j < i + take; j++) s += sq[j];
      this.subSum = s;
      this.subPos += take;
      i += take;
      if (this.subPos === this.subLen) this._finishSubblock();
    }
    this.currentTruePeak = chunkPeak;
  }

  _finishSubblock() {
    this.truePeakHistory.push(Math.max(linearToDb(this.subTruePeak), TP_FLOOR_DBTP));
    this.subTruePeak = 0;
    this.subblocks.push(this.subSum / this.subLen);
    this.subSum = 0;
    this.subPos = 0;
    if (this.subblocks.length > SHORTTERM_SUBBLOCKS) this.subblocks.shift();

    const nb = this.subblocks.length;

    // Momentary: mean of last 4 sub-block powers
    if (nb >= MOMENTARY_SUBBLOCKS) {
      let p = 0;
      for (let k = nb - MOMENTARY_SUBBLOCKS; k < nb; k++) p += this.subblocks[k];
      p /= MOMENTARY_SUBBLOCKS;
      this.momentary = powerToLufs(p);
      if (this.momentary >= ABS_GATE_LUFS) {
        this.blockPowers.push(p);
        this.silentSubblocks = 0;
      } else {
        this.silentSubblocks++;
      }
    } else {
      this.silentSubblocks++;
    }

    // Short-term: mean of last 30 sub-block powers
    if (nb >= SHORTTERM_SUBBLOCKS) {
      let p = 0;
      for (let k = 0; k < nb; k++) p += this.subblocks[k];
      p /= nb;
      this.shortTerm = powerToLufs(p);
      this.shortTermHistory.push(Math.max(this.shortTerm, ABS_GATE_LUFS));
      if (this.shortTerm >= ABS_GATE_LUFS) {
        this.shortTermLoudness.push(this.shortTerm);
      }
    }
  }

  // Integrated loudness with two-stage gating (BS.1770-4).
  _integrated() {
    const blocks = this.blockPowers;
    if (blocks.length === 0) return -Infinity;
    let sum = 0;
    for (const p of blocks) sum += p;
    const relThreshPower = lufsToPower(powerToLufs(sum / blocks.length) - 10);
    let gatedSum = 0, gatedCount = 0;
    for (const p of blocks) {
      if (p >= relThreshPower) { gatedSum += p; gatedCount++; }
    }
    return gatedCount ? powerToLufs(gatedSum / gatedCount) : -Infinity;
  }

  // Loudness range per EBU Tech 3342: relative gate −20 LU, 10th–95th percentile.
  _lra() {
    const st = this.shortTermLoudness;
    if (st.length < 2) return null;
    let energy = 0;
    for (const l of st) energy += lufsToPower(l);
    const relGate = powerToLufs(energy / st.length) - 20;
    const gated = st.filter((l) => l >= relGate);
    if (gated.length < 2) return null;
    gated.sort((a, b) => a - b);
    const perc = (q) => {
      const idx = q * (gated.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return gated[lo] + (gated[hi] - gated[lo]) * (idx - lo);
    };
    return perc(0.95) - perc(0.1);
  }

  getStats() {
    const integrated = this._integrated();
    const maxTp = linearToDb(this.truePeak.maxPeak);
    return {
      momentary: this.momentary,
      shortTerm: this.shortTerm,
      integrated,
      lra: this._lra(),
      truePeak: linearToDb(this.currentTruePeak),
      maxTruePeak: maxTp,
      plr: isFinite(integrated) && isFinite(maxTp) ? maxTp - integrated : null,
      silenceSec: this.silentSubblocks * SUBBLOCK_SEC,
      durationSec: this.totalSamples / this.sampleRate,
    };
  }
}
