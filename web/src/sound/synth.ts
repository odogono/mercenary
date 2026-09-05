import type { SoundDocument } from '../payload/documents.ts';

const PHASE_SCALE = 0x1_00_00_00;
const ATTACK_SECONDS = [
  0.002, 0.008, 0.016, 0.024, 0.038, 0.056, 0.068, 0.08, 0.1, 0.25, 0.5, 0.8, 1,
  3, 5, 8
] as const;
const DECAY_RELEASE_SECONDS = [
  0.006, 0.024, 0.048, 0.072, 0.114, 0.168, 0.204, 0.24, 0.3, 0.75, 1.5, 2.4, 3,
  9, 15, 24
] as const;

type EnvelopeStage = 'attack' | 'decay' | 'sustain' | 'release';

interface VoiceState {
  envelope: number;
  noise: number;
  phase: number;
  stage: EnvelopeStage;
}

const initialVoice = (): VoiceState => ({
  envelope: 0,
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
/// in the configured Reference Build: triangle, pulse, noise, oscillator sync,
/// gate, and the three ADSR envelopes.
export class SidSynth {
  private readonly voices: VoiceState[] = Array.from(
    { length: 3 },
    initialVoice
  );
  private registers: number[];
  private muted = false;
  private suspended = false;
  private volume = 1;

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
      document.sid.supportedControls.join(',') !== '0,21,65,128,129'
    ) {
      throw new Error('sound.json requires unsupported SID synthesis features');
    }
    this.registers = [...document.initialRegisters];
  }

  write(register: number, value: number): void {
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
      const current = this.registers[register] ?? 0;
      const gateWasOn = (current & 1) !== 0;
      const gateIsOn = (next & 1) !== 0;
      if (!gateWasOn && gateIsOn) {
        this.voices[voice]!.envelope = 0;
        this.voices[voice]!.stage = 'attack';
      } else if (gateWasOn && !gateIsOn) {
        this.voices[voice]!.stage = 'release';
      }
    }
    this.registers[register] = next;
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
      byte(value, `SID register ${index}`)
    );
    for (const voice of this.voices) {
      voice.envelope = 0;
      voice.noise = 0x7f_ff_ff;
      voice.phase = 0;
      voice.stage = 'release';
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
      const wrapped: boolean[] = [];
      for (let index = 0; index < this.voices.length; index += 1) {
        const voice = this.voices[index]!;
        const base = index * this.document.sid.voiceStride;
        const control = this.registers[base + 4] ?? 0;
        const frequencyRegister =
          (this.registers[base] ?? 0) | ((this.registers[base + 1] ?? 0) << 8);
        const increment =
          (frequencyRegister * this.document.sid.clockHz) /
          PHASE_SCALE /
          this.sampleRate;
        const previous = voice.phase;
        voice.phase = (voice.phase + increment) % 1;
        const didWrap = voice.phase < previous;
        wrapped.push(didWrap);
        if ((control & 0x02) !== 0 && index > 0 && wrapped[index - 1]) {
          voice.phase = 0;
        }
        this.advanceEnvelope(index, control);
        mixed += this.waveform(index, control, didWrap) * voice.envelope;
      }
      output[sample] = this.muted ? 0 : (mixed / 3) * this.volume;
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
    switch (state.stage) {
      case 'attack':
        state.envelope = Math.min(
          1,
          state.envelope +
            1 / (ATTACK_SECONDS[attackDecay >> 4]! * this.sampleRate)
        );
        if (state.envelope >= 1) {
          state.stage = 'decay';
        }
        break;
      case 'decay':
        state.envelope = Math.max(
          sustain,
          state.envelope -
            1 / (DECAY_RELEASE_SECONDS[attackDecay & 0x0f]! * this.sampleRate)
        );
        if (state.envelope <= sustain) {
          state.stage = 'sustain';
        }
        break;
      case 'sustain':
        state.envelope = sustain;
        break;
      case 'release':
        state.envelope = Math.max(
          0,
          state.envelope -
            1 /
              (DECAY_RELEASE_SECONDS[sustainRelease & 0x0f]! * this.sampleRate)
        );
        break;
    }
  }

  private waveform(index: number, control: number, wrapped: boolean): number {
    const voice = this.voices[index]!;
    if ((control & 0x80) !== 0) {
      if (wrapped) {
        const bit = ((voice.noise >> 22) ^ (voice.noise >> 17)) & 1;
        voice.noise = ((voice.noise << 1) | bit) & 0x7f_ff_ff;
      }
      return (voice.noise & 0xff_ff) / 0x7f_ff - 1;
    }
    if ((control & 0x40) !== 0) {
      const base = index * this.document.sid.voiceStride;
      const width =
        (this.registers[base + 2] ?? 0) |
        (((this.registers[base + 3] ?? 0) & 0x0f) << 8);
      return voice.phase < width / 0x10_00 ? 1 : -1;
    }
    if ((control & 0x10) !== 0) {
      return 1 - 4 * Math.abs(voice.phase - 0.5);
    }
    return 0;
  }
}
