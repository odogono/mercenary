import type { Chip } from '../sound/workletHost.ts';

/// A whole SID for the sound board's arrangements: every waveform, ring modulation, sync, the
/// envelope generator's 8-bit counter, and the filter (the GHETTOBLASTER on the SID).
///
/// The Targ synth (`sound/synth.ts`) stays bounded to what the Reference Build plays; the
/// board's arrangements want what that leaves out, sawtooth and the filter above all. This is
/// a listening model, not an emulation: the filter is a state-variable one with an exponential
/// cutoff curve in the 6581's range, combined waveforms AND their bits, and the output is the
/// voices summed without the chip's DC or its nonlinearity.

const VOICE_STRIDE = 7;
const REGISTERS = 25;
/// Oscillators and filter run at four times the sample rate, against aliasing.
const OVERSAMPLE = 4;
/// Cycles per envelope step, by rate nibble (the datasheet's times over 255 steps).
const RATE_CYCLES = [
  9, 32, 63, 95, 149, 220, 267, 313, 392, 977, 1954, 3126, 3907, 11_720, 19_532,
  31_251
] as const;
const NOISE_SEED = 0x7f_ff_f8;

type Stage = 'attack' | 'decay' | 'release';

interface Voice {
  accumulator: number;
  counter: number;
  envelope: number;
  noise: number;
  stage: Stage;
  /// Set when the accumulator wrapped this sub-sample, for the next voice's sync.
  wrapped: boolean;
}

const voice = (): Voice => ({
  accumulator: 0,
  counter: 0,
  envelope: 0,
  noise: NOISE_SEED,
  stage: 'release',
  wrapped: false
});

/// The exponential decay's slower steps under the levels the 6581 switches at.
const divider = (envelope: number): number =>
  envelope > 93
    ? 1
    : envelope > 54
      ? 2
      : envelope > 26
        ? 4
        : envelope > 14
          ? 8
          : envelope > 6
            ? 16
            : 30;

export class BoardSid implements Chip {
  private registers = new Array<number>(REGISTERS).fill(0);
  private readonly voices = [voice(), voice(), voice()];
  private readonly cyclesPerSample: number;
  private low = 0;
  private band = 0;
  private previousMix = 0;
  private highPassed = 0;
  private readonly dcDecay: number;

  constructor(
    private readonly clockHz: number,
    private readonly sampleRate: number
  ) {
    if (!(clockHz > 0) || !(sampleRate > 0)) {
      throw new Error('the board SID needs a positive clock and sample rate');
    }
    this.cyclesPerSample = clockHz / sampleRate;
    this.dcDecay = Math.exp((-2 * Math.PI * 20) / sampleRate);
  }

  write(register: number, value: number): void {
    if (
      !Number.isInteger(register) ||
      register < 0 ||
      register >= REGISTERS ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0xff
    ) {
      throw new Error(`no SID register ${register} to hold ${value}`);
    }
    const index = Math.floor(register / VOICE_STRIDE);
    if (index < 3 && register % VOICE_STRIDE === 4) {
      const state = this.voices[index]!;
      const was = this.registers[register]!;
      if ((was & 1) === 0 && (value & 1) !== 0) {
        state.stage = 'attack';
      } else if ((was & 1) !== 0 && (value & 1) === 0) {
        state.stage = 'release';
      }
      if ((value & 8) !== 0) {
        // The test bit holds the oscillator at zero and refills the noise register.
        state.accumulator = 0;
        state.noise = NOISE_SEED;
      }
    }
    this.registers[register] = value;
  }

  reset(): void {
    this.registers.fill(0);
    for (const state of this.voices) {
      Object.assign(state, voice());
    }
    this.low = 0;
    this.band = 0;
    this.previousMix = 0;
    this.highPassed = 0;
  }

  render(length: number): Float32Array {
    const output = new Float32Array(length);
    const r = this.registers;
    const cutoff = (r[21]! & 7) | (r[22]! << 3);
    const hertz = Math.min(12_000, 220 * 2 ** ((cutoff / 0x7_ff) * 5.7));
    const rate = this.sampleRate * OVERSAMPLE;
    const f = 2 * Math.sin((Math.PI * hertz) / rate);
    const damping = 1.4 - ((r[23]! >> 4) / 15) * 1.15;
    const routing = r[23]! & 7;
    const mode = r[24]!;
    const volume = (mode & 15) / 15;
    for (let sample = 0; sample < length; sample += 1) {
      for (let index = 0; index < 3; index += 1) {
        this.envelopeStep(index);
      }
      let mixed = 0;
      for (let sub = 0; sub < OVERSAMPLE; sub += 1) {
        this.clockOscillators(this.cyclesPerSample / OVERSAMPLE);
        let direct = 0;
        let filtered = 0;
        for (let index = 0; index < 3; index += 1) {
          const value =
            this.waveform(index) * (this.voices[index]!.envelope / 255);
          if ((routing & (1 << index)) !== 0) {
            filtered += value;
          } else if (index !== 2 || (mode & 0x80) === 0) {
            direct += value;
          }
        }
        const high = filtered - this.low - damping * this.band;
        this.band += f * high;
        this.low += f * this.band;
        const out =
          ((mode & 0x10) !== 0 ? this.low : 0) +
          ((mode & 0x20) !== 0 ? this.band : 0) +
          ((mode & 0x40) !== 0 ? high : 0);
        mixed += (direct + out) * volume;
      }
      mixed *= 0.4 / OVERSAMPLE;
      this.highPassed =
        mixed - this.previousMix + this.dcDecay * this.highPassed;
      this.previousMix = mixed;
      output[sample] = this.highPassed;
    }
    return output;
  }

