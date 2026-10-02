import type { Catalogue } from '../catalogue/data.ts';
import {
  OPTION_MAXIMA,
  initialAuthorsComputer,
  type AuthorsComputer
} from './authorsComputer.ts';
import { NEW_GAME_CLOCK_LEVEL, type ClockAnchor } from './comet.ts';
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
  DETONATOR_BITS,
  NOVAGEN_SAFE_SLOT,
  TRANSITION_VBLS,
  initialHeadCommands,
  pagesNoItems,
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
  ANSWER_FRAMES,
  BALANCE_MODULUS,
  COMPUTER_TRIGGERS,
  DESTRUCTION_TRIGGERS,
  ENDING_TRIGGERS,
  LANDING_TRIGGERS,
  LOCATION_TRIGGERS,
  NEW_GAME_BALANCE,
  NO_KEY,
  OFFER_ACCEPTED_FLAG,
  OFFER_KEY_SLOT,
  OFFER_REWARDS,
  ORDINARY_DISPLAY_FRAMES,
  SCRIPTS,
  SCRIPT_FOR_TRIGGER,
  TOLOSA_VISITED_FLAG,
  TRIGGER_ARMING,
  TRIGGER_FOR_RESIDENT,
  WAIT_FROM_DOCUMENT,
  isScriptId,
  type Op,
  type ScriptId,
  type Step
} from './scripts.ts';
import type { AttachmentLatch } from './selection.ts';
import { landsOn } from './space.ts';
import { presentedText, type DamoclesStrings } from './strings.ts';
import {
  EXPLOSIVE_FIRST_SLOT,
  EXPLOSIVE_LAST_SLOT,
  FUSE_MAXIMUM,
  STRUCTURE_DAMAGE_ENTRIES,
  initialTimedDetonator,
  type BlastDoor,
  type StructureDamage,
  type TimedDetonator
} from './timedDetonator.ts';
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
///
/// Version 18 carries the run toggle `$7B3A`, which the run key latches and the run lamp shows.
/// Until then it was the page's, so a reload or an Atlas move dropped it. A schema-17 record or
/// older is migrated walking.
///
/// Version 19 carries the location triggers (#611): the State President's trigger 3 beside the
/// pickup and landing triggers, which the region walk fires on first entering the Eris STATE
/// OFFICE. A schema-18 record or older is migrated with it armed: no earlier port walked the
/// location table, so none spent it.
///
/// Version 20 carries the first offer (#612): trigger 4, the key latch `$7B61` a prompt reads,
/// the proposed reward `$00F9`, the accepted bit 0 of `$7BD8`, and the carried flag the
/// acceptance sets on DOOR KEY A. A Save taken at a prompt resumes polling it without asking
/// again. A schema-19 record or older is migrated with trigger 4 armed, an empty latch, no
/// reward and nothing accepted: no earlier port had the script.
/// Version 21 carries destroyed Bodies, the clock-zero latch and the comet drift anchor. A
/// schema-20 session had no destruction path, so it migrates with all Bodies alive.
///
/// Version 22 carries the BOOK's wishes (#625): the balance, record `$00F8`, the queued page
/// action in `$7B96`, the clock rate level `$7C1C` with where it last changed, the palette mask
/// `$7A50`, and the ending triggers. A schema-21 record or older is migrated with the reset's
/// 9,000 credits, level 6, no mask, and every ending armed: no earlier port wrote any of them.
/// Its `$0F` execution, if any, is moved past the 150-frame wait schema 22 adds at the front.
///
/// Version 23 carries the NOVABOMB (#627): the switch bits `$7872`, and the endings only the
/// body-destruction dispatcher fires, `$0E`, `$10`, `$11`, `$13`, `$1A` and `$1B`. The bomb's
/// Association B is its Object Residence, which the Save already carries, and a detonated bomb
/// is a removed resident. A schema-22 record or older is migrated with every switch off and
/// those endings armed: no earlier port could switch one or reach the dispatcher.
///
/// Version 24 carries the AUTHORS COMPUTER and the unravelling (#628): the option `$786C` and
/// its records at `$7C8C`, the panel mask `$7A52`, the view exponent `$7964`, the unravelling's
/// cursor `$7A8C`, and the triggers `$01` and `$2A`. The computer's Association B is its Object
/// Residence, and a removed computer is what the unravelling reads. The clock level and the
/// palette mask widen to whatever the computer's options can write. A schema-23 record or older
/// is migrated with the reset's records, no panel mask, exponent 8, the cursor on DAMOCLES and
/// both triggers armed.
///
/// Version 25 carries the TIMED DETONATOR's charge, fuse, armed EXPLOSIVE slot and deadline,
/// together with the NOVAGEN SAFE's blast gate. Schema 24 restores with no armed charge and a
/// shut safe.
///
/// Version 26 carries the structure damage table `$636A`, which the ST's Save range covers and
/// every workspace load replays, and the keyed door `$7A56`/`$7A58` the armed EXPLOSIVE was
/// dropped in. Schema 25 restores with an empty table and no door.
///
/// Version 27 carries the per-Body rotation origins used by the console's rate command to
/// preserve every Body's phase when changing speed. Older schemas use the Catalogue origins.
export const DAMOCLES_SAVE_SCHEMA_VERSION = 27 as const;
/// The older schemas a restore migrates rather than refuses.
const MIGRATED_SCHEMA_VERSIONS: readonly unknown[] = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26
];
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
  /// Slot 74, the last blast's centre: a destroyed Body's System-space centre, or where an
  /// EXPLOSIVE went off on its Body.
  readonly blastCentre?: {
    readonly body: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null;
  // Both continuation fields may be omitted together and are then normalized to empty;
  // partial omission is invalid. Since the schema-5 bump no shipped build writes a record
  // that omits them, so this leniency is now unreachable rather than load-bearing.
  /// The current Body's rotation accumulator (`$62EA + 4 * body`), one turn every `$04000000`.
  readonly bodyTurn: number;
  /// Rotation origins at the last console rate change, or null for the Catalogue origins.
  readonly bodyTurnOrigins?: readonly number[] | null;
  readonly briefcaseStore: readonly string[];
  readonly carried: readonly string[];
  /// `$7C1C`'s last change: where the impact clock stood, and when. Null at the reset's level.
  readonly clockAnchor?: ClockAnchor | null;
  /// `$7C1C`, the clock rate level.
  readonly clockLevel?: number;
  /// The AUTHORS COMPUTER's option and records.
  readonly computer?: AuthorsComputer;
  /// The craft Mover's words aboard, or null on foot. A migrated schema-11 record aboard has
  /// none, and the session seats it at the boarding preset.
  readonly craft: DamoclesSaveCraft | null;
  /// `$7834`: passes left of the marker's debris spray.
  readonly debrisPasses?: number;
  /// Body ids whose `$626A` word has bit 15 set, in destruction order.
  readonly destroyedBodies?: readonly string[];
  /// `$5A9D9`: whether any door moved on the last pass.
  readonly doorsMoving: boolean;
  /// `$7A7E`, the drift anchor, null while no ending has armed it.
  readonly drift?: number | null;
  readonly elapsed: number;
  /// The TOLOSA encounter, or null for the first world's pool with the player alive, as a
  /// migrated record resumes with.
  readonly encounter: DamoclesSaveEncounter | null;
  /// On foot, ticks since the last main-loop pass, below `time.ticksPerPassOnFoot` (ADR 0054).
  readonly footTicks: number;
  readonly frameAccumulator: number;
  /// The open document and the centre box, as a migrated record resumes with none open.
  readonly headCommands: HeadCommandState;
  /// `$7A82`, raised after the waypoint table runs out.
  readonly impactPassed?: boolean;
  readonly occupancy: DamoclesSaveOccupancy;
  /// `$7A50`, the palette XOR mask.
  readonly paletteMask?: number;
  /// `$7A52`, the Benson Panel's palette mask.
  readonly panelMask?: number;
  readonly pendingBriefcaseDrop: {
    readonly head: string;
    readonly residence: PlacedResidence;
  } | null;
  readonly pose: Pose;
  /// Resident slots removed by the marker when their Association B named a destroyed Body.
  readonly removedResidents?: readonly string[];
  readonly residence: readonly ResidenceDeparture[];
  /// The run toggle, as a migrated record resumes with it off.
  readonly running: boolean;
  /// `$7A60`, the NOVAGEN SAFE's blast gate, as a migrated record resumes with it shut.
  readonly safeGate?: boolean;
  readonly script: DamoclesSaveScript;
  readonly scrollCounter: number;
  /// The pitch rate, nearest Body and range, or null for the first world's, as a migrated record
  /// resumes with.
  readonly spaceMemory: DamoclesSaveSpaceMemory | null;
  readonly structure: BoundStructureSnapshot | null;
  /// `$636A`, the structure damage table, as a migrated record resumes with it empty.
  readonly structureDamage?: readonly StructureDamage[];
  /// `$7872`, the switch bits: only the four detonators', bits 3 to 6, are ported.
  readonly switches?: number;
  /// The TIMED DETONATOR's charge and fuse and the EXPLOSIVE it armed, as a migrated record
  /// resumes with the reset's.
  readonly timedDetonator?: TimedDetonator;
  /// `$7A8C`, the unravelling's next Body index, -1 once past DIALIS.
  readonly unravelCursor?: number;
  /// `$7964`'s high word, the projection's scale exponent.
  readonly viewExponent?: number;
}

