import type { Catalogue } from '../catalogue/data.ts';
import {
  BLANK_DAMOCLES_ROW,
  DAMOCLES_ROW_CELLS,
  type DamoclesDisplay,
  type DamoclesMessageId
} from './display.ts';
import {
  initialScriptState,
  type Execution,
  type Presenting
} from './script.ts';
import type { Residence, ResidenceDeparture } from './session.ts';
import { SLOT_2_REVISION, SLOT_2_SCRIPT, type Step } from './slot2.ts';
import type { Pose } from './world.ts';

/// Version 3 replaced Capital Spaceport fields with the bound structure workspace.
///
/// Version 4 makes the record body-aware: the Pose names its Body, and identity pins every
/// presentation document by content rather than naming one Body's schema number. The
/// body-aware contract bumps once and once only (ADR 0044) -- #300's Carried Stack, display
/// and script state join schema 4 without a further bump.
export const DAMOCLES_SAVE_SCHEMA_VERSION = 4 as const;
export const DAMOCLES_DESTINATION = 'damocles' as const;

/// What a restore must match exactly before it may continue this game (ADR 0026).
///
/// `presentationSha256` covers every Damocles presentation document together, as one value.
/// A set of per-Body versions was rejected in the body-aware contract: it would make identity
/// vary by which Bodies the player had visited, so two saves of the same game would refuse
/// each other. It replaces `erisSchemaVersion`, which named one Body and pinned a schema
/// number rather than the bytes served (#344).
export interface DamoclesSaveIdentity {
  readonly catalogueProgramSha256: string;
  readonly destination: typeof DAMOCLES_DESTINATION;
  readonly presentationSha256: string;
  readonly title: typeof DAMOCLES_DESTINATION;
}

export interface BoundStructureSnapshot {
  readonly attachments: readonly {
    readonly openUnits: number;
    readonly slot: number;
  }[];
  readonly instanceId: string;
  readonly regionIndex: number | null;
}

export interface DamoclesSaveSnapshot {
  readonly carried: readonly string[];
  readonly elapsed: number;
  readonly frameAccumulator: number;
  readonly pose: Pose;
  readonly residence: readonly ResidenceDeparture[];
  readonly script: DamoclesSaveScript;
  readonly scrollCounter: number;
  readonly structure: BoundStructureSnapshot | null;
}

export interface DamoclesSaveScript {
  readonly counter: number;
  readonly display: DamoclesDisplay;
  readonly execution: Execution | null;
  readonly message: Presenting | null;
  readonly triggers: readonly {
    readonly armed: boolean;
    readonly index: number;
  }[];
}

export const initialDamoclesSaveScript = (): DamoclesSaveScript => {
  const script = initialScriptState();
  return {
    counter: script.counter,
    display: script.display,
    execution: script.execution,
    message: script.message,
    triggers: script.triggers.map(({ armed, index }) => ({ armed, index }))
  };
};

export interface DamoclesSaveRecord {
  readonly identity: DamoclesSaveIdentity;
  readonly savedAt: string;
  readonly schemaVersion: typeof DAMOCLES_SAVE_SCHEMA_VERSION;
  readonly snapshot: DamoclesSaveSnapshot;
  readonly where: string;
}

