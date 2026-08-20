import { fetchReader, load } from '../src/payload/load.ts';
import { Renderer } from '../src/shell/frame.ts';
import { createWalkabout, requiredSettings } from '../src/shell/session.ts';
import {
  foldStates,
  parseTrace,
  type TraceObject
} from '../src/trace/index.ts';
import { applySessionTraceCommand } from '../src/trace/session.ts';
import { expectIdentical } from '../test/replay/compare.ts';
import {
  eventValue,
  intentFromRecord,
  snapshotValue
} from '../test/replay/sessionReplay.ts';

const VIEWPORT = { height: 800, width: 1280 } as const;
const TRACE_ID = 'opening-loop';

const requiredText = async (pathname: string): Promise<string> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  return await response.text();
};

const surface = document.getElementById('trace-surface')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;
const status = document.getElementById('status')!;

try {
  const [bundle, settingsText, traceText] = await Promise.all([
    load(fetchReader(new URL('/payload/', location.href).href)),
    requiredText('/settings.json'),
    requiredText('/__e2e__/session/opening-loop.jsonl')
  ]);
  const trace = parseTrace(traceText, 'session', TRACE_ID);
  const expected = foldStates(trace);
  const { session, world } = createWalkabout(
    bundle,
    requiredSettings(settingsText)
  );
  const renderer = new Renderer(canvas);
  const milestones = ['initial'];
  const scenario = trace.header['scenario'] as TraceObject;
  const walkTo = scenario['walkTo'];
  const dt = trace.header['dt'] as number;
  let reached = typeof walkTo !== 'number';
  let nextStep = 0;

  expectIdentical(
    trace.header['initial'],
    snapshotValue(session.snapshot),
    'initial'
  );
  if (
    session.snapshot.location.kind !== 'surface' ||
    session.snapshot.occupancy.kind !== 'onFoot' ||
    session.snapshot.indoor !== undefined
  ) {
    throw new Error('opening-loop replay did not start on the outdoor surface');
  }
  renderer.draw(world, session.snapshot, VIEWPORT);

  for (const [index, record] of trace.records.entries()) {
    expectIdentical(record['step'], nextStep, `record ${index} step`);
    const command = record['command'];
    if (command !== undefined) {
      applySessionTraceCommand(session, command);
      continue;
    }

    if (typeof walkTo === 'number' && !reached) {
      const { outcome } = session.reach('board', walkTo);
      if (outcome.kind !== 'nothingInReach') {
        reached = true;
      }
    }

    session.intent = intentFromRecord(record['input'] as TraceObject);
    const { events, snapshot } = session.advance(dt);
    expectIdentical(record['elapsed'], snapshot.elapsed, `elapsed ${nextStep}`);
    expectIdentical(
      expected[index],
      snapshotValue(snapshot),
      `step ${nextStep}`
    );
    expectIdentical(
      record['events'],
      events.length === 0 ? undefined : events.map(eventValue),
      `events ${nextStep}`
    );

    if (
      snapshot.mode === 'flying' &&
      snapshot.occupancy.kind === 'aboard' &&
      snapshot.occupancy.slot === 1 &&
      !milestones.includes('airborne')
    ) {
      renderer.draw(world, snapshot, VIEWPORT);
      milestones.push('airborne');
    }
    if (
      events.some(
        event =>
          typeof event === 'object' &&
          'touchdown' in event &&
          event.touchdown === 'landed'
      ) &&
      !milestones.includes('touchdown')
    ) {
      renderer.draw(world, snapshot, VIEWPORT);
      milestones.push('touchdown');
    }
    if (snapshot.location.kind === 'room' && snapshot.location.id === 1) {
      renderer.draw(world, snapshot, VIEWPORT);
      if (!milestones.includes('room-1')) {
        milestones.push('room-1');
      }
    }
    nextStep += 1;
  }

  const final = session.snapshot;
  if (
    final.location.kind !== 'room' ||
    final.location.id !== 1 ||
    final.indoor === undefined
  ) {
    throw new Error('opening-loop replay did not finish in Room 1 indoors');
  }
  if (milestones.join(',') !== 'initial,airborne,touchdown,room-1') {
    throw new Error(`opening-loop milestones were ${milestones.join(',')}`);
  }

  surface.dataset['milestones'] = milestones.join(',');
  surface.dataset['credits'] = String(final.credits);
  const dart = final.residence.get(1);
  if (dart?.kind !== 'surface' || dart.at === undefined) {
    throw new Error('Dart slot 1 was not parked on the surface');
  }
  surface.dataset['grid'] =
    `${String(Math.trunc(dart.at.x / world.cellSize)).padStart(2, '0')}:` +
    String(Math.trunc(dart.at.z / world.cellSize)).padStart(2, '0');
  surface.dataset['location'] = 'room-1';
  surface.dataset['occupancy'] =
    final.occupancy.kind === 'onFoot' ? 'on-foot' : 'aboard';
  canvas.addEventListener('trace-redraw', () => {
    renderer.draw(world, final, VIEWPORT);
  });
  status.textContent = `${trace.records.length.toLocaleString('en-GB')} records replayed bit-for-bit`;
  surface.dataset['state'] = 'complete';
} catch (error) {
  surface.dataset['state'] = 'failed';
  status.textContent = String(error);
  console.error(error);
}