/// What the player is inside, as the session's own Occupancy says it. Aboard, the Pose is the
/// seated view and the occupied instance's Object Residence departure is `occupied`.
export type DamoclesSaveOccupancy =
  | { readonly kind: 'onFoot' }
  | { readonly instance: string; readonly kind: 'aboard' };

export interface DamoclesSaveScript {
  /// Record `$00F8`, the balance, as twelve packed-decimal digits.
  readonly balance: number;
  /// The slots whose carried flag a script set: the first offer's DOOR KEY A.
  readonly carried: readonly number[];
  readonly counter: number;
  readonly display: DamoclesDisplay;
  /// Bank word `$070102`, which the shared epilogue moves and restores.
  readonly displayDuration: number;
  /// Bank word `$070104`, the encounter gate.
  readonly encounter: number;
  readonly execution: Execution | null;
  /// `$7BD8` without the busy bit.
  readonly flags: number;
  /// `$7B61`, the key latch, `$FF` when empty.
  readonly key: number;
  readonly message: Presenting | null;
  /// The noise pointer `$7E18` as a word index.
  readonly noise: number;
  /// `$7A88`, the one queued trigger index.
  readonly pending: number | null;
  /// `$7B96`: the document body a Read has queued and the dispatch head has not yet presented.
  readonly read: DocumentMessageId | null;
  /// Record `$00F9`'s first BCD word, the first offer's proposed reward.
  readonly reward: number;
  readonly triggers: readonly {
    readonly armed: boolean;
    readonly index: number;
  }[];
  /// `$7B96` = `$8000`: a page action queued behind a Read of the BOOK.
  readonly wish: boolean;
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
    balance: script.balance,
    carried: script.carried,
    counter: script.counter,
    display: script.display,
    displayDuration: script.displayDuration,
    encounter: script.encounter,
    execution: script.execution,
    flags: script.flags,
    key: script.key,
    message: script.message,
    noise: script.noise,
    pending: script.pending,
    read: script.read,
    reward: script.reward,
    triggers: script.triggers.map(({ armed, index }) => ({ armed, index })),
    wish: script.wish,
    zaps: script.zaps
  };
};

