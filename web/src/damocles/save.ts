import type { Catalogue } from '../catalogue/data.ts';
import { craftPanelSpeed } from './craft.ts';
import {
  DAMOCLES_ROW_CELLS,
  LANDING_MESSAGE_IDS,
  effectiveMessageRow,
  isDocumentMessage,
  messagePlane,
  type DamoclesDisplay,
  type DamoclesMessageId,
  type DocumentMessageId,
  type RowPlane
} from './display.ts';
import {
  documentBody,
  documentFor,
  type DamoclesDocuments
} from './documentBank.ts';
import {
  NOVAGEN_SAFE_SLOT,
  TRANSITION_VBLS,
  initialHeadCommands,
  type HeadCommandState
} from './headCommands.ts';
import { admittedPoses, type ArrivalPoses } from './poses.ts';
import {
  admissiblePlacementClass,
  validStructureResidence,
  type PlacedResidence,
  type Residence,
  type ResidenceDeparture
} from './residence.ts';
import {
  NEW_GAME_NOISE,
  NOISE_WORDS,
  SHORTENED_DISPLAY_FRAMES,
  initialScriptState,
  type Execution,
  type Frame,
  type Presenting
} from './script.ts';
import {
  LANDING_TRIGGERS,
  ORDINARY_DISPLAY_FRAMES,
  SCRIPTS,
  SCRIPT_FOR_TRIGGER,
  TOLOSA_VISITED_FLAG,
  TRIGGER_ARMING,
  TRIGGER_FOR_RESIDENT,
  WAIT_FROM_DOCUMENT,
  isScriptId,
  type ScriptId,
  type Step
} from './scripts.ts';
import type { AttachmentLatch } from './selection.ts';
import { landsOn } from './space.ts';
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
///
/// Version 9 carries the current Body's rotation accumulator, which with the Pose decides the
/// terminator: the sky and the half of the scene palette the scene is drawn in (#494, #497). A
/// schema-8 record cannot say how far its Body had turned, so it is refused whole rather than
/// defaulted to the start's.
///
/// Version 10 carries whether any door moved on the last pass (`$5A9D9`), which the next pass
/// compares with to ask for the door tones (#499). A schema-9 record cannot say whether a door
/// had just stopped, so it is refused whole rather than defaulted to still.
///
/// Version 11 carries each attachment's latch (`$5A41 + slot`) beside its open units (#498).
/// The latch settles a pass after its edge reaches the endpoint on most paths, and a ride sets it
/// moving on a shut door, so it is not a function of the units. A schema-10 record cannot say
/// whether a door at its endpoint had latched, so it is refused whole rather than derived.
///
/// Version 12 carries the craft Mover's words aboard and the pass phase (#557, ADR 0051), and
/// the instance angle byte each leave wrote (`$0544FA`). A schema-11 record is migrated, not
/// refused: aboard, it is seated at the boarding preset (`$054744`) facing the saved heading,
/// which is what every schema-11 restore did, and its objects stand at their Catalogue angles.
///
/// Version 13 carries space (#568): the craft's space words in space (Occupancy 2), the launch
/// swing `$7B0C` aboard, and the pitch rate, nearest Body and range every flight leaves for the
/// next. The range is saved rather than recomputed: on the space entry's frame it is still the
/// last flight's, which no restore could rebuild. Schemas 11 and 12 are migrated: a schema-12
/// record has no swing in progress and the first world's space words, and one saved in space
/// carried only the words the space entry found, so it enters space afresh, as it did.
///
/// Version 14 carries the landing messages (#576): the 27 landing triggers beside the six pickup
/// triggers, TOLOSA's bit of `$7BD8`, the encounter gate `$070104` and the noise pointer
/// `$7E18`. The original's own save omits the pointer; carrying it makes a restored draw the one
/// an uninterrupted run makes. Schemas 11 to 13 are migrated with every landing trigger armed,
/// no flag, a shut gate and the New Game pointer: no earlier landing spent a trigger, because
/// the port carried none of their scripts.
///
/// Version 15 carries the on-foot pass phase (#582, ADR 0054): on foot the pointer now steps once
/// every `time.ticksPerPassOnFoot` ticks, as the ST's main loop steps it once a pass. A schema-14
/// record is migrated at phase 0 with its own pointer: it was saved by a port that held the
/// pointer on foot, so any phase is one it could have reached. Schemas 11 to 13 now migrate with
/// the pointer a New Game starts at, `NEW_GAME_NOISE`.
///
/// Version 16 carries the TOLOSA encounter (#581, ADR 0055): the pool's records for slots 8, 11
/// and 15, whether the player is dead, and the noise words zaps have turned. The original's save
/// covers the pool and `$7A64` but not the table; carrying the turned words makes a restored draw
/// the one an uninterrupted run makes, as the pointer's does. A schema-15 record or older is
/// migrated alive, with no word turned and the pool the first world's: no earlier port ran the
/// pool, so its records stood where the first world left them.
///
/// Version 17 carries the Head Commands' document mode (#598): the open document, its item and
/// its index, the centre box's transition, and the object and index the last Read copied. The
/// index is kept apart from the item because a backward wrap sets it to 8. The script carries the
/// Read `$7B96` queued, and the message row each held row's plane and each block's offset,
/// because a body is drawn in plane 1 and shown 48 cells at a time. The original's save carries
/// the open panel too (`$785E`–`$7865`). A schema-16 record or older is migrated with no
/// document open and every row in plane 0: no earlier port opened one.
export const DAMOCLES_SAVE_SCHEMA_VERSION = 17 as const;
/// The older schemas a restore migrates rather than refuses.
const MIGRATED_SCHEMA_VERSIONS: readonly unknown[] = [11, 12, 13, 14, 15, 16];
/// The schemas from before the landing messages (#576), which carry no landing trigger.
const PRE_LANDING_SCHEMA_VERSIONS: readonly unknown[] = [11, 12, 13];
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
    /// `$5A41 + slot`. Closed stands shut and open at the endpoint; moving stands anywhere.
    readonly latch: AttachmentLatch;
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

