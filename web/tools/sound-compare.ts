import { createHash } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { load } from '../src/payload/load.ts';
import { renderSidSequence, type SidWrite } from '../src/sound/sequence.ts';
import { decodeWav, encodeWav } from './wav.ts';

const root = resolve(import.meta.dir, '../..');
const work = await realpath(join(root, 'research/c64-reference-build/work'));
const run = await realpath(process.argv[2] ?? '');
const inside = relative(work, run);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
  throw new Error('Select a captured run under lab work/');
}
const manifest = await Bun.file(join(run, 'manifest.json')).json();
if (manifest.mode !== 'probe' || !Array.isArray(manifest.probes)) {
  throw new Error('Expected a native sound probe manifest');
}
const bundle = await load(async name =>
  Bun.file(join(root, 'payload', name)).text()
);
const output = join(run, `comparison-${Date.now()}`);
await mkdir(output);

const rms = (samples: Float32Array, from: number, to: number): number => {
  const segment = samples.subarray(
    Math.round(from * 48_000),
    Math.round(to * 48_000)
  );
  return Math.sqrt(
    segment.reduce((sum, value) => sum + value * value, 0) / segment.length
  );
};
const rows: string[] = [];
const metrics: unknown[] = [];
for (const probe of manifest.probes) {
  if (!/^[\da-z-]+$/.test(probe.name)) {
    throw new Error('Invalid probe name');
  }
  const verified = async (name: string): Promise<Uint8Array> => {
    const bytes = new Uint8Array(
      await Bun.file(join(run, probe.name, name)).arrayBuffer()
    );
    const expected = probe.artifacts.find(
      (artifact: { path: string }) => artifact.path === name
    );
    if (createHash('sha256').update(bytes).digest('hex') !== expected?.sha256) {
      throw new Error(`Capture hash mismatch: ${probe.name}/${name}`);
    }
    return bytes;
  };
  const writes = JSON.parse(
    new TextDecoder().decode(await verified('sid-events.json'))
  ) as SidWrite[];
  const reference = decodeWav(await verified('audio.wav'));
  const rendered = renderSidSequence(bundle.sound, writes, reference.length);
  await Bun.write(
    join(output, `${probe.name}-reference.wav`),
    await verified('audition.wav')
  );
  await Bun.write(
    join(output, `${probe.name}-browser.wav`),
    encodeWav(rendered.subarray(19_200), 48_000)
  );
  metrics.push({
    name: probe.name,
    windows: [0.55, 0.8, 1.1].map(from => ({
      browserRms: rms(rendered, from, from + 0.1),
      from,
      referenceRms: rms(reference, from, from + 0.1)
    }))
  });
  rows.push(
    `- ${probe.name}: [Reference](${probe.name}-reference.wav) · [Browser](${probe.name}-browser.wav)`
  );
}
await Bun.write(join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
await Bun.write(
  join(output, 'LISTEN.md'),
  '# Reference / browser comparisons\n\nIdentical captured register sequences; first 400 ms omitted from both. No per-clip loudness normalization.\n\n' +
    rows.join('\n') +
    '\n'
);
process.stdout.write(join(output, 'LISTEN.md') + '\n');