const word = (value: unknown, path: string): number =>
  integer(value, path, 0, 0xff_ff);
const byte = (value: unknown, path: string): number =>
  integer(value, path, 0, 0xff);

/// `$7A56`/`$7A58`: an attachment slot `$000`–`$3FC`, a key's object slot and a Floor.
const blastDoorOf = (
  raw: Record<string, unknown>,
  path: string
): BlastDoor => ({
  key: byte(raw['key'], `${path}.key`),
  level: byte(raw['level'], `${path}.level`),
  slot: integer(raw['slot'], `${path}.slot`, 0, 0x3_fc)
});

/// One six-byte `$636A` entry. A word of 0 or with bit 15 set is all the blast writes.
const structureDamageOf = (value: unknown, path: string): StructureDamage => {
  const raw = object(value, path);
  const entry = {
    cell: byte(raw['cell'], `${path}.cell`),
    door: byte(raw['door'], `${path}.door`),
    group: byte(raw['group'], `${path}.group`),
    level: byte(raw['level'], `${path}.level`),
    word: word(raw['word'], `${path}.word`)
  };
  if (entry.word !== 0 && (entry.word & 0x80_00) === 0) {
    return fail(`${path}.word is neither 0 nor a door's`);
  }
  return entry;
};
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
/// are the landing scripts' (#576), the State President's (#611) and the first offer's (#612).
const messageIds = new Set<DamoclesMessageId>([
  ...LANDING_MESSAGE_IDS,
  ...Array.from(
    { length: 10 },
    (_, index) => `script15-inline-${index + 1}` as DamoclesMessageId
  ),
  'script11-inline-1',
  'script11-inline-2',
  'script2-inline-1',
  'script2-inline-2',
  'script2-inline-3',
  'script20-inline-1',
  'script3-inline-1',
  'script3-inline-2',
  'script3-inline-3',
  'script3-inline-4',
  'script3-inline-5',
  'script3-inline-6',
  'script4-inline-1',
  'script4-inline-2',
  'script4-inline-3',
  'script4-inline-4',
  'script4-inline-5',
  'script4-inline-6',
  'script4-inline-7',
  'script4-inline-8',
  'script4-inline-9',
  'script4-inline-10',
  'script4-inline-11',
  'script4-inline-12',
  'script4-inline-13',
  'script4-inline-14',
  'script4-inline-15',
  'script4-inline-16',
  'script4-inline-17',
  'script4-inline-18',
  'script4-inline-19',
  'script4-inline-20',
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
  'system-string-35',
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
/// Every trigger a schema-14 to schema-18 record carries, pickups and landings.
const LANDED_TRIGGERS: readonly number[] = [
  ...PICKUP_TRIGGERS,
  ...LANDING_TRIGGERS
];
/// Every trigger a schema-19 record carries: the State President's beside those.
const WELCOMED_TRIGGERS: readonly number[] = [...LANDED_TRIGGERS, 3];
/// Every trigger a current record carries: pickups, landings and location triggers.
const SAVED_TRIGGERS: readonly number[] = [
  ...LANDED_TRIGGERS,
  ...LOCATION_TRIGGERS
];
/// Every trigger a schema-21 record carries: the clock's `$0F` beside those.
const IMPACT_TRIGGERS: readonly number[] = [...SAVED_TRIGGERS, 15];
/// Every trigger a schema-22 record carries: the endings the BOOK fires beside those.
const WISHED_TRIGGERS: readonly number[] = [
  ...IMPACT_TRIGGERS,
  ...ENDING_TRIGGERS
];
/// Every trigger a schema-23 record carries: the dispatcher's endings beside those.
const DESTROYED_TRIGGERS: readonly number[] = [
  ...WISHED_TRIGGERS,
  ...DESTRUCTION_TRIGGERS
];
/// Every trigger a current record carries: the computer's beside those.
const COMPUTED_TRIGGERS: readonly number[] = [
  ...DESTROYED_TRIGGERS,
  ...COMPUTER_TRIGGERS
];
/// The steps schema 22 put in front of `$0F`'s script: its 150-frame wait.
const IMPACT_WAIT_STEPS = 2;
/// `$0F`'s revision before the wait was recovered.
const UNWAITED_IMPACT_REVISION = 1;
const IMPACT_SCRIPT: ScriptId = 'damocles.script.slot-15';

/// A step is an index into a script's recovered operation list, and a suspended execution may
/// only name a step the interpreter can actually stop on. `runToBlock` returns in exactly three
/// places: immediately after a `message` op, while that message presents, *on* a `poll-wait`
/// op, while its counter is below the threshold, and on a prompt's first key test, where its
/// `if-wait` loops back to read the keys again on the next frame.
/// Whether `step` is a prompt's first key test, which follows its `reset-wait`.
const answering = (ops: readonly Op[], step: Step): boolean =>
  ops[step]?.kind === 'if-key' && ops[step - 1]?.kind === 'reset-wait';

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
    answering(ops, step) ||
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

/// A schema-21 `$0F` step, moved past the wait schema 22 put in front of it.
const unwaited = (script: ScriptId, step: unknown, waitAdded: boolean) =>
  waitAdded && script === IMPACT_SCRIPT && Number.isInteger(step)
    ? (step as number) + IMPACT_WAIT_STEPS
    : step;

const frameOf = (value: unknown, path: string, waitAdded: boolean): Frame => {
  const frame = object(value, path);
  const script = frame['script'];
  if (!isScriptId(script)) {
    return fail(`${path} names an unknown Damocles Script`);
  }
  const step = unwaited(script, frame['step'], waitAdded);
  if (!blockingStep(script, step as Step)) {
    return fail(`${path} is not a reachable continuation`);
  }
  return { script, step: step as Step };
};

const executionOf = (value: unknown, waitAdded: boolean): Execution | null => {
  if (value === null) {
    return null;
  }
  const execution = object(value, 'snapshot.script.execution');
  const script = execution['script'];
  if (!isScriptId(script)) {
    return fail('script execution names an unknown Damocles Script');
  }
  const revision =
    waitAdded &&
    script === IMPACT_SCRIPT &&
    execution['revision'] === UNWAITED_IMPACT_REVISION
      ? SCRIPTS[script].revision
      : execution['revision'];
  if (revision !== SCRIPTS[script].revision) {
    return fail('script execution identity, revision or step is incompatible');
  }
  const step = unwaited(script, execution['step'], waitAdded);
  if (!blockingStep(script, step as Step)) {
    return fail('script execution identity, revision or step is incompatible');
  }
  const returnStack = array(
    execution['returnStack'],
    'snapshot.script.execution.returnStack'
  ).map((frame, index) =>
    frameOf(frame, `snapshot.script.execution.returnStack[${index}]`, waitAdded)
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
  current: boolean,
  locationSaved: boolean,
  offerSaved: boolean,
  impactSaved: boolean,
  wishSaved: boolean,
  destructionSaved: boolean,
  computerSaved: boolean
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
  const execution = executionOf(script['execution'], impactSaved && !wishSaved);
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
  const expected = computerSaved
    ? COMPUTED_TRIGGERS
    : destructionSaved
      ? DESTROYED_TRIGGERS
      : wishSaved
        ? WISHED_TRIGGERS
        : impactSaved
          ? IMPACT_TRIGGERS
          : migrated
            ? PICKUP_TRIGGERS
            : offerSaved
              ? SAVED_TRIGGERS
              : locationSaved
                ? WELCOMED_TRIGGERS
                : LANDED_TRIGGERS;
  if (
    new Set(triggers.map(trigger => trigger.index)).size !== triggers.length ||
    triggers.length !== expected.length ||
    expected.some(index => !triggers.some(trigger => trigger.index === index))
  ) {
    return fail('script trigger table is incomplete or duplicated');
  }
  // Before schema 14 no landing had spent a trigger, before schema 19 no location trigger had,
  // and before schema 20 the first offer's had not, so each a record lacks migrates armed.
  const table = TRIGGER_ARMING.map(
    ({ index }) =>
      triggers.find(trigger => trigger.index === index) ?? {
        armed: true,
        index
      }
  );
  const flags = migrated
    ? 0
    : integer(script['flags'], 'snapshot.script.flags', 0, 0xff_ff);
  if ((flags & ~(TOLOSA_VISITED_FLAG | OFFER_ACCEPTED_FLAG)) !== 0) {
    return fail('script flags name a bit no ported script writes');
  }
  const key = offerSaved
    ? integer(script['key'], 'snapshot.script.key', 0, 0xff)
    : NO_KEY;
  const reward = offerSaved
    ? integer(script['reward'], 'snapshot.script.reward', 0, 0xff_ff)
    : 0;
  const balance = wishSaved
    ? integer(
        script['balance'],
        'snapshot.script.balance',
        0,
        BALANCE_MODULUS - 1
      )
    : NEW_GAME_BALANCE;
  const wish = wishSaved ? script['wish'] : false;
  if (typeof wish !== 'boolean') {
    return fail('snapshot.script.wish is not a boolean');
  }
  // Both are `$7B96`: a Read queued, or the page action a presented Read queued.
  if (wish && read !== null) {
    return fail('snapshot.script.wish and read share one word');
  }
  if (reward !== 0 && !(OFFER_REWARDS as readonly number[]).includes(reward)) {
    return fail('snapshot.script.reward is no offer the first offer makes');
  }
  const carried = offerSaved
    ? array(script['carried'], 'snapshot.script.carried').map(slot =>
        integer(slot, 'snapshot.script.carried[]', 0, 0xff)
      )
    : [];
  if (carried.some(slot => slot !== OFFER_KEY_SLOT) || carried.length > 1) {
    return fail('snapshot.script.carried names a flag no ported script sets');
  }
  // Only the first offer writes the reward and the accepted bit, and its trigger is spent as it
  // launches. The carried flag is set just after the bit, so it needs it; a take or a drop can
  // settle the flag again, so the bit does not need the flag.
  const offerArmed = table.find(trigger => trigger.index === 4)?.armed ?? true;
  if (offerArmed && (reward !== 0 || (flags & OFFER_ACCEPTED_FLAG) !== 0)) {
    return fail('the first offer is armed but has already been made');
  }
  if (carried.length > 0 && (flags & OFFER_ACCEPTED_FLAG) === 0) {
    return fail(
      'DOOR KEY A is flagged carried but the offer was never accepted'
    );
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
  if (
    pending !== null &&
    ((TRIGGER_ARMING.find(item => item.index === pending)?.byte ?? 0) &
      0x20) ===
      0
  ) {
    return fail('script pending trigger is not a queueable trigger');
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
    } else if (step?.kind === 'poll-wait' || answering(ops, execution.step)) {
      // A prompt loops back while its counter is below 500, so a saved poll is below it.
      const threshold =
        step?.kind !== 'poll-wait'
          ? ANSWER_FRAMES
          : step.frames === WAIT_FROM_DOCUMENT
            ? 200
            : step.frames;
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
      'system-string-35',
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
    balance,
    carried,
    counter,
    display,
    displayDuration,
    encounter,
    execution,
    flags,
    key,
    message,
    noise,
    pending,
    read,
    reward,
    triggers: table,
    wish,
    zaps
  };
};

/// The open document and the centre box. The open object is the one Open found at the head, and
/// only a drop closes it, so it is carried still, or packed in the briefcase with the drop that
/// stored it (`$054686` compares only the object dropped).
const headCommandsOf = (
  value: unknown,
  held: readonly string[],
  documents: DamoclesDocuments | undefined,
  safeGate: boolean
): HeadCommandState => {
  const saved = object(value, 'snapshot.headCommands');
  const documentSlot = (item: unknown, path: string): number => {
    const slot = integer(item, path, 0, 0xff);
    if (
      (slot === NOVAGEN_SAFE_SLOT && !safeGate) ||
      (documents !== undefined && documentFor(documents, slot) === undefined)
    ) {
      return fail(`${path} names no document the Open table opens`);
    }
    return slot;
  };
  // A switch's panel opens as a document's does, and its index and item stay 0.
  const panelSlot = (item: unknown, path: string): number => {
    const slot = integer(item, path, 0, 0xff);
    return pagesNoItems(slot) ? slot : documentSlot(slot, path);
  };
  const lastItem = (slot: number): number =>
    pagesNoItems(slot)
      ? 0
      : documents === undefined
        ? 0xff_ff
        : documentFor(documents, slot)!.items.length - 1;
  const panel = (item: unknown, path: string): number | null =>
    item === null ? null : panelSlot(item, path);
  let open: HeadCommandState['open'] = null;
  if (saved['open'] !== null) {
    const raw = object(saved['open'], 'snapshot.headCommands.open');
    const slot = panelSlot(raw['slot'], 'snapshot.headCommands.open.slot');
    const items = lastItem(slot);
    if (!held.includes(`object-slot-${slot}`)) {
      return fail('the open document is not carried');
    }
    const index = word(raw['index'], 'snapshot.headCommands.open.index');
    if (pagesNoItems(slot) && index !== 0) {
      return fail('an open switch, computer or TIMED DETONATOR pages no index');
    }
    open = {
      index,
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
          from === null ? -1 : lastItem(from)
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
  const impactRecord =
    record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION ||
    record['schemaVersion'] === 26 ||
    record['schemaVersion'] === 25 ||
    record['schemaVersion'] === 24 ||
    record['schemaVersion'] === 23 ||
    record['schemaVersion'] === 22 ||
    record['schemaVersion'] === 21;
  const destroyedBodies = impactRecord
    ? array(snapshot['destroyedBodies'], 'snapshot.destroyedBodies').map(
        value =>
          typeof value === 'string' && /^body-(?:\d|[12]\d)$/.test(value)
            ? value
            : fail('destroyed Body id is invalid')
      )
    : [];
  if (new Set(destroyedBodies).size !== destroyedBodies.length) {
    return fail('destroyed Bodies are duplicated');
  }
  const debrisPasses = impactRecord
    ? integer(
        snapshot['debrisPasses'],
        'snapshot.debrisPasses',
        // Schema 25 is the first whose counter can hold a pending blast, −1.
        record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION ||
          record['schemaVersion'] === 26 ||
          record['schemaVersion'] === 25
          ? -1
          : 0,
        64
      )
    : 0;
  let blastCentre: {
    readonly body: string;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null = null;
  if (impactRecord && snapshot['blastCentre'] !== null) {
    const centre = object(snapshot['blastCentre'], 'snapshot.blastCentre');
    if (
      typeof centre['body'] !== 'string' ||
      !/^body-\d+$/.test(centre['body']) ||
      !finite(centre['x']) ||
      !finite(centre['y']) ||
      !finite(centre['z'])
    ) {
      return fail('blast centre is invalid');
    }
    blastCentre = {
      body: centre['body'],
      x: centre['x'],
      y: centre['y'],
      z: centre['z']
    };
  }
  if (debrisPasses > 0 && blastCentre === null) {
    return fail('debris has no blast centre');
  }
  const drift = impactRecord ? snapshot['drift'] : null;
  if (
    drift !== null &&
    (!Number.isInteger(drift) ||
      (drift as number) < -0x80_00_00_00 ||
      (drift as number) > 0x7f_ff_ff_ff)
  ) {
    return fail('comet drift is outside its recovered bounds');
  }
  const impactPassed = impactRecord ? snapshot['impactPassed'] : false;
  if (typeof impactPassed !== 'boolean') {
    return fail('impact latch is invalid');
  }
  const removedResidents = impactRecord
    ? array(snapshot['removedResidents'], 'snapshot.removedResidents').map(
        value =>
          typeof value === 'string' && value.length > 0
            ? value
            : fail('removed resident id is invalid')
      )
    : [];
  if (
    new Set(removedResidents).size !== removedResidents.length ||
    (catalogue !== undefined &&
      removedResidents.some(
        id => !catalogue.instances.some(item => item.id === id)
      ))
  ) {
    return fail('removed resident list is invalid');
  }
  const wishRecord =
    record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION ||
    record['schemaVersion'] === 26 ||
    record['schemaVersion'] === 25 ||
    record['schemaVersion'] === 24 ||
    record['schemaVersion'] === 23 ||
    record['schemaVersion'] === 22;
  const clockLevel = wishRecord ? snapshot['clockLevel'] : NEW_GAME_CLOCK_LEVEL;
  // Page 4 moves the level to 8, and the computer's option 3 anywhere from 0 to 10.
  if (
    !Number.isInteger(clockLevel) ||
    (clockLevel as number) < 0 ||
    (clockLevel as number) > OPTION_MAXIMA[3]!
  ) {
    return fail('clock rate level is no level a ported writer sets');
  }
  let clockAnchor: ClockAnchor | null = null;
  if (wishRecord && snapshot['clockAnchor'] !== null) {
    const anchor = object(snapshot['clockAnchor'], 'snapshot.clockAnchor');
    if (
      !finite(anchor['clock']) ||
      !finite(anchor['elapsed']) ||
      anchor['elapsed'] > snapshot['elapsed']
    ) {
      return fail('clock anchor is invalid');
    }
    clockAnchor = { clock: anchor['clock'], elapsed: anchor['elapsed'] };
  }
  // The anchor is written on the level's first change, and the computer can move it back.
  if (clockAnchor === null && clockLevel !== NEW_GAME_CLOCK_LEVEL) {
    return fail('clock anchor and rate level disagree');
  }
  // A mask is `$213` or the computer's spread of a 9-bit value: ST `0RGB` either way.
  const stMask = (value: unknown, path: string): number => {
    const mask = integer(value, path, 0, 0x7_77);
    return (mask & ~0x7_77) === 0
      ? mask
      : fail(`${path} is no mask a ported writer sets`);
  };
  const paletteMask = wishRecord
    ? stMask(snapshot['paletteMask'], 'snapshot.paletteMask')
    : 0;
  const computerRecord =
    record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION ||
    record['schemaVersion'] === 26 ||
    record['schemaVersion'] === 25 ||
    record['schemaVersion'] === 24;
  const switches =
    computerRecord || record['schemaVersion'] === 23
      ? integer(snapshot['switches'], 'snapshot.switches', 0, 0xff)
      : 0;
  let computer = initialAuthorsComputer();
  if (computerRecord) {
    const raw = object(snapshot['computer'], 'snapshot.computer');
    const values = array(raw['values'], 'snapshot.computer.values').map(
      (value, index) =>
        integer(
          value,
          `snapshot.computer.values[${index}]`,
          0,
          OPTION_MAXIMA[index] ?? -1
        )
    );
    if (values.length !== OPTION_MAXIMA.length) {
      return fail('snapshot.computer.values must hold five records');
    }
    computer = {
      option: integer(raw['option'], 'snapshot.computer.option', 0, 4),
      values
    };
  }
  const panelMask = computerRecord
    ? stMask(snapshot['panelMask'], 'snapshot.panelMask')
    : 0;
  const viewExponent = computerRecord
    ? integer(
        snapshot['viewExponent'],
        'snapshot.viewExponent',
        0,
        OPTION_MAXIMA[2]!
      )
    : 8;
  const unravelCursor = computerRecord
    ? integer(snapshot['unravelCursor'], 'snapshot.unravelCursor', -1, 29)
    : 29;
  // Only the four detonators are ported switches.
  if ((switches & ~DETONATOR_BITS) !== 0) {
    return fail('switch bits name a switch the port does not open');
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
  const bodyTurnOrigins =
    record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION
      ? (snapshot['bodyTurnOrigins'] ?? null)
      : null;
  if (
    bodyTurnOrigins !== null &&
    (!Array.isArray(bodyTurnOrigins) ||
      bodyTurnOrigins.length !== (catalogue?.craft?.bodies.length ?? 30) ||
      bodyTurnOrigins.some(
        turn => !Number.isInteger(turn) || turn < 0 || turn > 0xff_ff_ff_ff
      ))
  ) {
    return fail('bodyTurnOrigins is not a Body table of unsigned longwords');
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
  // Schema 23 is the first to carry the dispatcher's endings.
  const destructionSaved = computerRecord || record['schemaVersion'] === 23;
  // Schema 22 is the first to carry the BOOK's wishes, and 21 the impact.
  const wishSaved = destructionSaved || record['schemaVersion'] === 22;
  const impactSaved = wishSaved || record['schemaVersion'] === 21;
  const offerSaved = impactSaved || record['schemaVersion'] === 20;
  // Schema 19 is the first to carry the location triggers.
  const locationSaved = offerSaved || record['schemaVersion'] === 19;
  // Schema 18 is the first to carry the run toggle.
  const runSaved = locationSaved || record['schemaVersion'] === 18;
  // Schema 17 is the first to carry the document mode.
  const documentsSaved = runSaved || record['schemaVersion'] === 17;
  // Schema 16 is the first to carry the encounter.
  const encounterSaved = documentsSaved || record['schemaVersion'] === 16;
  const script = scriptOf(
    snapshot['script'],
    { documents, strings },
    PRE_LANDING_SCHEMA_VERSIONS.includes(record['schemaVersion']),
    encounterSaved,
    documentsSaved,
    locationSaved,
    offerSaved,
    impactSaved,
    wishSaved,
    destructionSaved,
    computerRecord
  );
  const running = runSaved ? snapshot['running'] : false;
  if (typeof running !== 'boolean') {
    return fail('running is not a boolean');
  }
  // Schema 26 is the first to carry the damage table and the blast's door.
  const damageSaved =
    record['schemaVersion'] === DAMOCLES_SAVE_SCHEMA_VERSION ||
    record['schemaVersion'] === 26;
  // Schema 25 is the first to carry the TIMED DETONATOR and the safe gate.
  const timedDetonatorSaved = damageSaved || record['schemaVersion'] === 25;
  const safeGate = timedDetonatorSaved ? snapshot['safeGate'] : false;
  if (typeof safeGate !== 'boolean') {
    return fail('snapshot.safeGate is not a boolean');
  }
  let timedDetonator = initialTimedDetonator();
  if (timedDetonatorSaved) {
    const raw = object(snapshot['timedDetonator'], 'snapshot.timedDetonator');
    const truth = (value: unknown, path: string): boolean =>
      typeof value === 'boolean' ? value : fail(`${path} is not a boolean`);
    const slot =
      raw['slot'] === null
        ? null
        : integer(
            raw['slot'],
            'snapshot.timedDetonator.slot',
            EXPLOSIVE_FIRST_SLOT,
            EXPLOSIVE_LAST_SLOT
          );
    const door = damageSaved ? raw['door'] : null;
    timedDetonator = {
      armed: truth(raw['armed'], 'snapshot.timedDetonator.armed'),
      charge: integer(raw['charge'], 'snapshot.timedDetonator.charge', 0, 9),
      deadline: word(raw['deadline'], 'snapshot.timedDetonator.deadline'),
      door:
        door === null
          ? null
          : blastDoorOf(
              object(door, 'snapshot.timedDetonator.door'),
              'snapshot.timedDetonator.door'
            ),
      fuse: integer(
        raw['fuse'],
        'snapshot.timedDetonator.fuse',
        0,
        FUSE_MAXIMUM
      ),
      regionBlast: truth(
        raw['regionBlast'],
        'snapshot.timedDetonator.regionBlast'
      ),
      slot
    };
    if ((timedDetonator.armed || debrisPasses < 0) && slot === null) {
      return fail('snapshot.timedDetonator arms no EXPLOSIVE');
    }
  }
  const structureDamage = damageSaved
    ? array(snapshot['structureDamage'], 'snapshot.structureDamage').map(
        (value, index) =>
          structureDamageOf(value, `snapshot.structureDamage[${index}]`)
      )
    : [];
  if (structureDamage.length > STRUCTURE_DAMAGE_ENTRIES) {
    return fail('snapshot.structureDamage holds more than nine entries');
  }
  const headCommands = documentsSaved
    ? headCommandsOf(
        snapshot['headCommands'],
        [...carried, ...briefcaseStore],
        documents,
        safeGate
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
      blastCentre,
      bodyTurn: bodyTurn as number,
      bodyTurnOrigins: bodyTurnOrigins as readonly number[] | null,
      briefcaseStore,
      carried,
      clockAnchor,
      clockLevel: clockLevel as number,
      computer,
      craft,
      debrisPasses,
      destroyedBodies,
      doorsMoving,
      drift: drift as number | null,
      elapsed: snapshot['elapsed'],
      encounter,
      footTicks,
      frameAccumulator,
      headCommands,
      impactPassed,
      occupancy,
      paletteMask,
      panelMask,
      pendingBriefcaseDrop,
      pose,
      removedResidents,
      residence,
      running,
      safeGate,
      script,
      scrollCounter,
      spaceMemory,
      structure,
      structureDamage,
      switches,
      timedDetonator,
      unravelCursor,
      viewExponent
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