/// The craft Mover's words aboard (ADR 0051 decision 4), in the program's units. The position
/// is the Pose's, which aboard is the craft's X, Y and Z.
export interface DamoclesSaveCraft {
  /// `$7ACA`: `$3F` in ground contact, else 0.
  readonly contact: number;
  /// `$4DFEC`, the panel's speed copy, a signed long. A surface pass leaves it the integer of the
  /// speed's magnitude, but the launch and the swing leave it stale, and in space it is γ's form
  /// (#551), so schema 13 carries it. A schema-12 record's is the surface pass's.
  readonly panelSpeed: number;
  /// Ticks since the last pass, below `time.ticksPerPass`.
  readonly passTicks: number;
  /// `$7AC0`, `$7ABE` and `$7AC2`. Yaw is the unmasked word.
  readonly pitch: number;
  readonly roll: number;
  /// In space (Occupancy 2), the space words; null on a Body. `entry` is a migrated schema-12
  /// record saved in space, whose craft words are the ones the space entry found.
  readonly space: DamoclesSaveSpace | 'entry' | null;
  /// `$797A`, a float.
  readonly speed: number;
  /// `$7BC8` and `$7B02`: standing on a support, and that support's tag.
  readonly supported: number;
  readonly supportLevel: number;
  /// `$7B0C`: the launch swing is running. The space entry clears it.
  readonly swing: boolean;
  /// `$7BAC`, a float.
  readonly throttle: number;
  /// The pitch and yaw the frame's attitude sines were taken at, which differ from the
  /// attitude's only before the first pass after boarding.
  readonly trig: { readonly pitch: number; readonly yaw: number };
  /// `$7970`, a float.
  readonly turnRate: number;
  readonly yaw: number;
}

