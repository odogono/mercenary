import type { Catalogue } from '../catalogue/data.ts';
import {
  DAMOCLES_ROW_CELLS,
  effectiveMessageRow,
  type DamoclesDisplay,
  type DamoclesMessageId
} from './display.ts';
import { admittedPoses, type ArrivalPoses } from './poses.ts';
import {
  validStructureResidence,
  type PlacedResidence,
  type Residence,
  type ResidenceDeparture
} from './residence.ts';
import {
  initialScriptState,
  type Execution,
  type Frame,
  type Presenting
} from './script.ts';
import {
  ORDINARY_DISPLAY_FRAMES,
  SCRIPTS,
  SCRIPT_FOR_TRIGGER,
  TRIGGER_FOR_RESIDENT,
  WAIT_FROM_DOCUMENT,
  isScriptId,
  type ScriptId,
  type Step
} from './scripts.ts';
import { presentedText, type DamoclesStrings } from './strings.ts';
import type { Pose } from './world.ts';

/// Version 3 replaced Capital Spaceport fields with the bound structure workspace.
///
/// Version 4 makes the record body-aware: the Pose names its Body, and identity pins every
/// presentation document by content rather than naming one Body's schema number. #300's
/// Carried Stack, display and script state join schema 4 without a further bump.
///
/// Version 5 carries the body-aware contract's own Session State -- `briefcaseStore`, the
/// pending Drop, and an Object Residence's `placementClass`, which is the recovered
/// Association A byte 3 rather than the handling byte's low nibble that version 4 stored.
/// There is no migration: a schema-4 record's classes are not schema-5 classes, so it is
/// refused whole (ADR 0044).
///
/// Version 6 carries Occupancy: the instance the player is aboard, whose Object Residence is
/// `occupied` (#417). A schema-5 record cannot say whether its player was aboard, so it is
/// refused whole rather than defaulted to on foot.
///
/// Version 7 carries the bound structure's Floor (#474). A schema-6 record cannot say which
/// Floor its player stood on, and a Floor is never derived from the Pose's height, so it is
/// refused whole rather than defaulted to Floor 0.
///
/// Version 8 carries a Damocles Lift ride in progress and the doorway `$7AE6` names, whose
/// door the next ride pins (#476). A schema-7 record cannot say which doorway its player last
/// crossed, so it is refused whole rather than defaulted to none.
export const DAMOCLES_SAVE_SCHEMA_VERSION = 8 as const;
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
  /// `$7AE6`: the attachment slot of the last doorway region the region walk accepted in this
  /// structure, or null before one has been crossed. A lift ride pins that slot's door shut.
  readonly doorway: number | null;
  /// The Floor the player stands on, 0 to 10. The attachments and region are the structure's
  /// that this Floor binds, so a restore binds the Floor before it checks them.
  readonly floor: number;
  readonly instanceId: string;
  readonly regionIndex: number | null;
  /// A Damocles Lift ride in progress, or null when none is pending (`$788A` = `$FFFF`).
  readonly ride: LiftRideSnapshot | null;
}

/// A Damocles Lift ride between admission and arrival (docs/research/damocles-lift-ride.md).
/// The region stays frozen for the whole ride, so the player is still in the lift it began in.
export interface LiftRideSnapshot {
  /// `$788E`: ticks until the next step, 1 to 25. It runs only while the pinned door is shut.
  readonly countdown: number;
  /// `$788A`: the Floor asked for. A later admitted key replaces it.
  readonly destination: number;
  /// `$7AC4`: the Floor the Floor Label shows, stepped one Floor at a time along B, G, 1 … 9.
  readonly label: number;
}

/// `$788C`: the lift's step period in ticks, a constant 25.
export const LIFT_STEP_TICKS = 25;

/// The highest Floor: the Floor Table's level 10, which the lift labels `B`.
export const HIGHEST_FLOOR = 10;

export interface DamoclesSaveSnapshot {
  // Both continuation fields may be omitted together and are then normalized to empty;
  // partial omission is invalid. Since the schema-5 bump no shipped build writes a record
  // that omits them, so this leniency is now unreachable rather than load-bearing.
  readonly briefcaseStore: readonly string[];
  readonly carried: readonly string[];
  readonly elapsed: number;
  readonly frameAccumulator: number;
  readonly occupancy: DamoclesSaveOccupancy;
  readonly pendingBriefcaseDrop: {
    readonly head: string;
    readonly residence: PlacedResidence;
  } | null;
  readonly pose: Pose;
  readonly residence: readonly ResidenceDeparture[];
  readonly script: DamoclesSaveScript;
  readonly scrollCounter: number;
  readonly structure: BoundStructureSnapshot | null;
}