  private clockOscillators(cycles: number): void {
    for (let index = 0; index < 3; index += 1) {
      const state = this.voices[index]!;
      const base = index * VOICE_STRIDE;
      const control = this.registers[base + 4]!;
      state.wrapped = false;
      if ((control & 8) !== 0) {
        continue;
      }
      const frequency =
        this.registers[base]! | (this.registers[base + 1]! << 8);
      const previous = state.accumulator;
      const next = previous + (frequency * cycles) / 0x1_00_00_00;
      // The noise register shifts on accumulator bit 19's rising edges, 16 a period.
      const edges = Math.floor(next * 16) - Math.floor(previous * 16);
      for (let edge = 0; edge < edges; edge += 1) {
        const bit = ((state.noise >> 22) ^ (state.noise >> 17)) & 1;
        state.noise = ((state.noise << 1) | bit) & 0x7f_ff_ff;
      }
      state.wrapped = next >= 1;
      state.accumulator = next % 1;
    }
    for (let index = 0; index < 3; index += 1) {
      const control = this.registers[index * VOICE_STRIDE + 4]!;
      // Sync restarts a voice when the one before it wraps.
      if ((control & 2) !== 0 && this.voices[(index + 2) % 3]!.wrapped) {
        this.voices[index]!.accumulator = 0;
      }
    }
  }

  /// The voice's waveform output, −1 to 1: the selected waveforms' 12-bit values ANDed.
  private waveform(index: number): number {
    const state = this.voices[index]!;
    const base = index * VOICE_STRIDE;
    const control = this.registers[base + 4]!;
    const selected = control & 0xf0;
    if (selected === 0) {
      return 0;
    }
    const phase = state.accumulator;
    let bits = 0xf_ff;
    if ((control & 0x10) !== 0) {
      // Ring modulation flips the triangle by the previous voice's top bit.
      const flip =
        (control & 4) !== 0 && this.voices[(index + 2) % 3]!.accumulator >= 0.5;
      const top = phase >= 0.5 !== flip;
      const ramp = Math.floor(phase * 0x20_00) & 0xf_ff;
      bits &= top ? 0xf_ff - ramp : ramp;
    }
    if ((control & 0x20) !== 0) {
      bits &= Math.floor(phase * 0x10_00);
    }
    if ((control & 0x40) !== 0) {
      const width =
        this.registers[base + 2]! | ((this.registers[base + 3]! & 15) << 8);
      bits &= (control & 8) !== 0 || phase * 0x10_00 >= width ? 0xf_ff : 0;
    }
    if ((control & 0x80) !== 0) {
      const n = state.noise;
      bits &=
        (((n >> 22) & 1) << 11) |
        (((n >> 20) & 1) << 10) |
        (((n >> 16) & 1) << 9) |
        (((n >> 13) & 1) << 8) |
        (((n >> 11) & 1) << 7) |
        (((n >> 7) & 1) << 6) |
        (((n >> 4) & 1) << 5) |
        (((n >> 2) & 1) << 4);
    }
    return bits / 0x7f_f8 - 1;
  }

  /// One sample's cycles of the envelope generator's rate counter.
  private envelopeStep(index: number): void {
    const state = this.voices[index]!;
    const base = index * VOICE_STRIDE;
    const attackDecay = this.registers[base + 5]!;
    const sustainRelease = this.registers[base + 6]!;
    state.counter += this.cyclesPerSample;
    for (;;) {
      const nibble =
        state.stage === 'attack'
          ? attackDecay >> 4
          : state.stage === 'decay'
            ? attackDecay & 15
            : sustainRelease & 15;
      const period =
        RATE_CYCLES[nibble]! *
        (state.stage === 'attack' ? 1 : divider(state.envelope));
      if (state.counter < period) {
        return;
      }
      state.counter -= period;
      if (state.stage === 'attack') {
        state.envelope += 1;
        if (state.envelope >= 255) {
          state.envelope = 255;
          state.stage = 'decay';
        }
      } else if (state.stage === 'decay') {
        // The decay stops where the counter meets the sustain nibble, repeated into a byte.
        if (state.envelope > (sustainRelease >> 4) * 17) {
          state.envelope -= 1;
        } else {
          state.counter = 0;
          return;
        }
      } else if (state.envelope > 0) {
        state.envelope -= 1;
      } else {
        state.counter = 0;
        return;
      }
    }
  }
}
