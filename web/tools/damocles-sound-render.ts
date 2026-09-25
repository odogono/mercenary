import {
  DamoclesPsgDriver,
  type DamoclesRequest
} from '../src/damocles/psg.ts';
import { Ym2149 } from '../src/sound/ym2149.ts';
import { encodeWav } from './wav.ts';

/// Renders what the Damocles sound presenter plays for a timeline of driver requests to a mono
/// 48 kHz WAV, so the port can be put through the same analysis as a Working Authority
/// recording (#508, `research/damocles-st/scripts/lift-sound-probe.py analyse`).
///
///   bun tools/damocles-sound-render.ts <out.wav> [--vbl-hz 50] [--seconds 4]
///     [--timeline 0:door-start,33:door-stop,83:take,83:door-start,116:door-stop]
///
/// The default timeline is the State Office ride from G to 1 as the session asks for it: the
/// door shuts over 33 VBLs, the label steps 50 more, and the arrival opens the new door. Any
/// request the driver takes may appear (#514), so
/// `0:spell,300:splash,600:transporter,900:bump,1200:blast,1500:shot,1800:thud,2100:zap,2400:blown-up`
/// renders the programmes `sound-programme-probe.py`'s `arm-b` case recorded, 6 s apart.
/// `--message 40:TEXT` also shows a message on VBL 40, so its scroll-in's tone plays (#522).

const SAMPLE_RATE = 48_000;
const REQUESTS = new Set<string>([
  'blast',
  'blown-up',
  'bump',
  'channel-c-off',
  'descent-end',
  'descent-start',
  'descent-step',
  'door-start',
  'door-stop',
  'drop',
  'geiger-click',
  'hazard-alarm',
  'restore',
  'shot',
  'spell',
  'splash',
  'take',
  'thud',
  'transporter',
  'zap'
] satisfies DamoclesRequest[]);

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
    if (!REQUESTS.has(cue ?? '') || !Number.isInteger(Number(vbl))) {
      throw new Error(`Not a VBL:cue pair: ${entry}`);
    }
    return { cue: cue as DamoclesRequest, vbl: Number(vbl) };
  });

const message = ((): { readonly text: string; readonly vbl: number } | null => {
  const entry = argument('--message', '');
  if (entry === '') {
    return null;
  }
  const colon = entry.indexOf(':');
  const vbl = Number(entry.slice(0, colon));
  if (colon === -1 || !Number.isInteger(vbl)) {
    throw new Error(`Not a VBL:text pair: ${entry}`);
  }
  return { text: entry.slice(colon + 1), vbl };
})();

const chip = new Ym2149(SAMPLE_RATE);
const driver = new DamoclesPsgDriver();
// As the AudioWorklet does: the program's reset `$0508BC` before anything sounds.
driver.powerOn(chip);
const vbls = Math.ceil(seconds * vblHertz);
const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
let written = 0;
for (let vbl = 0; vbl < vbls; vbl += 1) {
  // A cue asked for during a frame lands before the VBL that follows it.
  for (const entry of timeline.filter(item => item.vbl === vbl)) {
    driver.request(entry.cue, chip);
  }
  if (message?.vbl === vbl) {
    driver.showMessage(message.text);
  }
  driver.vbl(chip);
  const until = Math.min(
    samples.length,
    Math.round(((vbl + 1) * SAMPLE_RATE) / vblHertz)
  );
  samples.set(chip.render(until - written), written);
  written = until;
}

await Bun.write(output, encodeWav(samples, SAMPLE_RATE));
process.stdout.write(
  `${output}: ${samples.length} samples at ${SAMPLE_RATE} Hz\n`
);