/// What the player is inside, as the session's own Occupancy says it. Aboard, the Pose is the
/// seated view and the occupied instance's Object Residence departure is `occupied`.
export type DamoclesSaveOccupancy =
  | { readonly kind: 'onFoot' }
  | { readonly instance: string; readonly kind: 'aboard' };

export interface DamoclesSaveScript {
  readonly counter: number;
  readonly display: DamoclesDisplay;
  /// Bank word `$070102`, which the shared epilogue moves and restores.
  readonly displayDuration: number;
  readonly execution: Execution | null;
  readonly message: Presenting | null;
  /// `$7A88`, the one queued trigger index.
  readonly pending: number | null;
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
    displayDuration: script.displayDuration,
    execution: script.execution,
    message: script.message,
    pending: script.pending,
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

/// Every id a Damocles Script or a system refusal can present. The eleven inline records the
/// five further responses use are already extracted into `payload/damocles/strings.json`.
const messageIds = new Set<DamoclesMessageId>([
  'script11-inline-1',
  'script11-inline-2',
  'script2-inline-1',
  'script2-inline-2',
  'script2-inline-3',
  'script20-inline-1',
  'script5-inline-1',
  'script5-inline-2',
  'script5-inline-3',
  'script6-inline-1',
  'script6-inline-2',
  'script62-inline-1',
  'script62-inline-2',
  'script62-inline-3',
  'system-string-1',
  'system-string-2',
  'system-string-22',
  'system-string-3',
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
    // A Save carries no pitch: nothing in play moves the view off level, so a restored Pose is
    // level and a Save written before #394 restores identically to one written after it.
    // Boarding keeps the on-foot pitch and nothing aboard moves, so a seated view is level too.
    // Driving is what would pitch the view, and saving that is the driving map's to decide.
    pitch: 0,
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

/// A saved Residence is carried, occupied or placed. An occupied one is only admissible where
/// Occupancy names its instance, which the snapshot decides rather than this.
const residenceOf = (value: unknown): Residence => {
  const residence = object(value, 'snapshot.residence[].residence');
  const kind = residence['kind'];
  const placementClass = integer(
    residence['placementClass'],
    'residence.placementClass',
    0,
    255
  );
  if (kind === 'carried' || kind === 'occupied') {
    return { kind, placementClass };
  }
  const body = residence['body'];
  const position = poseOf({
    body: typeof body === 'string' ? body : '',
    heading: 0,
    pitch: 0,
    position: residence['position']
  }).position;
  if (kind === 'surface') {
    return { body: body as string, kind, placementClass, position };
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
    insertionGroup: integer(
      residence['insertionGroup'],
      'residence.insertionGroup',
      1,
      255
    ),
    kind,
    level: integer(residence['level'], 'residence.level', 0, 255),
    parent: residence['parent'],
    placementClass,
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

/// A presenting message counts down from the duration it started with, which is the bank word
/// the save records: the shared epilogue's clearing line starts at 50, not 200.
const presentingOf = (
  value: unknown,
  displayDuration: number
): Presenting | null => {
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
      displayDuration
    )
  };
};

/// The six pickup trigger indices the object-to-trigger table at `$0543EC` names.
const PICKUP_TRIGGERS: readonly number[] = [2, 5, 6, 11, 20, 62];

/// A step is an index into a script's recovered operation list, and a suspended execution may
/// only name a step the interpreter can actually stop on. `runToBlock` returns in exactly two
/// places: immediately after a `message` op, while that message presents, and *on* a `poll-wait`
/// op, while its counter is below the threshold.
const blockingStep = (script: ScriptId, step: Step): boolean => {
  const ops = SCRIPTS[script].ops;
  if (!Number.isInteger(step) || step < 0 || step > ops.length) {
    return false;
  }
  // A third boundary exists only as an outer frame: a script that has cleared the busy flag and
  // not yet returned, which is where a queued response interrupts it.
  return (
    ops[step - 1]?.kind === 'message' ||
    ops[step]?.kind === 'poll-wait' ||
    ops[step - 1]?.kind === 'clear-busy'
  );
};

/// The 48-cell row a message leaves on the Damocles Display once its reveal completes.
///
/// Null where the strings payload was not supplied, or does not hold that record: the row then
/// cannot be checked at all, and only the generic printable-row rule applies.
const messageRow = (
  strings: DamoclesStrings | undefined,
  id: DamoclesMessageId
): string | null => {
  const text = strings === undefined ? undefined : presentedText(strings, id);
  return text === undefined ? null : effectiveMessageRow(text);
};

/// The row a script has itself written by the time it reaches `step`: the effective row of the
/// nearest preceding `message` op in the same script.
///
/// Null where the script has written nothing yet. Trigger 62's wait is its first operation, so
/// the row it sits on is whatever presented before the pickup -- a completed response's blank
/// clearing line, a system refusal, or the row the session opened on -- and the script does not
/// decide it (docs/design/damocles-limo-key-interaction.md).
const writtenRow = (
  strings: DamoclesStrings | undefined,
  script: ScriptId,
  step: Step
): string | null => {
  const ops = SCRIPTS[script].ops;
  for (let index = step - 1; index >= 0; index -= 1) {
    const op = ops[index];
    if (op?.kind === 'message') {
      return messageRow(strings, op.id);
    }
  }
  return null;
};

const frameOf = (value: unknown, path: string): Frame => {
  const frame = object(value, path);
  const script = frame['script'];
  if (!isScriptId(script)) {
    return fail(`${path} names an unknown Damocles Script`);
  }
  const step = frame['step'];
  if (!blockingStep(script, step as Step)) {
    return fail(`${path} is not a reachable continuation`);
  }
  return { script, step: step as Step };
};

const executionOf = (value: unknown): Execution | null => {
  if (value === null) {
    return null;
  }
  const execution = object(value, 'snapshot.script.execution');
  const script = execution['script'];
  if (!isScriptId(script)) {
    return fail('script execution names an unknown Damocles Script');
  }
  if (execution['revision'] !== SCRIPTS[script].revision) {
    return fail('script execution identity, revision or step is incompatible');
  }
  const step = execution['step'];
  if (!blockingStep(script, step as Step)) {
    return fail('script execution identity, revision or step is incompatible');
  }
  const returnStack = array(
    execution['returnStack'],
    'snapshot.script.execution.returnStack'
  ).map((frame, index) =>
    frameOf(frame, `snapshot.script.execution.returnStack[${index}]`)
  );
  // A queued response nests one frame inside the script it interrupted, and nothing observed
  // nests deeper: one outer frame is the whole recovered depth.
  if (returnStack.length > 1) {
    return fail('script return stack is unreachable');
  }
  return {
    returnStack,
    revision: SCRIPTS[script].revision,
    script,
    step: step as Step
  };
};

const scriptOf = (
  value: unknown,
  strings: DamoclesStrings | undefined
): DamoclesSaveScript => {
  const script = object(value, 'snapshot.script');
  const counter = integer(
    script['counter'],
    'snapshot.script.counter',
    0,
    65_535
  );
  const display = displayOf(script['display']);
  const displayDuration = integer(
    script['displayDuration'] ?? ORDINARY_DISPLAY_FRAMES,
    'snapshot.script.displayDuration',
    1,
    ORDINARY_DISPLAY_FRAMES
  );
  const pending =
    script['pending'] === null || script['pending'] === undefined
      ? null
      : integer(script['pending'], 'snapshot.script.pending', 0, 255);
  const execution = executionOf(script['execution']);
  const message = presentingOf(script['message'], displayDuration);
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
    PICKUP_TRIGGERS.some(
      index => !triggers.some(trigger => trigger.index === index)
    )
  ) {
    return fail('script trigger table is incomplete or duplicated');
  }
  if (pending !== null && !PICKUP_TRIGGERS.includes(pending)) {
    return fail('script pending trigger is not a pickup trigger');
  }
  if (message !== null) {
    const elapsedFrames = displayDuration - message.remainingFrames;
    if (
      (elapsedFrames < 36 &&
        (display.kind !== 'scrolling' ||
          display.id !== message.id ||
          display.reveal.pixels !== 8 * elapsedFrames)) ||
      (elapsedFrames >= 36 && display.kind !== 'held')
    ) {
      return fail('message gate and display reveal disagree');
    }
    // A reveal that has run its 36 frames has replaced the row with the presenting message's
    // own, so which message is presenting decides the held cells rather than merely allowing
    // them to be held.
    const row = messageRow(strings, message.id);
    if (display.kind === 'held' && row !== null && display.cells !== row) {
      return fail('held display is not the presenting message row');
    }
  }
  // A message that opens a response used to be required to reveal over the blank row. That is
  // no longer an invariant: trigger 6 parks without a clearing line, so the next response's
  // first message reveals over the row trigger 6 left held.
  if (execution !== null) {
    const ops = SCRIPTS[execution.script].ops;
    const previous = ops[execution.step - 1];
    const current = ops[execution.step];
    if (previous?.kind === 'message') {
      if (message?.id !== previous.id) {
        return fail('script execution is not at a reachable commit boundary');
      }
    } else if (current?.kind === 'poll-wait') {
      const threshold =
        current.frames === WAIT_FROM_DOCUMENT ? 200 : current.frames;
      if (message !== null || counter >= threshold || display.kind !== 'held') {
        return fail('script execution is not at a reachable commit boundary');
      }
      // Nothing can present over a suspended execution -- a system refusal is only raised while
      // the script state is parked and idle -- so a waiting script still holds the row its own
      // last message left, and a blank or unrelated row mid-wait is a record no play produces.
      const written = writtenRow(strings, execution.script, execution.step);
      if (written !== null && display.cells !== written) {
        return fail('waiting script does not hold the row it last wrote');
      }
    } else {
      return fail('script execution is not at a reachable commit boundary');
    }
  } else if (
    message !== null &&
    ![
      'system-string-1',
      'system-string-2',
      'system-string-22',
      'system-string-3',
      'system-string-9'
    ].includes(message.id)
  ) {
    return fail('parked script can only present a system message');
  }
  if (message === null && display.kind !== 'held') {
    return fail('scrolling display has no message');
  }
  return {
    counter,
    display,
    displayDuration,
    execution,
    message,
    pending,
    triggers
  };
};

const validateResidence = (
  catalogue: Catalogue,
  departures: readonly ResidenceDeparture[]
): void => {
  for (const departure of departures) {
    const instance = catalogue.instances.find(
      item => item.id === departure.instance
    );
    const handling = instance?.handling;
    if (handling === undefined || handling === null) {
      return fail('Object Residence names no handled Catalogue instance');
    }
    const residence = departure.residence;
    // The recovered placement class is Association A byte 3, not the handling byte's low
    // nibble, and the Drop does not yet rewrite it: a saved Residence may only carry the
    // class the Catalogue authored (docs/research/damocles-placement-class.md).
    if (residence.placementClass !== (instance?.placementClass ?? 0)) {
      fail('residence placement class contradicts the Catalogue');
    }
    if (
      residence.kind === 'surface' &&
      !catalogue.bodies.some(body => body.id === residence.body)
    ) {
      fail('surface residence contradicts the Catalogue');
    }
    if (residence.kind === 'structure') {
      if (!validStructureResidence(catalogue, residence)) {
        fail('structure residence contradicts the Catalogue');
      }
    }
  }
};

const occupancyOf = (value: unknown): DamoclesSaveOccupancy => {
  const occupancy = object(value, 'snapshot.occupancy');
  if (occupancy['kind'] === 'onFoot') {
    return { kind: 'onFoot' };
  }
  if (
    occupancy['kind'] !== 'aboard' ||
    typeof occupancy['instance'] !== 'string' ||
    occupancy['instance'] === ''
  ) {
    return fail('snapshot.occupancy is neither on foot nor aboard');
  }
  return { instance: occupancy['instance'], kind: 'aboard' };
};

/// Occupancy and Object Residence must say the same thing: aboard names the one instance whose
/// departure is `occupied`, and on foot there is none. A craft that is occupied and resident
/// too, at a departure or at its Catalogue placement, is a state boarding never leaves. With a
/// Catalogue, the occupied instance must also be one the board gate could have admitted: in the
/// Catalogue and published as boardable (#408).
export const validateOccupancy = (
  occupancy: DamoclesSaveOccupancy,
  residence: readonly ResidenceDeparture[],
  catalogue?: Catalogue
): void => {
  const aboard = occupancy.kind === 'aboard' ? occupancy.instance : null;
  const occupied = residence.filter(item => item.residence.kind === 'occupied');
  if (
    (occupancy.kind !== 'aboard' && occupancy.kind !== 'onFoot') ||
    occupied.length !== (aboard === null ? 0 : 1) ||
    (aboard !== null && occupied[0]?.instance !== aboard)
  ) {
    fail('Occupancy and Object Residence disagree');
  }
  if (aboard === null || catalogue === undefined) {
    return;
  }
  const instance = catalogue.instances.find(item => item.id === aboard);
  if (instance === undefined) {
    return fail('Occupancy names no Catalogue instance');
  }
  if (instance.boarding?.boardable !== true) {
    return fail('Occupancy names an instance that is not boardable');
  }
};

export const encodeDamoclesSave = (record: DamoclesSaveRecord): string =>
  JSON.stringify(record);

/// The Data Payload the deeper rules read. Each part is optional and carries its own rules with
/// it: a caller holding only the record still gets every rule the record alone decides, which is
/// what the schema and envelope tests exercise. Shipping callers supply all three.
export interface DamoclesSaveContent {
  readonly catalogue?: Catalogue;
  readonly poses?: ArrivalPoses;
  readonly strings?: DamoclesStrings;
}

/// Decode a Damocles Save or Session Resume, or throw the exact refusal.
///
/// Identity is exact: a Targ envelope, an older schema, or a Catalogue or presentation
/// mismatch cannot become play without a migration this version does not have.
export const decodeDamoclesSave = (
  encoded: string,
  expected: DamoclesSaveIdentity,
  content: DamoclesSaveContent = {}
): DamoclesSaveRecord => {
  const { catalogue, poses, strings } = content;
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
  const capacity = carried.includes('object-slot-108') ? 20 : 10;
  if (carried.length > capacity || new Set(carried).size !== carried.length) {
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
  if (
    (snapshot['briefcaseStore'] === undefined) !==
    (snapshot['pendingBriefcaseDrop'] === undefined)
  ) {
    return fail('snapshot continuation fields are only partially present');
  }
  const briefcaseStore = array(
    snapshot['briefcaseStore'] === undefined ? [] : snapshot['briefcaseStore'],
    'snapshot.briefcaseStore'
  ).map(value =>
    typeof value === 'string' && value !== ''
      ? value
      : fail('briefcaseStore member is invalid')
  );
  if (
    briefcaseStore.length > 10 ||
    new Set(briefcaseStore).size !== briefcaseStore.length ||
    briefcaseStore.some(
      instance =>
        instance === 'object-slot-108' ||
        carried.includes(instance) ||
        residence.some(item => item.instance === instance)
    ) ||
    (briefcaseStore.length > 0 &&
      (carried.includes('object-slot-108') ||
        !residence.some(
          item =>
            item.instance === 'object-slot-108' &&
            item.residence.kind !== 'carried'
        )))
  ) {
    return fail(
      'briefcaseStore contradicts Object Residence or the Carried Stack'
    );
  }
  let pendingBriefcaseDrop: DamoclesSaveSnapshot['pendingBriefcaseDrop'] = null;
  if (
    snapshot['pendingBriefcaseDrop'] !== undefined &&
    snapshot['pendingBriefcaseDrop'] !== null
  ) {
    const pending = object(
      snapshot['pendingBriefcaseDrop'],
      'snapshot.pendingBriefcaseDrop'
    );
    const placement = residenceOf(pending['residence']);
    if (
      pending['head'] !== 'object-slot-108' ||
      carried[0] !== pending['head'] ||
      carried.length <= 10 ||
      placement.kind === 'carried' ||
      placement.kind === 'occupied' ||
      briefcaseStore.length !== 0
    ) {
      return fail('pendingBriefcaseDrop contradicts the Carried Stack');
    }
    pendingBriefcaseDrop = { head: pending['head'], residence: placement };
  }
  const occupancy = occupancyOf(snapshot['occupancy']);
  validateOccupancy(occupancy, residence, catalogue);
  const pose = poseOf(snapshot['pose']);
  if (catalogue !== undefined) {
    if (!catalogue.bodies.some(body => body.id === pose.body)) {
      return fail('pose names an unknown Body');
    }
    // A Body is only switchable, and only standable, where an admitted Pose anchors it: without
    // a recovered workspace origin the Pose's cell cannot be related to any resident placement.
    if (
      poses !== undefined &&
      !admittedPoses(poses).some(item => item.body === pose.body)
    ) {
      return fail('pose names a Body with no admitted arrival Pose');
    }
    validateResidence(catalogue, residence);
    if (
      briefcaseStore.some(
        id =>
          catalogue.instances.find(instance => instance.id === id)?.handling ==
          null
      )
    ) {
      return fail('briefcaseStore names no handled Catalogue instance');
    }
    if (pendingBriefcaseDrop !== null) {
      validateResidence(catalogue, [
        {
          instance: pendingBriefcaseDrop.head,
          residence: pendingBriefcaseDrop.residence
        }
      ]);
    }
  }
  const scrollCounter = integer(
    snapshot['scrollCounter'],
    'snapshot.scrollCounter',
    -16,
    16
  );
  const script = scriptOf(snapshot['script'], strings);
  // An armed trigger requires its object to be at its Catalogue placement and absent from the
  // Carried Stack: the launch path clears bit 7, and nothing re-arms a trigger, so an armed
  // trigger whose object has been taken or moved is a state no sequence of actions reaches.
  for (const [instance, index] of Object.entries(TRIGGER_FOR_RESIDENT)) {
    const trigger = script.triggers.find(item => item.index === index);
    if (trigger === undefined || !trigger.armed) {
      continue;
    }
    if (
      carried.includes(instance) ||
      briefcaseStore.includes(instance) ||
      residence.some(item => item.instance === instance)
    ) {
      return fail(
        `trigger ${index} contradicts ${instance}'s Object Residence`
      );
    }
    // A response that is running cannot also be waiting to be launched.
    if (script.execution?.script === SCRIPT_FOR_TRIGGER[index]) {
      return fail(
        `trigger ${index} is armed while its own response is running`
      );
    }
  }
  let structure: BoundStructureSnapshot | null = null;
  if (snapshot['structure'] !== null) {
    const bound = object(snapshot['structure'], 'snapshot.structure');
    const instanceId = bound['instanceId'];
    const regionIndex = bound['regionIndex'];
    const floor = bound['floor'];
    const doorway = bound['doorway'];
    const floorOf = (value: unknown): value is number =>
      Number.isInteger(value) &&
      (value as number) >= 0 &&
      (value as number) <= HIGHEST_FLOOR;
    const attachmentSlot = (value: unknown): value is number =>
      Number.isInteger(value) &&
      (value as number) > 0 &&
      (value as number) <= 0x03_fc &&
      (value as number) % 4 === 0;
    if (
      typeof instanceId !== 'string' ||
      !floorOf(floor) ||
      (doorway !== null && !attachmentSlot(doorway)) ||
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
        !attachmentSlot(slot) ||
        !finite(openUnits) ||
        openUnits < 0 ||
        openUnits > 32_767
      ) {
        return fail('attachment state is outside its recovered bounds');
      }
      return { openUnits, slot };
    });
    let ride: LiftRideSnapshot | null = null;
    if (bound['ride'] !== null) {
      const saved = object(bound['ride'], 'snapshot.structure.ride');
      const { countdown, destination, label } = saved;
      if (
        !Number.isInteger(countdown) ||
        (countdown as number) < 1 ||
        (countdown as number) > LIFT_STEP_TICKS ||
        !floorOf(destination) ||
        !floorOf(label)
      ) {
        return fail('lift ride is outside its recovered bounds');
      }
      ride = { countdown: countdown as number, destination, label };
    }
    if (
      new Set(attachments.map(item => item.slot)).size !== attachments.length
    ) {
      return fail('attachment slots are duplicated');
    }
    structure = {
      attachments,
      doorway,
      floor,
      instanceId,
      regionIndex: regionIndex as number | null,
      ride
    };
  }
  return {
    identity,
    savedAt: record['savedAt'],
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot: {
      briefcaseStore,
      carried,
      elapsed: snapshot['elapsed'],
      frameAccumulator,
      occupancy,
      pendingBriefcaseDrop,
      pose,
      residence,
      script,
      scrollCounter,
      structure
    },
    where: record['where']
  };
};

/// The one place a Damocles location is put into words, for the console, the Session Resume and
/// the Save record's slot line. It takes the Body name rather than assuming Eris: a switch makes
/// every one of those three reachable on four Bodies.
export const damoclesWhere = (where: {
  readonly bodyName: string;
  readonly cell: { readonly x: number; readonly z: number };
}): string =>
  `${where.bodyName} ${String(where.cell.x).padStart(2, '0')}-${String(where.cell.z).padStart(2, '0')}`;
