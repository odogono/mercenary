import { DamoclesPsgDriver, type DamoclesCue } from '../src/damocles/psg.ts';
import { Ym2149 } from '../src/sound/ym2149.ts';

/// Renders what the Damocles sound presenter plays for a timeline of Sound Cues to a mono
/// 48 kHz WAV, so the port can be put through the same analysis as a Working Authority
/// recording (#508, `research/damocles-st/scripts/lift-sound-probe.py analyse`).
///
///   bun tools/damocles-sound-render.ts <out.wav> [--vbl-hz 50] [--seconds 4]
///     [--timeline 0:door-start,33:door-stop,83:take,83:door-start,116:door-stop]
///
/// The default timeline is the State Office ride from G to 1 as the session asks for it: the
/// door shuts over 33 VBLs, the label steps 50 more, and the arrival opens the new door.

const SAMPLE_RATE = 48_000;
const CUES = new Set<string>(['door-start', 'door-stop', 'drop', 'take']);

const argument = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
};

const output = process.argv[2];
if (output === undefined || output.startsWith('--')) {
  throw new Error('Name the WAV to write');
}
const vblHertz = Number(argument('--vbl-hz', '50'));
const seconds = Number(argument('--seconds', '4'));
const timeline = argument(
  '--timeline',
  '0:door-start,33:door-stop,83:take,83:door-start,116:door-stop'
)
  .split(',')
  .map(entry => {
    const [vbl, cue] = entry.split(':');
    if (!CUES.has(cue ?? '') || !Number.isInteger(Number(vbl))) {
      throw new Error(`Not a VBL:cue pair: ${entry}`);
    }
    return { cue: cue as DamoclesCue, vbl: Number(vbl) };
  });

const chip = new Ym2149(SAMPLE_RATE);
const driver = new DamoclesPsgDriver();
const vbls = Math.ceil(seconds * vblHertz);
const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
let written = 0;
for (let vbl = 0; vbl < vbls; vbl += 1) {
  // A cue asked for during a frame lands before the VBL that follows it.
  for (const entry of timeline.filter(item => item.vbl === vbl)) {
    driver.request(entry.cue, chip);
  }
  driver.vbl(chip);
  const until = Math.min(
    samples.length,
    Math.round(((vbl + 1) * SAMPLE_RATE) / vblHertz)
  );
  samples.set(chip.render(until - written), written);
  written = until;
}

const bytes = new Uint8Array(44 + samples.length * 2);
const view = new DataView(bytes.buffer);
const label = (offset: number, text: string): void => {
  bytes.set(new TextEncoder().encode(text), offset);
};
label(0, 'RIFF');
view.setUint32(4, bytes.length - 8, true);
label(8, 'WAVEfmt ');
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, 1, true);
view.setUint32(24, SAMPLE_RATE, true);
view.setUint32(28, SAMPLE_RATE * 2, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
label(36, 'data');
view.setUint32(40, samples.length * 2, true);
for (const [index, sample] of samples.entries()) {
  view.setInt16(
    44 + index * 2,
    Math.round(Math.max(-1, Math.min(1, sample)) * 32_767),
    true
  );
}
await Bun.write(output, bytes);
process.stdout.write(
  `${output}: ${samples.length} samples at ${SAMPLE_RATE} Hz\n`
);
