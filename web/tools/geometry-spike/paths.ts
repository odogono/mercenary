/// Where the #671 spike reads and writes, and how it reads a geometry file of either candidate.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { GeometryAsset, Sidecar } from '../../src/geometry/contract.ts';
import {
  candidateOf,
  decodeCandidate
} from '../../src/geometrySpike/adapter.ts';

const findRoot = (): string => {
  let directory = import.meta.dir;
  while (!existsSync(join(directory, 'trace-scenarios.json'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error('could not find the repository root');
    }
    directory = parent;
  }
  return directory;
};

export const ROOT = findRoot();
export const SPIKE = join(ROOT, 'research/blender-geometry-spike');
export const OUT = join(SPIKE, 'out');
export const ASSETS = join(OUT, 'assets');

export const readGeometry = (path: string): GeometryAsset =>
  decodeCandidate(candidateOf(path), new Uint8Array(readFileSync(path)));

export const readSidecar = (path: string): Sidecar =>
  JSON.parse(readFileSync(path, 'utf8')) as Sidecar;

/// Tool output: reports to stdout, problems to stderr.
export const say = (text: string) => process.stdout.write(`${text}\n`);
export const complain = (text: string) => process.stderr.write(`${text}\n`);