export const damoclesSaveIdentity = (
  catalogue: Catalogue,
  presentationSha256: string
): DamoclesSaveIdentity => ({
  catalogueProgramSha256: catalogue.source.programSha256,
  destination: DAMOCLES_DESTINATION,
  presentationSha256,
  title: DAMOCLES_DESTINATION
});

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const fail = (reason: string): never => {
  throw new Error(reason);
};

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be a record`);
  }
  return value as Record<string, unknown>;
};

const array = (value: unknown, path: string): unknown[] =>
  Array.isArray(value) ? value : fail(`${path} must be an array`);

const integer = (
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number =>
  Number.isInteger(value) &&
  (value as number) >= minimum &&
  (value as number) <= maximum
    ? (value as number)
    : fail(`${path} is outside its recovered bounds`);

const printableRow = (value: unknown, path: string): string =>
  typeof value === 'string' &&
  value.length === DAMOCLES_ROW_CELLS &&
  /^[ -~]+$/.test(value)
    ? value
    : fail(`${path} is not a 48-cell printable row`);

const messageIds = new Set<DamoclesMessageId>([
  'script2-inline-1',
  'script2-inline-2',
  'script2-inline-3',
  'system-string-50',
  'system-string-9'
]);

const messageId = (value: unknown, path: string): DamoclesMessageId =>
  typeof value === 'string' && messageIds.has(value as DamoclesMessageId)
    ? (value as DamoclesMessageId)
    : fail(`${path} names an unknown message`);

const poseOf = (value: unknown): Pose => {
  const pose = object(value, 'pose');
  const position = object(pose['position'], 'pose.position');
  if (typeof pose['body'] !== 'string' || pose['body'] === '') {
    return fail('pose names no Body');
  }
  if (
    !finite(pose['heading']) ||
    !finite(position['x']) ||
    !finite(position['y']) ||
    !finite(position['z'])
  ) {
    return fail('pose is not a finite heading and position');
  }
  return {
    body: pose['body'],
    heading: pose['heading'],
    position: { x: position['x'], y: position['y'], z: position['z'] }
  };
};

const identityOf = (value: unknown): DamoclesSaveIdentity => {
  const identity = object(value, 'identity');
  if (
    identity['destination'] !== DAMOCLES_DESTINATION ||
    identity['title'] !== DAMOCLES_DESTINATION ||
    typeof identity['catalogueProgramSha256'] !== 'string' ||
    identity['catalogueProgramSha256'] === '' ||
    typeof identity['presentationSha256'] !== 'string' ||
    identity['presentationSha256'] === ''
  ) {
    return fail('identity is not a Damocles Destination');
  }
  return {
    catalogueProgramSha256: identity['catalogueProgramSha256'],
    destination: DAMOCLES_DESTINATION,
    presentationSha256: identity['presentationSha256'],
    title: DAMOCLES_DESTINATION
  };
};

const residenceOf = (value: unknown): Residence => {
  const residence = object(value, 'snapshot.residence[].residence');
  const kind = residence['kind'];
  const drawClass = integer(
    residence['drawClass'],
    'residence.drawClass',
    0,
    255
  );
  if (kind === 'carried') {
    return { drawClass, kind };
  }
  const body = residence['body'];
  const position = poseOf({
    body: typeof body === 'string' ? body : '',
    heading: 0,
    position: residence['position']
  }).position;
  if (kind === 'surface') {
    return { body: body as string, drawClass, kind, position };
  }
  if (
    kind !== 'structure' ||
    typeof residence['parent'] !== 'string' ||
    residence['parent'] === ''
  ) {
    return fail('residence kind or parent is invalid');
  }
  return {
    body: body as string,
    drawClass,
    insertionGroup: integer(
      residence['insertionGroup'],
      'residence.insertionGroup',
      1,
      255
    ),
    kind,
    level: integer(residence['level'], 'residence.level', 0, 255),
    parent: residence['parent'],
    position
  };
};

const displayOf = (value: unknown): DamoclesDisplay => {
  const display = object(value, 'snapshot.script.display');
  if (display['kind'] === 'held') {
    return {
      cells: printableRow(display['cells'], 'snapshot.script.display.cells'),
      kind: 'held'
    };
  }
  if (display['kind'] !== 'scrolling') {
    return fail('script display kind is invalid');
  }
  const reveal = object(display['reveal'], 'snapshot.script.display.reveal');
  const pixels = integer(reveal['pixels'], 'display.reveal.pixels', 0, 280);
  if (pixels % 8 !== 0 || reveal['offset'] !== 0) {
    return fail('display Reveal is not at a commit boundary');
  }
  return {
    id: messageId(display['id'], 'snapshot.script.display.id'),
    kind: 'scrolling',
    reveal: {
      beneath: printableRow(reveal['beneath'], 'display.reveal.beneath'),
      offset: 0,
      pixels
    }
  };
};

const presentingOf = (value: unknown): Presenting | null => {
  if (value === null) {
    return null;
  }
  const message = object(value, 'snapshot.script.message');
  return {
    id: messageId(message['id'], 'snapshot.script.message.id'),
    remainingFrames: integer(
      message['remainingFrames'],
      'snapshot.script.message.remainingFrames',
      1,
      200
    )
  };
};

const steps = new Set<Step>([
  'announce-2',
  'announce-3',
  'call-delay',
  'poll-wait',
  'clear-busy'
]);

const executionOf = (value: unknown): Execution | null => {
  if (value === null) {
    return null;
  }
  const execution = object(value, 'snapshot.script.execution');
  if (
    execution['script'] !== SLOT_2_SCRIPT ||
    execution['revision'] !== SLOT_2_REVISION ||
    typeof execution['step'] !== 'string' ||
    !steps.has(execution['step'] as Step)
  ) {
    return fail('script execution identity, revision or step is incompatible');
  }
  const returnStack = array(
    execution['returnStack'],
    'snapshot.script.execution.returnStack'
  );
  if (
    returnStack.some(step => step !== 'idle' && step !== 'return-from-delay')
  ) {
    return fail('script return stack is unreachable');
  }
  return {
    returnStack: returnStack as Step[],
    revision: SLOT_2_REVISION,
    script: SLOT_2_SCRIPT,
    step: execution['step'] as Step
  };
};

const scriptOf = (value: unknown): DamoclesSaveScript => {
  const script = object(value, 'snapshot.script');
  const counter = integer(
    script['counter'],
    'snapshot.script.counter',
    0,
    65_535
  );
  const display = displayOf(script['display']);
  const execution = executionOf(script['execution']);
  const message = presentingOf(script['message']);
  const triggers: DamoclesSaveScript['triggers'] = array(
    script['triggers'],
    'snapshot.script.triggers'
  ).map(value => {
    const trigger = object(value, 'snapshot.script.triggers[]');
    if (typeof trigger['armed'] !== 'boolean') {
      return fail('script trigger armed state is invalid');
    }
    const index = integer(trigger['index'], 'script trigger index', 0, 255);
    return {
      armed: trigger['armed'],
      index
    };
  });
  if (
    new Set(triggers.map(trigger => trigger.index)).size !== triggers.length ||
    triggers.length !== 6 ||
    [2, 5, 6, 11, 20, 62].some(
      index => !triggers.some(trigger => trigger.index === index)
    )
  ) {
    return fail('script trigger table is incomplete or duplicated');
  }
  if (message !== null) {
    const elapsedFrames = 200 - message.remainingFrames;
    if (
      (elapsedFrames < 36 &&
        (display.kind !== 'scrolling' ||
          display.id !== message.id ||
          display.reveal.pixels !== 8 * elapsedFrames)) ||
      (elapsedFrames >= 36 && display.kind !== 'held')
    ) {
      return fail('message gate and display reveal disagree');
    }
  }
  if (
    message !== null &&
    display.kind === 'scrolling' &&
    (display.id === 'script2-inline-1' || display.id === 'system-string-9') &&
    display.reveal.beneath !== BLANK_DAMOCLES_ROW
  ) {
    return fail('display Reveal has the wrong predecessor');
  }
  if (execution !== null) {
    const expected = {
      'announce-2': 'script2-inline-1',
      'announce-3': 'script2-inline-2',
      'call-delay': 'script2-inline-3',
      'clear-busy': 'system-string-50',
      'poll-wait': null
    } as const;
    const expectedMessage = expected[execution.step as keyof typeof expected];
    const stack = execution.returnStack;
    if (
      expectedMessage === null
        ? message !== null ||
          counter >= 200 ||
          display.kind !== 'held' ||
          stack.length !== 2 ||
          stack[0] !== 'idle' ||
          stack[1] !== 'return-from-delay'
        : message?.id !== expectedMessage ||
          stack.length !== 1 ||
          stack[0] !== 'idle'
    ) {
      return fail('script execution is not at a reachable commit boundary');
    }
  } else if (message !== null && message.id !== 'system-string-9') {
    return fail('parked script can only present system-string-9');
  }
  if (
    execution === null &&
    message === null &&
    triggers.find(trigger => trigger.index === 2)!.armed &&
    (display.kind !== 'held' || display.cells !== BLANK_DAMOCLES_ROW)
  ) {
    return fail('parked script display is not blank');
  }
  return { counter, display, execution, message, triggers };
};

const validateResidence = (
  catalogue: Catalogue,
  carried: readonly string[],
  departures: readonly ResidenceDeparture[]
): void => {
  const key = catalogue.instances.find(
    instance => instance.id === 'object-slot-183'
  );
  if (key === undefined) {
    return fail('Catalogue has no playable limo key');
  }
  const handling = key.handling;
  if (handling === null) {
    return fail('Catalogue has no playable limo key handling');
  }
  if (
    carried.some(instance => instance !== key.id) ||
    departures.some(departure => departure.instance !== key.id)
  ) {
    fail('Carried Stack or Object Residence names an unplayed instance');
  }
  for (const departure of departures) {
    const residence = departure.residence;
    if (
      residence.kind === 'carried' &&
      residence.drawClass !== 0 &&
      residence.drawClass !== (handling.byte & 0x0f)
    ) {
      fail('carried residence contradicts the Catalogue');
    }
    if (
      residence.kind === 'surface' &&
      (residence.body !== key.association?.body || residence.drawClass !== 0)
    ) {
      fail('surface residence contradicts the Catalogue');
    }
    if (residence.kind === 'structure') {
      const parent = catalogue.instances.find(
        instance => instance.id === residence.parent
      );
      if (
        parent?.location?.body !== residence.body ||
        residence.body !== key.association?.body ||
        residence.level !== 0 ||
        residence.drawClass !== (handling.byte & 0x0f) ||
        !parent.associationGroups?.some(
          group => group.group === residence.insertionGroup
        )
      ) {
        fail('structure residence contradicts the Catalogue');
      }
    }
  }
};

export const encodeDamoclesSave = (record: DamoclesSaveRecord): string =>
  JSON.stringify(record);

/// Decode a Damocles Save or Session Resume, or throw the exact refusal.
///
/// Identity is exact: a Targ envelope, an older schema, or a Catalogue or presentation
/// mismatch cannot become play without a migration this version does not have.
export const decodeDamoclesSave = (
  encoded: string,
  expected: DamoclesSaveIdentity,
  catalogue?: Catalogue
): DamoclesSaveRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return fail('not JSON');
  }
  const record = object(parsed, 'save');
  if (record['schemaVersion'] !== DAMOCLES_SAVE_SCHEMA_VERSION) {
    return fail(
      `schema ${String(record['schemaVersion'])} is not Damocles Save ${DAMOCLES_SAVE_SCHEMA_VERSION}`
    );
  }
  if (typeof record['savedAt'] !== 'string' || record['savedAt'] === '') {
    return fail('savedAt is missing');
  }
  if (typeof record['where'] !== 'string' || record['where'] === '') {
    return fail('where is missing');
  }
  const identity = identityOf(record['identity']);
  if (
    identity.catalogueProgramSha256 !== expected.catalogueProgramSha256 ||
    identity.presentationSha256 !== expected.presentationSha256
  ) {
    return fail('payload identity does not match');
  }
  const snapshot = object(record['snapshot'], 'snapshot');
  if (!finite(snapshot['elapsed'])) {
    return fail('elapsed is not a finite number');
  }
  const carried = array(snapshot['carried'], 'snapshot.carried').map(value =>
    typeof value === 'string' && value !== ''
      ? value
      : fail('Carried Stack member is invalid')
  );
  if (carried.length > 10 || new Set(carried).size !== carried.length) {
    return fail('Carried Stack is over capacity or duplicated');
  }
  const frameAccumulator = snapshot['frameAccumulator'];
  if (
    !finite(frameAccumulator) ||
    frameAccumulator < 0 ||
    frameAccumulator >= 1
  ) {
    return fail('frameAccumulator is outside [0, 1)');
  }
  const residence: ResidenceDeparture[] = array(
    snapshot['residence'],
    'snapshot.residence'
  ).map(value => {
    const departure = object(value, 'snapshot.residence[]');
    if (
      typeof departure['instance'] !== 'string' ||
      departure['instance'] === ''
    ) {
      return fail('residence departure names no instance');
    }
    return {
      instance: departure['instance'],
      residence: residenceOf(departure['residence'])
    };
  });
  if (
    new Set(residence.map(item => item.instance)).size !== residence.length ||
    carried.some(
      instance =>
        residence.find(item => item.instance === instance)?.residence.kind !==
        'carried'
    ) ||
    residence.some(
      item =>
        item.residence.kind === 'carried' && !carried.includes(item.instance)
    )
  ) {
    return fail('Carried Stack and Object Residence disagree');
  }
  if (catalogue !== undefined) {
    validateResidence(catalogue, carried, residence);
  }
  const scrollCounter = integer(
    snapshot['scrollCounter'],
    'snapshot.scrollCounter',
    -16,
    16
  );
  const script = scriptOf(snapshot['script']);
  const trigger2 = script.triggers.find(trigger => trigger.index === 2)!;
  if (
    (trigger2.armed &&
      (carried.includes('object-slot-183') ||
        residence.some(item => item.instance === 'object-slot-183'))) ||
    (script.execution !== null && trigger2.armed) ||
    (script.message?.id === 'system-string-9' && trigger2.armed)
  ) {
    return fail('trigger 2 contradicts the limo-key Session State');
  }
  let structure: BoundStructureSnapshot | null = null;
  if (snapshot['structure'] !== null) {
    const bound = object(snapshot['structure'], 'snapshot.structure');
    const instanceId = bound['instanceId'];
    const regionIndex = bound['regionIndex'];
    if (
      typeof instanceId !== 'string' ||
      instanceId === '' ||
      (regionIndex !== null &&
        (!Number.isInteger(regionIndex) ||
          (regionIndex as number) < 0 ||
          (regionIndex as number) >= 256)) ||
      !Array.isArray(bound['attachments'])
    ) {
      return fail('bound structure state is outside its recovered bounds');
    }
    const attachments = bound['attachments'].map(value => {
      const attachment = object(value, 'snapshot.structure.attachments[]');
      const slot = attachment['slot'];
      const openUnits = attachment['openUnits'];
      if (
        !Number.isInteger(slot) ||
        (slot as number) <= 0 ||
        (slot as number) > 0x03_fc ||
        (slot as number) % 4 !== 0 ||
        !finite(openUnits) ||
        openUnits < 0 ||
        openUnits > 32_767
      ) {
        return fail('attachment state is outside its recovered bounds');
      }
      return { openUnits, slot: slot as number };
    });
    if (
      new Set(attachments.map(item => item.slot)).size !== attachments.length
    ) {
      return fail('attachment slots are duplicated');
    }
    structure = {
      attachments,
      instanceId,
      regionIndex: regionIndex as number | null
    };
  }
  return {
    identity,
    savedAt: record['savedAt'],
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot: {
      carried,
      elapsed: snapshot['elapsed'],
      frameAccumulator,
      pose: poseOf(snapshot['pose']),
      residence,
      script,
      scrollCounter,
      structure
    },
    where: record['where']
  };
};

export const damoclesWhere = (cell: {
  readonly x: number;
  readonly z: number;
}): string =>
  `ERIS ${String(cell.x).padStart(2, '0')}-${String(cell.z).padStart(2, '0')}`;
