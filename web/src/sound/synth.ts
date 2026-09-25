import type { SoundDocument } from '../payload/documents.ts';
import type { Chip } from './workletHost.ts';

const PHASE_SCALE = 0x1_00_00_00;
const NOISE_BITS = [22, 20, 16, 13, 11, 7, 4, 2] as const;
const ATTACK_SECONDS = [
  0.002, 0.008, 0.016, 0.024, 0.038, 0.056, 0.068, 0.08, 0.1, 0.25, 0.5, 0.8, 1,
  3, 5, 8
] as const;

type EnvelopeStage = 'attack' | 'decay' | 'sustain' | 'release';

interface VoiceState {
  envelope: number;
  envelopeClock: number;
  noise: number;
  phase: number;
  stage: EnvelopeStage;
}

const initialVoice = (): VoiceState => ({
  envelope: 0,
  envelopeClock: 0,
  noise: 0x7f_ff_ff,
  phase: 0,
  stage: 'release'
});

const byte = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${name} must be a byte`);
  }
  return value;
};

/// The project-owned synthesis core shared by live AudioWorklet output and
/// deterministic offline tests. It implements only controls proven reachable
/// in the configured Reference Build: triangle, pulse, noise, ring modulation,
/// gate, and the three ADSR envelopes.
export class SidSynth implements Chip<[registers?: readonly number[]]> {
  private readonly voices: VoiceState[] = Array.from(
    { length: 3 },
    initialVoice
  );
  private registers: number[];
  private muted = false;
  private suspended = false;
  private volume = 1;
  private previousMix = 0;
  private highPassed = 0;
  private readonly dcDecay: number;

  constructor(
    private readonly document: SoundDocument,
    private readonly sampleRate: number
  ) {
    if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
      throw new Error('SID sample rate must be positive');
    }
    if (
      document.sid.registerCount !== 25 ||
      document.sid.voiceStride !== 7 ||
      document.sid.supportedControls.join(',') !== '0,4,16,21,65,128,129'
    ) {
      throw new Error('sound.json requires unsupported SID synthesis features');
    }
    this.registers = [...document.initialRegisters];
    this.dcDecay = Math.exp((-2 * Math.PI * 20) / sampleRate);
    this.reset();
  }

  write(register: number, value: number): void {
    const next = this.checkedValue(register, value);
    const voice = Math.floor(register / this.document.sid.voiceStride);
    const withinVoice = register % this.document.sid.voiceStride;
    if (voice < 3 && withinVoice === 4) {
      const current = this.registers[register] ?? 0;
      const gateWasOn = (current & 1) !== 0;
      const gateIsOn = (next & 1) !== 0;
      if (!gateWasOn && gateIsOn) {
        this.voices[voice]!.stage = 'attack';
      } else if (gateWasOn && !gateIsOn) {
        this.voices[voice]!.stage = 'release';
      }
    }
    this.registers[register] = next;
  }

  private checkedValue(register: number, value: number): number {
    if (!Number.isInteger(register) || register < 0 || register >= 25) {
      throw new Error(`unsupported SID register ${register}`);
    }
    const next = byte(value, `SID register ${register}`);
    const voice = Math.floor(register / this.document.sid.voiceStride);
    const withinVoice = register % this.document.sid.voiceStride;
    if (voice < 3 && withinVoice === 4) {
      if (!this.document.sid.supportedControls.includes(next)) {
        throw new Error(`unsupported SID control ${next}`);
      }
    }
    if (register >= 21 && next !== (register === 24 ? 15 : 0)) {
      throw new Error('unsupported SID filter or output configuration');
    }
    return next;
  }

  play(selector: number, voice: 1 | 2): void {
    const program = this.document.oneShots.find(
      item => item.selector === selector
    );
    if (program === undefined) {
      throw new Error(`sound.json has no SID program for selector ${selector}`);
    }
    const base = (voice - 1) * this.document.sid.voiceStride;
    this.write(base + 4, 0);
    this.write(base + 1, program.frequencyHigh);
    this.write(base + 5, program.attackDecay);
    this.write(base + 6, program.sustainRelease);
    this.write(base + 4, program.control);
  }

  reset(registers: readonly number[] = this.document.initialRegisters): void {
    if (registers.length !== this.document.sid.registerCount) {
      throw new Error('SID reset register count does not match sound.json');
    }
    this.registers = registers.map((value, index) =>
      this.checkedValue(index, value)
    );
    this.previousMix = 0;
    this.highPassed = 0;
    for (const [index, voice] of this.voices.entries()) {
      voice.envelope = 0;
      voice.noise = 0x7f_ff_ff;
      voice.phase = 0;
      voice.envelopeClock = 0;
      voice.stage =
        (this.registers[index * 7 + 4]! & 1) !== 0 ? 'attack' : 'release';
    }
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setVolume(volume: number): void {
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
      throw new Error('SID master volume must be an integer from 0 to 100');
    }
    this.volume = volume / 100;
  }

  render(length: number): Float32Array {
    const output = new Float32Array(length);
    if (this.suspended) {
      return output;
    }
    for (let sample = 0; sample < length; sample += 1) {
      let mixed = 0;
      for (let index = 0; index < 3; index += 1) {
        this.advanceEnvelope(index, this.registers[index * 7 + 4] ?? 0);
      }
      // Four sub-samples reduce harsh aliasing without running a full chip emulator.
      for (let sub = 0; sub < 4; sub += 1) {
        for (let index = 0; index < this.voices.length; index += 1) {
          const voice = this.voices[index]!;
          const base = index * this.document.sid.voiceStride;
          const control = this.registers[base + 4] ?? 0;
          const frequencyRegister =
            (this.registers[base] ?? 0) |
            ((this.registers[base + 1] ?? 0) << 8);
          const increment =
            (frequencyRegister * this.document.sid.clockHz) /
            PHASE_SCALE /
            (this.sampleRate * 4);
          const previous = voice.phase;
          const next = previous + increment;
          // The noise shift register clocks on accumulator bit 19's rising edge:
          // sixteen times per oscillator period, including while its gate is off.
          const edges =
            Math.floor(next * 16 + 0.5) - Math.floor(previous * 16 + 0.5);
          for (let edge = 0; edge < edges; edge += 1) {
            const bit = ((voice.noise >> 22) ^ (voice.noise >> 17)) & 1;
            voice.noise = ((voice.noise << 1) | bit) & 0x7f_ff_ff;
          }
          voice.phase = next % 1;
        }
        for (let index = 0; index < 3; index += 1) {
          mixed +=
            this.waveform(index, this.registers[index * 7 + 4] ?? 0) *
            this.voices[index]!.envelope;
        }
      }
      // Fixed chip-output calibration against the VICE probe corpus; user gain
      // remains a separate control after this mix.
      mixed *= 0.45 / 12;
      // Remove stationary pulse/DC output, including Benson's frequency-zero stop.
      this.highPassed =
        mixed - this.previousMix + this.dcDecay * this.highPassed;
      this.previousMix = mixed;
      output[sample] = this.muted ? 0 : this.highPassed * this.volume;
    }
    return output;
  }

  debugState(): {
    readonly registers: readonly number[];
    readonly voices: readonly {
      readonly envelope: number;
      readonly phase: number;
    }[];
  } {
    return {
      registers: [...this.registers],
      voices: this.voices.map(voice => ({
        envelope: voice.envelope,
        phase: voice.phase
      }))
    };
  }

  private advanceEnvelope(index: number, control: number): void {
    const state = this.voices[index]!;
    const base = index * this.document.sid.voiceStride;
    const attackDecay = this.registers[base + 5] ?? 0;
    const sustainRelease = this.registers[base + 6] ?? 0;
    if ((control & 1) === 0 && state.stage !== 'release') {
      state.stage = 'release';
    }
    const sustain = ((sustainRelease >> 4) & 0x0f) / 15;
    if (state.stage === 'sustain') {
      if (state.envelope > sustain) {
        state.stage = 'decay';
      } else {
        return;
      }
    }
    const rate =
      state.stage === 'attack'
        ? attackDecay >> 4
        : state.stage === 'decay'
          ? attackDecay & 15
          : sustainRelease & 15;
    state.envelopeClock += 1 / this.sampleRate;
    const interval = ATTACK_SECONDS[rate]! / 255;
    while (state.envelopeClock >= interval) {
      const level = Math.round(state.envelope * 255);
      const divider =
        state.stage === 'attack'
          ? 1
          : level > 93
            ? 1
            : level > 54
              ? 2
              : level > 26
                ? 4
                : level > 14
                  ? 8
                  : level > 6
                    ? 16
                    : 30;
      if (state.envelopeClock < interval * divider) {
        break;
      }
      state.envelopeClock -= interval * divider;
      if (state.stage === 'attack') {
        state.envelope = Math.min(255, level + 1) / 255;
        if (level + 1 >= 255) {
          state.stage = 'decay';
          state.envelopeClock = 0;
          break;
        }
      } else {
        const floor = state.stage === 'decay' ? sustain : 0;
        state.envelope = Math.max(floor, (level - 1) / 255);
        if (state.envelope <= floor) {
          if (state.stage === 'decay') {
            state.stage = 'sustain';
          }
          state.envelopeClock = 0;
          break;
        }
      }
    }
  }

  private waveform(index: number, control: number): number {
    const voice = this.voices[index]!;
    if (
      this.registers[index * 7] === 0 &&
      this.registers[index * 7 + 1] === 0
    ) {
      return 0;
    }
    if ((control & 0x80) !== 0) {
      let value = 0;
      for (const bit of NOISE_BITS) {
        value = (value << 1) | ((voice.noise >> bit) & 1);
      }
      return value / 127.5 - 1;
    }
    if ((control & 0x40) !== 0) {
      const base = index * this.document.sid.voiceStride;
      const width =
        (this.registers[base + 2] ?? 0) |
        (((this.registers[base + 3] ?? 0) & 0x0f) << 8);
      return voice.phase < width / 0x10_00 ? 1 : -1;
    }
    if ((control & 0x10) !== 0) {
      const triangle = 1 - 4 * Math.abs(voice.phase - 0.5);
      return (control & 4) !== 0 && this.voices[(index + 2) % 3]!.phase >= 0.5
        ? -triangle
        : triangle;
    }
    return 0;
  }
}
