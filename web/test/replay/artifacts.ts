import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { Bundle } from '../../src/payload/documents.ts';
import { load } from '../../src/payload/load.ts';
import type { Trace, TraceObject } from '../../src/trace/index.ts';
import { describeDifference, firstDifference } from './compare.ts';

/// Finding the two things a Replay Gate needs.
///
/// The Data Payload and the Golden Traces are both derived from the Reference Build and both
/// tracked (ADR 0029), so a gate finds them in any checkout. They live at the repository root,
/// which is found by walking up from this file exactly as `PayloadLocator` and
/// `TraceScenarioLocator` walk up from the working directory — same rule, because two discovery
/// rules for files sitting beside each other would be a trap.
///
/// A missing artifact **throws**. It does not skip. A module without a passing replay is not
/// ported, and a gate that quietly passes when its evidence is absent is worse than no gate:
/// it reports the one thing that cannot be true.

const MARKER = 'trace-scenarios.json';

const findRepositoryRoot = (): string => {
  let directory = import.meta.dir;
  for (;;) {
    if (existsSync(join(directory, MARKER))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        `no ${MARKER} found above ${import.meta.dir}, so the repository root is unknown`
      );
    }
    directory = parent;
  }
};

export const repositoryRoot = findRepositoryRoot();

/// The payload directory, honouring the override the frozen Trace Oracle reads.
export const payloadDirectory = (): string => {
  const override = process.env['MERCENARY_PAYLOAD'];
  if (override !== undefined && override !== '') {
    return resolve(override);
  }
  return join(repositoryRoot, 'payload');
};

export const tracesDirectory = (): string => join(repositoryRoot, 'traces');

const EMIT_HINT =
  'regenerate it with --emit-traces from the frozen trace-oracle-last-good tag; ' +
  'see web/README.md\n' +
  '(Golden Traces are tracked at the repository root, so an absent one means an ' +
  'incomplete checkout rather than work to be done — ADR 0029)';

/// One Golden Trace's bytes, or a failure that says what to run.
export const readTraceText = async (
  emitter: string,
  id: string
): Promise<string> => {
  const path = join(tracesDirectory(), emitter, `${id}.jsonl`);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`no Golden Trace at ${path}\n${EMIT_HINT}`);
  }
  return await file.text();
};

/// One payload document's bytes, or a failure that says what to run.
export const readPayloadFile = async (name: string): Promise<string> => {
  const path = join(payloadDirectory(), name);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(
      `no ${name} in ${payloadDirectory()}\n` +
        'the Data Payload is tracked, so restore it with Git; ' +
        'a re-export is: cd lab && ... payload export'
    );
  }
  return await file.text();
};

/// The Data Payload as a gate reads it: absence is not failure.
///
/// Five of the ten documents are optional, so a missing file is not a failure. This flattens a
/// genuine read error into absence as well, which is the right trade for a gate — the documents
/// every gate asserts on are required, so a lost one fails downstream as a missing document
/// rather than passing quietly.
///
/// Read once for the whole run. Seven gates ask for it at import time, and re-reading eight
/// hundred kilobytes and re-running every validator six more times measures — while the payload
/// cannot have changed, and `expectRecordedPayload` already makes every gate assert it graded
/// against the same extraction. The promise is cached rather than the value so that concurrent
/// callers share one read instead of racing to start their own.
let payload: Promise<Bundle> | undefined;

export const loadPayload = (): Promise<Bundle> => {
  payload ??= load(async name => {
    try {
      return await readPayloadFile(name);
    } catch {
      return undefined;
    }
  });
  return payload;
};

/// Assert that the payload on disk is the one a trace was recorded from.
///
/// Every gate does this before it compares anything, because otherwise each divergence has two
/// possible explanations — a misported module, or a payload that has moved under it — and this
/// rules one of them out in a line. The Oracle records the payload's own provenance in each
/// trace header verbatim.
export const expectRecordedPayload = (trace: Trace, bundle: Bundle): void => {
  const recorded = trace.header['payload'] as TraceObject;
  const difference = firstDifference(
    {
      decoderVersion: recorded['decoderVersion']!,
      schemaVersion: recorded['schemaVersion']!,
      sourceCoreDigest: recorded['sourceCoreDigest']!,
      sourceDatasetId: recorded['sourceDatasetId']!
    },
    {
      decoderVersion: bundle.manifest.decoderVersion,
      schemaVersion: bundle.manifest.schemaVersion,
      sourceCoreDigest: bundle.manifest.sourceCoreDigest,
      sourceDatasetId: bundle.manifest.sourceDatasetId
    }
  );
  if (difference !== null) {
    throw new Error(
      `the payload in ${payloadDirectory()} is not the one ` +
        `${trace.emitter}/${trace.id} was recorded from — ` +
        `${describeDifference(difference)}\n${EMIT_HINT}`
    );
  }
};