/// The words only space keeps (docs/research/damocles-space-flight.md, "What this means for the
/// port"). The pitch is derived from the pitch rate each pass, so the craft's pitch word is the
/// derived one and the rate is in `spaceMemory`.
export interface DamoclesSaveSpace {
  /// `$7876`: 32γ, as the last pass left it.
  readonly dilation: number;
  /// `$7B0A`: passes left before an arrival may be raised.
  readonly hold: number;
  /// `$799A`, `$799E` and `$79A2`: the craft's position in the System, signed longs.
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/// The space words a flight leaves behind for the next, and in space the current ones.
export interface DamoclesSaveSpaceMemory {
  /// `$7924`: the nearest Body's table offset, 4 × the Body.
  readonly nearest: number;
  /// `$7974`: the pitch rate, a float.
  readonly pitchRate: number;
  /// `$791C`: the nearest range, a float, as the last frame's scan left it.
  readonly range: number;
}

export interface DamoclesSaveSnapshot {
  /// The instance angle byte (`$0544FA`) of each craft a leave has set down, 256 a turn.
  readonly angleBytes: readonly {
    readonly byte: number;
    readonly instance: string;
  }[];
  // Both continuation fields may be omitted together and are then normalized to empty;
  // partial omission is invalid. Since the schema-5 bump no shipped build writes a record
  // that omits them, so this leniency is now unreachable rather than load-bearing.
  /// The current Body's rotation accumulator (`$62EA + 4 * body`), one turn every `$04000000`.
  readonly bodyTurn: number;
  readonly briefcaseStore: readonly string[];
  readonly carried: readonly string[];
  /// The craft Mover's words aboard, or null on foot. A migrated schema-11 record aboard has
  /// none, and the session seats it at the boarding preset.
  readonly craft: DamoclesSaveCraft | null;
  /// `$5A9D9`: whether any door moved on the last pass.
  readonly doorsMoving: boolean;
  readonly elapsed: number;
  /// The TOLOSA encounter, or null for the first world's pool with the player alive, as a
  /// migrated record resumes with.
  readonly encounter: DamoclesSaveEncounter | null;
  /// On foot, ticks since the last main-loop pass, below `time.ticksPerPassOnFoot` (ADR 0054).
  readonly footTicks: number;
  readonly frameAccumulator: number;
  /// The open document and the centre box, as a migrated record resumes with none open.
  readonly headCommands: HeadCommandState;
  readonly occupancy: DamoclesSaveOccupancy;
  readonly pendingBriefcaseDrop: {
    readonly head: string;
    readonly residence: PlacedResidence;
  } | null;
  readonly pose: Pose;
  readonly residence: readonly ResidenceDeparture[];
  readonly script: DamoclesSaveScript;
  readonly scrollCounter: number;
  /// The pitch rate, nearest Body and range, or null for the first world's, as a migrated record
  /// resumes with.
  readonly spaceMemory: DamoclesSaveSpaceMemory | null;
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
  /// Bank word `$070104`, the encounter gate.
  readonly encounter: number;
  readonly execution: Execution | null;
  /// `$7BD8` without the busy bit.
  readonly flags: number;
  readonly message: Presenting | null;
  /// The noise pointer `$7E18` as a word index.
  readonly noise: number;
  /// `$7A88`, the one queued trigger index.
  readonly pending: number | null;
  /// `$7B96`: the document body a Read has queued and the dispatch head has not yet presented.
  readonly read: DocumentMessageId | null;
  readonly triggers: readonly {
    readonly armed: boolean;
    readonly index: number;
  }[];
  /// The noise words zaps have turned, one entry a zap.
  readonly zaps: readonly number[];
}

/// One moving-object pool record (`$612A`, `$614A`–`$618A`, `$63A8`–`$6BA8` and Association B's
/// byte 0 at slot × 4).
export interface DamoclesSavePoolObject {
  readonly body: number;
  readonly counter: number;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
}

/// The TOLOSA encounter (#581): the pool, and whether a zap has killed the player (`$7A64` = 1).
export interface DamoclesSaveEncounter {
  readonly dead: boolean;
  readonly pool: {
    readonly ship: DamoclesSavePoolObject;
    readonly shipShot: DamoclesSavePoolObject;
    readonly shot: DamoclesSavePoolObject;
  };
}

export const initialDamoclesSaveScript = (): DamoclesSaveScript => {
  const script = initialScriptState();
  return {
    counter: script.counter,
    display: script.display,
    displayDuration: script.displayDuration,
    encounter: script.encounter,
    execution: script.execution,
    flags: script.flags,
    message: script.message,
    noise: script.noise,
    pending: script.pending,
    read: script.read,
    triggers: script.triggers.map(({ armed, index }) => ({ armed, index })),
    zaps: script.zaps
  };
};

const word = (value: unknown, path: string): number =>
  integer(value, path, 0, 0xff_ff);
const float = (value: unknown, path: string): number =>
  integer(value, path, 0, 0xff_ff_ff_ff);

/// `$7ACA` and `$7BC8`: `$3F` or 0.
const flag = (item: unknown, path: string): number =>
  item === 0 || item === 0x3f ? item : fail(`${path} is neither 0 nor $3F`);

const long = (value: unknown, path: string): number =>
  integer(value, path, -0x80_00_00_00, 0x7f_ff_ff_ff);

const spaceOf = (value: unknown): DamoclesSaveSpace => {
  const space = object(value, 'snapshot.craft.space');
  return {
    dilation: word(space['dilation'], 'snapshot.craft.space.dilation'),
    hold: word(space['hold'], 'snapshot.craft.space.hold'),
    x: long(space['x'], 'snapshot.craft.space.x'),
    y: long(space['y'], 'snapshot.craft.space.y'),
    z: long(space['z'], 'snapshot.craft.space.z')
  };
};

const spaceMemoryOf = (
  value: unknown,
  catalogue: Catalogue | undefined
): DamoclesSaveSpaceMemory => {
  const memory = object(value, 'snapshot.spaceMemory');
  const nearest = integer(
    memory['nearest'],
    'snapshot.spaceMemory.nearest',
    0,
    0xff_ff
  );
  const bodies = catalogue?.craft?.bodies.length;
  if (nearest % 4 !== 0 || (bodies !== undefined && nearest / 4 >= bodies)) {
    return fail('snapshot.spaceMemory.nearest names no Body in the range scan');
  }
  return {
    nearest,
    pitchRate: float(memory['pitchRate'], 'snapshot.spaceMemory.pitchRate'),
    range: float(memory['range'], 'snapshot.spaceMemory.range')
  };
};

/// Schema 12 said whether the space entry had been reached (`enteringSpace`), and had no swing;
/// schema 13 carries the space words instead.
const craftOf = (value: unknown, schema12: boolean): DamoclesSaveCraft => {
  const craft = object(value, 'snapshot.craft');
  const trig = object(craft['trig'], 'snapshot.craft.trig');
  const speed = float(craft['speed'], 'snapshot.craft.speed');
  let space: DamoclesSaveCraft['space'];
  let swing = false;
  if (schema12) {
    if (typeof craft['enteringSpace'] !== 'boolean') {
      return fail('snapshot.craft.enteringSpace is not a boolean');
    }
    space = craft['enteringSpace'] ? 'entry' : null;
  } else {
    if (typeof craft['swing'] !== 'boolean') {
      return fail('snapshot.craft.swing is not a boolean');
    }
    swing = craft['swing'];
    space = craft['space'] === null ? null : spaceOf(craft['space']);
    // The space entry clears the swing, and nothing sets it in space.
    if (swing && space !== null) {
      return fail('snapshot.craft swings in space');
    }
  }
  return {
    contact: flag(craft['contact'], 'snapshot.craft.contact'),
    panelSpeed: schema12
      ? craftPanelSpeed(speed)
      : long(craft['panelSpeed'], 'snapshot.craft.panelSpeed'),
    passTicks: integer(craft['passTicks'], 'snapshot.craft.passTicks', 0, 255),
    pitch: word(craft['pitch'], 'snapshot.craft.pitch'),
    roll: word(craft['roll'], 'snapshot.craft.roll'),
    space,
    speed,
    supported: flag(craft['supported'], 'snapshot.craft.supported'),
    supportLevel: word(craft['supportLevel'], 'snapshot.craft.supportLevel'),
    swing,
    throttle: float(craft['throttle'], 'snapshot.craft.throttle'),
    trig: {
      pitch: word(trig['pitch'], 'snapshot.craft.trig.pitch'),
      yaw: word(trig['yaw'], 'snapshot.craft.trig.yaw')
    },
    turnRate: float(craft['turnRate'], 'snapshot.craft.turnRate'),
    yaw: word(craft['yaw'], 'snapshot.craft.yaw')
  };
};

const angleBytesOf = (
  value: unknown,
  catalogue: Catalogue | undefined
): DamoclesSaveSnapshot['angleBytes'] => {
  const angleBytes = array(value, 'snapshot.angleBytes').map(item => {
    const entry = object(item, 'snapshot.angleBytes[]');
    const instance = entry['instance'];
    if (typeof instance !== 'string' || instance === '') {
      return fail('angle byte names no instance');
    }
    return {
      byte: integer(entry['byte'], 'snapshot.angleBytes[].byte', 0, 0xff),
      instance
    };
  });
  if (
    new Set(angleBytes.map(item => item.instance)).size !== angleBytes.length
  ) {
    return fail('angle bytes are duplicated');
  }
  // Only a leave writes one, so only a boardable instance can have one.
  if (
    catalogue !== undefined &&
    angleBytes.some(
      ({ instance }) =>
        catalogue.instances.find(item => item.id === instance)?.boarding
          ?.boardable !== true
    )
  ) {
    return fail('angle byte names an instance that is not boardable');
  }
  return angleBytes;
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
/// five further responses use are already extracted into `payload/damocles/strings.json`, and so
/// are the landing scripts' (#576).
const messageIds = new Set<DamoclesMessageId>([
  ...LANDING_MESSAGE_IDS,
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
  'system-string-21',
  'system-string-22',
  'system-string-3',
  'system-string-33',
  'system-string-48',
  'system-string-49',
  'system-string-50',
  'system-string-9'
]);

/// The records a Save's message ids are checked against. Either may be absent, and then only the
/// rules the record alone decides apply.
interface MessageContent {
  readonly documents: DamoclesDocuments | undefined;
  readonly strings: DamoclesStrings | undefined;
}

/// A document body's id names an object and one of its items. Without the documents only its
/// form can be checked.
const bodyOf = (
  content: MessageContent,
  id: DocumentMessageId
): string | undefined =>
  content.documents === undefined
    ? undefined
    : documentBody(content.documents, id);

const messageId = (
  value: unknown,
  path: string,
  content: MessageContent
): DamoclesMessageId => {
  if (typeof value === 'string' && isDocumentMessage(value)) {
    return content.documents === undefined ||
      bodyOf(content, value) !== undefined
      ? value
      : fail(`${path} names an unknown document item`);
  }
  return typeof value === 'string' && messageIds.has(value as DamoclesMessageId)
    ? (value as DamoclesMessageId)
    : fail(`${path} names an unknown message`);
};

/// The text a message presents, or undefined where the content that holds it was not supplied.
const recordText = (
  content: MessageContent,
  id: DamoclesMessageId
): string | undefined =>
  isDocumentMessage(id)
    ? bodyOf(content, id)
    : content.strings === undefined
      ? undefined
      : presentedText(content.strings, id);

const planeOf = (value: unknown, path: string): RowPlane =>
  value === 0 || value === 1 ? value : fail(`${path} is not a row plane`);

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
    // A Save carries no pitch in the Pose: on foot the view is always level. Aboard, the session
    // draws the Pose from the craft words, whose pitch word `craft` carries (#557).
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

/// A block offset: 0, or for a document body a whole number of rows inside the body.
const blockOffset = (
  value: unknown,
  path: string,
  id: DamoclesMessageId,
  content: MessageContent
): number => {
  const offset = integer(value, path, 0, 0xff_ff);
  const text = recordText(content, id);
  return offset === 0 ||
    (isDocumentMessage(id) &&
      offset % DAMOCLES_ROW_CELLS === 0 &&
      (text === undefined || offset < text.length))
    ? offset
    : fail(`${path} is not a block of its record`);
};

/// Before schema 17 every row was drawn in plane 0 and every message started at its first
/// character, so a migrated record carries neither.
const displayOf = (
  value: unknown,
  current: boolean,
  content: MessageContent
): DamoclesDisplay => {
  const display = object(value, 'snapshot.script.display');
  if (display['kind'] === 'held') {
    return {
      cells: printableRow(display['cells'], 'snapshot.script.display.cells'),
      kind: 'held',
      plane: current
        ? planeOf(display['plane'], 'snapshot.script.display.plane')
        : 0
    };
  }
  if (display['kind'] !== 'scrolling') {
    return fail('script display kind is invalid');
  }
  const reveal = object(display['reveal'], 'snapshot.script.display.reveal');
  const pixels = integer(reveal['pixels'], 'display.reveal.pixels', 0, 280);
  if (pixels % 8 !== 0 || (!current && reveal['offset'] !== 0)) {
    return fail('display Reveal is not at a commit boundary');
  }
  const id = messageId(display['id'], 'snapshot.script.display.id', content);
  return {
    id,
    kind: 'scrolling',
    reveal: {
      beneath: printableRow(reveal['beneath'], 'display.reveal.beneath'),
      beneathPlane: current
        ? planeOf(reveal['beneathPlane'], 'display.reveal.beneathPlane')
        : 0,
      offset: current
        ? blockOffset(reveal['offset'], 'display.reveal.offset', id, content)
        : 0,
      pixels
    }
  };
};

/// How long a block of a message holds. A script's or a system message's is the bank word the
/// save records, so the shared epilogue's clearing line starts at 50, not 200. A document body's
/// is 200, or 50 for the block that reads its terminator, whatever the bank word says.
const blockDuration = (
  message: Pick<Presenting, 'id' | 'offset'>,
  displayDuration: number,
  content: MessageContent
): number => {
  if (!isDocumentMessage(message.id)) {
    return displayDuration;
  }
  const text = recordText(content, message.id);
  return text !== undefined && text.length - message.offset < DAMOCLES_ROW_CELLS
    ? SHORTENED_DISPLAY_FRAMES
    : ORDINARY_DISPLAY_FRAMES;
};

const presentingOf = (
  value: unknown,
  displayDuration: number,
  current: boolean,
  content: MessageContent
): Presenting | null => {
  if (value === null) {
    return null;
  }
  const message = object(value, 'snapshot.script.message');
  const id = messageId(message['id'], 'snapshot.script.message.id', content);
  const offset = current
    ? blockOffset(
        message['offset'],
        'snapshot.script.message.offset',
        id,
        content
      )
    : 0;
  return {
    id,
    offset,
    remainingFrames: integer(
      message['remainingFrames'],
      'snapshot.script.message.remainingFrames',
      1,
      blockDuration({ id, offset }, displayDuration, content)
    )
  };
};

/// The six pickup trigger indices the object-to-trigger table at `$0543EC` names.
const PICKUP_TRIGGERS: readonly number[] = [2, 5, 6, 11, 20, 62];
/// Every trigger a schema-14 record carries, pickups and landings.
const SAVED_TRIGGERS: readonly number[] = [
  ...PICKUP_TRIGGERS,
  ...LANDING_TRIGGERS
];

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
  content: MessageContent,
  id: DamoclesMessageId,
  offset = 0
): string | null => {
  const text = recordText(content, id);
  return text === undefined ? null : effectiveMessageRow(text, offset);
};

/// The row a script has itself written by the time it reaches `step`: the effective row of the
/// nearest preceding `message` op in the same script.
///
/// Null where the script has written nothing yet. Trigger 62's wait is its first operation, so
/// the row it sits on is whatever presented before the pickup -- a completed response's blank
/// clearing line, a system refusal, or the row the session opened on -- and the script does not
/// decide it (docs/design/damocles-limo-key-interaction.md).
const writtenRow = (
  content: MessageContent,
  script: ScriptId,
  step: Step
): string | null => {
  const ops = SCRIPTS[script].ops;
  for (let index = step - 1; index >= 0; index -= 1) {
    const op = ops[index];
    if (op?.kind === 'message') {
      return messageRow(content, op.id);
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
  content: MessageContent,
  migrated: boolean,
  encounterSaved: boolean,
  current: boolean
): DamoclesSaveScript => {
  const script = object(value, 'snapshot.script');
  const counter = integer(
    script['counter'],
    'snapshot.script.counter',
    0,
    65_535
  );
  const display = displayOf(script['display'], current, content);
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
  const message = presentingOf(
    script['message'],
    displayDuration,
    current,
    content
  );
  const read =
    !current || script['read'] === null
      ? null
      : messageId(script['read'], 'snapshot.script.read', content);
  if (read !== null && !isDocumentMessage(read)) {
    return fail('snapshot.script.read names no document item');
  }
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
  const expected = migrated ? PICKUP_TRIGGERS : SAVED_TRIGGERS;
  if (
    new Set(triggers.map(trigger => trigger.index)).size !== triggers.length ||
    triggers.length !== expected.length ||
    expected.some(index => !triggers.some(trigger => trigger.index === index))
  ) {
    return fail('script trigger table is incomplete or duplicated');
  }
  // Before schema 14 no landing had spent a trigger, so each migrates armed.
  const table = migrated
    ? [...triggers, ...LANDING_TRIGGERS.map(index => ({ armed: true, index }))]
    : triggers;
  const flags = migrated
    ? 0
    : integer(script['flags'], 'snapshot.script.flags', 0, 0xff_ff);
  if ((flags & ~TOLOSA_VISITED_FLAG) !== 0) {
    return fail('script flags name a bit no ported script writes');
  }
  const encounter = migrated
    ? 0
    : integer(script['encounter'], 'snapshot.script.encounter', 0, 1);
  const noise = migrated
    ? NEW_GAME_NOISE
    : integer(script['noise'], 'snapshot.script.noise', 0, NOISE_WORDS - 1);
  const zaps = encounterSaved
    ? array(script['zaps'], 'snapshot.script.zaps').map(word =>
        integer(word, 'snapshot.script.zaps[]', 0, NOISE_WORDS - 1)
      )
    : [];
  // Only TOLOSA's script arms the gate, and it sets the flag first, so an armed gate needs the
  // flag. A kill or a zap clears the gate and leaves the flag (#581), so the flag no longer
  // needs the gate.
  if (encounter !== 0 && (flags & TOLOSA_VISITED_FLAG) === 0) {
    return fail('the encounter gate is armed but TOLOSA was never visited');
  }
  // A one-shot trigger is disarmed as its script launches, so it cannot be armed while that
  // script is running.
  for (const { armed, index } of table) {
    const script = SCRIPT_FOR_TRIGGER[index];
    const sticky =
      ((TRIGGER_ARMING.find(item => item.index === index)?.byte ?? 0) &
        0x40) !==
      0;
    if (
      armed &&
      !sticky &&
      (execution?.script === script ||
        (execution?.returnStack.some(frame => frame.script === script) ??
          false))
    ) {
      return fail(`trigger ${index} is armed while its own script is running`);
    }
  }
  if (pending !== null && !PICKUP_TRIGGERS.includes(pending)) {
    return fail('script pending trigger is not a pickup trigger');
  }
  const reading = message !== null && isDocumentMessage(message.id);
  if (message !== null) {
    const elapsedFrames =
      blockDuration(message, displayDuration, content) -
      message.remainingFrames;
    if (
      (elapsedFrames < 36 &&
        (display.kind !== 'scrolling' ||
          display.id !== message.id ||
          display.reveal.offset !== message.offset ||
          display.reveal.pixels !== 8 * elapsedFrames)) ||
      (elapsedFrames >= 36 && display.kind !== 'held')
    ) {
      return fail('message gate and display reveal disagree');
    }
    // A reveal that has run its 36 frames has replaced the row with the presenting message's
    // own, so which message is presenting decides the held cells rather than merely allowing
    // them to be held.
    const row = messageRow(content, message.id, message.offset);
    if (
      display.kind === 'held' &&
      ((row !== null && display.cells !== row) ||
        display.plane !== messagePlane(message.id))
    ) {
      return fail('held display is not the presenting message row');
    }
  }
  // A message that opens a response used to be required to reveal over the blank row. That is
  // no longer an invariant: trigger 6 parks without a clearing line, so the next response's
  // first message reveals over the row trigger 6 left held.
  if (execution !== null) {
    const ops = SCRIPTS[execution.script].ops;
    const previous = ops[execution.step - 1];
    const step = ops[execution.step];
    // A queued Read is presented the first frame the gate is down, ahead of the script
    // (`$051944`), so a body can present after a script's message and during its wait. The
    // script resumes once the body's last block is over.
    if (previous?.kind === 'message') {
      if (message?.id !== previous.id && !reading) {
        return fail('script execution is not at a reachable commit boundary');
      }
    } else if (step?.kind === 'poll-wait') {
      const threshold = step.frames === WAIT_FROM_DOCUMENT ? 200 : step.frames;
      if (
        !reading &&
        (message !== null || counter >= threshold || display.kind !== 'held')
      ) {
        return fail('script execution is not at a reachable commit boundary');
      }
      // Nothing but a Read presents over a suspended execution -- a system refusal is only
      // raised while the script state is parked and idle -- so a waiting script holds the row
      // its own last message left, or a body's, which is drawn in plane 1. A blank or unrelated
      // row mid-wait is a record no play produces.
      const written = writtenRow(content, execution.script, execution.step);
      if (
        !reading &&
        display.kind === 'held' &&
        display.plane === 0 &&
        written !== null &&
        display.cells !== written
      ) {
        return fail('waiting script does not hold the row it last wrote');
      }
    } else {
      return fail('script execution is not at a reachable commit boundary');
    }
  } else if (
    message !== null &&
    !reading &&
    ![
      'system-string-1',
      'system-string-2',
      'system-string-21',
      'system-string-22',
      'system-string-3',
      'system-string-33',
      'system-string-48',
      'system-string-49',
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
    encounter,
    execution,
    flags,
    message,
    noise,
    pending,
    read,
    triggers: table,
    zaps
  };
};

/// The open document and the centre box. The open object is the one Open found at the head, and
/// only a drop closes it, so it is carried still, or packed in the briefcase with the drop that
/// stored it (`$054686` compares only the object dropped).
const headCommandsOf = (
  value: unknown,
  held: readonly string[],
  documents: DamoclesDocuments | undefined
): HeadCommandState => {
  const saved = object(value, 'snapshot.headCommands');
  const documentSlot = (item: unknown, path: string): number => {
    const slot = integer(item, path, 0, 0xff);
    if (
      slot === NOVAGEN_SAFE_SLOT ||
      (documents !== undefined && documentFor(documents, slot) === undefined)
    ) {
      return fail(`${path} names no document the Open table opens`);
    }
    return slot;
  };
  const panel = (item: unknown, path: string): number | null =>
    item === null ? null : documentSlot(item, path);
  let open: HeadCommandState['open'] = null;
  if (saved['open'] !== null) {
    const raw = object(saved['open'], 'snapshot.headCommands.open');
    const slot = documentSlot(raw['slot'], 'snapshot.headCommands.open.slot');
    const items =
      documents === undefined
        ? 0xff_ff
        : documentFor(documents, slot)!.items.length - 1;
    if (!held.includes(`object-slot-${slot}`)) {
      return fail('the open document is not carried');
    }
    open = {
      index: word(raw['index'], 'snapshot.headCommands.open.index'),
      item: integer(raw['item'], 'snapshot.headCommands.open.item', 0, items),
      slot
    };
  }
  const box = object(saved['box'], 'snapshot.headCommands.box');
  const steps = integer(
    box['steps'],
    'snapshot.headCommands.box.steps',
    0,
    TRANSITION_VBLS
  );
  const from = panel(box['from'], 'snapshot.headCommands.box.from');
  const to = panel(box['to'], 'snapshot.headCommands.box.to');
  // The box always heads for what is open, and once it has arrived it shows only that.
  if (to !== (open?.slot ?? null) || (steps === 0 && from !== to)) {
    return fail('the centre box and the open document disagree');
  }
  // A name is drawn only on a document panel that had arrived, and at rest it is the open one's.
  const fromItem =
    box['fromItem'] === null
      ? null
      : integer(
          box['fromItem'],
          'snapshot.headCommands.box.fromItem',
          0,
          from === null
            ? -1
            : documents === undefined
              ? 0xff_ff
              : documentFor(documents, from)!.items.length - 1
        );
  if (steps === 0 && fromItem !== null) {
    return fail('the centre box at rest carries an outgoing name');
  }
  const lastRead =
    saved['lastRead'] === null
      ? null
      : (() => {
          const raw = object(
            saved['lastRead'],
            'snapshot.headCommands.lastRead'
          );
          return {
            index: integer(
              raw['index'],
              'snapshot.headCommands.lastRead.index',
              0,
              0xff
            ),
            slot: documentSlot(
              raw['slot'],
              'snapshot.headCommands.lastRead.slot'
            )
          };
        })();
  return { box: { from, fromItem, steps, to }, lastRead, open };
};

const poolObjectOf = (
  value: unknown,
  path: string,
  counters: (counter: number) => boolean
): DamoclesSavePoolObject => {
  const record = object(value, path);
  const longs = (key: string, minimum: number, maximum: number) => {
    const items = array(record[key], `${path}.${key}`).map(item =>
      integer(item, `${path}.${key}[]`, minimum, maximum)
    );
    return items.length === 3
      ? ([items[0]!, items[1]!, items[2]!] as const)
      : fail(`${path}.${key} must hold three longs`);
  };
  const counter = integer(record['counter'], `${path}.counter`, 0, 0xff_ff);
  if (!counters(counter)) {
    return fail(`${path}.counter is not one the pool reaches`);
  }
  return {
    body: integer(record['body'], `${path}.body`, 0, 0xff),
    counter,
    position: longs('position', 0, 0xff_ff_ff_ff),
    velocity: longs('velocity', -0x80_00_00_00, 0x7f_ff_ff_ff)
  };
};

/// A shot flies 32 steps; the ship coasts from `$805A` down to `$8000`, holds at `$7FFF`, or has
/// never been placed or was downed (0).
const shotCounter = (counter: number): boolean => counter <= 0x20;
const shipCounter = (counter: number): boolean =>
  counter === 0 ||
  counter === 0x7f_ff ||
  (counter >= 0x80_00 && counter <= 0x80_5a);

const encounterOf = (value: unknown, gate: number): DamoclesSaveEncounter => {
  const encounter = object(value, 'snapshot.encounter');
  if (typeof encounter['dead'] !== 'boolean') {
    return fail('snapshot.encounter.dead must be a boolean');
  }
  const pool = object(encounter['pool'], 'snapshot.encounter.pool');
  const dead = encounter['dead'];
  // Only a zap kills, and it clears the gate as it does.
  if (dead && gate !== 0) {
    return fail('a dead player with the encounter gate armed');
  }
  return {
    dead,
    pool: {
      ship: poolObjectOf(
        pool['ship'],
        'snapshot.encounter.pool.ship',
        shipCounter
      ),
      shipShot: poolObjectOf(
        pool['shipShot'],
        'snapshot.encounter.pool.shipShot',
        shotCounter
      ),
      shot: poolObjectOf(
        pool['shot'],
        'snapshot.encounter.pool.shot',
        shotCounter
      )
    }
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
    // nibble. A Drop or leave rewrites it with a zone, so a saved Residence carries a zone
    // or the class the Catalogue authored (docs/research/damocles-placement-class.md).
    if (!admissiblePlacementClass(residence.placementClass, instance)) {
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
  readonly documents?: DamoclesDocuments;
  readonly poses?: ArrivalPoses;
  readonly strings?: DamoclesStrings;
}

/// Decode a Damocles Save or Session Resume, or throw the exact refusal.
///
/// Identity is exact: a Targ envelope, a schema older than 11, or a Catalogue or presentation
/// mismatch cannot become play without a migration this version does not have. A schema-11 or
/// schema-12 record is migrated to this one.
export const decodeDamoclesSave = (
  encoded: string,
  expected: DamoclesSaveIdentity,
  content: DamoclesSaveContent = {}
): DamoclesSaveRecord => {
  const { catalogue, documents, poses, strings } = content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return fail('not JSON');
  }
  const record = object(parsed, 'save');
  const schema11 = record['schemaVersion'] === 11;
  const schema12 = record['schemaVersion'] === 12;
  if (
    record['schemaVersion'] !== DAMOCLES_SAVE_SCHEMA_VERSION &&
    !MIGRATED_SCHEMA_VERSIONS.includes(record['schemaVersion'])
  ) {
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
  const bodyTurn = snapshot['bodyTurn'];
  if (
    !Number.isInteger(bodyTurn) ||
    (bodyTurn as number) < 0 ||
    (bodyTurn as number) > 0xff_ff_ff_ff
  ) {
    return fail('bodyTurn is not an unsigned longword');
  }
  const doorsMoving = snapshot['doorsMoving'];
  if (typeof doorsMoving !== 'boolean') {
    return fail('doorsMoving is not a boolean');
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
  let craft: DamoclesSaveCraft | null = null;
  if (!schema11) {
    if ((snapshot['craft'] === null) !== (occupancy.kind === 'onFoot')) {
      return fail('craft words and Occupancy disagree');
    }
    craft =
      snapshot['craft'] === null ? null : craftOf(snapshot['craft'], schema12);
  }
  const spaceMemory =
    schema11 || schema12 || snapshot['spaceMemory'] === null
      ? null
      : spaceMemoryOf(snapshot['spaceMemory'], catalogue);
  const angleBytes = schema11
    ? []
    : angleBytesOf(snapshot['angleBytes'], catalogue);
  const pose = poseOf(snapshot['pose']);
  if (catalogue !== undefined) {
    if (!catalogue.bodies.some(body => body.id === pose.body)) {
      return fail('pose names an unknown Body');
    }
    // A Body is standable where an admitted Pose anchors it, or where a landing from space
    // reaches it, whose surface is anchored at the Body's own origin (ADR 0052).
    if (
      poses !== undefined &&
      !admittedPoses(poses).some(item => item.body === pose.body) &&
      !landsOn(catalogue, pose.body)
    ) {
      return fail('pose names a Body no admitted Pose or landing reaches');
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
  const current = record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION;
  // Schema 16 is the first to carry the encounter.
  const encounterSaved = current || record['schemaVersion'] === 16;
  const script = scriptOf(
    snapshot['script'],
    { documents, strings },
    PRE_LANDING_SCHEMA_VERSIONS.includes(record['schemaVersion']),
    encounterSaved,
    current
  );
  const headCommands = current
    ? headCommandsOf(
        snapshot['headCommands'],
        [...carried, ...briefcaseStore],
        documents
      )
    : initialHeadCommands();
  // Null is the first world's pool with the player alive, which is also what a migrated record
  // resumes with.
  const encounter =
    encounterSaved && snapshot['encounter'] !== null
      ? encounterOf(snapshot['encounter'], script.encounter)
      : null;
  const footTicks =
    encounterSaved || record['schemaVersion'] === 15
      ? integer(snapshot['footTicks'], 'snapshot.footTicks', 0, 255)
      : 0;
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
      const latch = attachment['latch'];
      if (
        !attachmentSlot(slot) ||
        !Number.isInteger(openUnits) ||
        (openUnits as number) < 0 ||
        (openUnits as number) > 32_767 ||
        (latch !== 'closed' && latch !== 'moving' && latch !== 'open')
      ) {
        return fail('attachment state is outside its recovered bounds');
      }
      return {
        latch: latch as AttachmentLatch,
        openUnits: openUnits as number,
        slot
      };
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
      angleBytes,
      bodyTurn: bodyTurn as number,
      briefcaseStore,
      carried,
      craft,
      doorsMoving,
      elapsed: snapshot['elapsed'],
      encounter,
      footTicks,
      frameAccumulator,
      headCommands,
      occupancy,
      pendingBriefcaseDrop,
      pose,
      residence,
      script,
      scrollCounter,
      spaceMemory,
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
