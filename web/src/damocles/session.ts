import {
  instanceById,
  modelSummaryById,
  type Catalogue,
  type EntranceAttachment
} from '../catalogue/data.ts';
import type { ModelStore } from '../catalogue/modelStore.ts';
import { IDLE, MAXIMUM_STEP, type Intent } from '../gameCore/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { TitleSession } from '../shell/title.ts';
import { handoverElapsed } from './comet.ts';
import {
  NO_BOXES,
  STICK_DOWN,
  STICK_LEFT,
  STICK_RIGHT,
  STICK_UP,
  bindBoxes,
  craftFrame,
  craftProgram,
  launch,
  throttleDown,
  throttleForEntry,
  throttleUp,
  type BoundBoxes,
  type CraftProgram,
  type CraftState
} from './craft.ts';
import {
  displayCells,
  type DamoclesDisplay,
  type DamoclesMessageId,
  type DisplayCells
} from './display.ts';
import type { ErisPresentationDocument } from './documents.ts';
import {
  encounterPass,
  encounterProgram,
  poolObjectShown,
  type EncounterProgram,
  type Pool,
  type PoolObject
} from './encounter.ts';
import { classifyPosition, type LandSea } from './islands.ts';
import { walk, type WalkRules } from './mover.ts';
import {
  poseOfArrival,
  resolvePose,
  type ArrivalPoses,
  type PoseResolution
} from './poses.ts';
import {
  admissiblePlacementClass,
  catalogueResidence,
  insertionsInRegion,
  placementZone,
  validStructureResidence,
  type PlacedResidence,
  type Residence,
  type ResidenceDeparture
} from './residence.ts';
import {
  LIFT_STEP_TICKS,
  validateOccupancy,
  type BoundStructureSnapshot,
  type DamoclesSaveCraft,
  type DamoclesSaveOccupancy,
  type DamoclesSaveScript,
  type DamoclesSaveSnapshot,
  type LiftRideSnapshot
} from './save.ts';
import {
  fireTrigger,
  initialScriptState,
  presentSystemMessage,
  runFrame,
  stepNoise,
  zapNoise,
  type Effect,
  type Presenting,
  type ScriptRules,
  type ScriptState,
  type SystemMessageId
} from './script.ts';
import {
  SCRIPT_FOR_TRIGGER,
  TRIGGER_ARMING,
  TRIGGER_FOR_RESIDENT
} from './scripts.ts';
import {
  attachmentOpenLimit,
  clampStructureStep,
  insideLocalBox,
  regionIsEnclosed,
  stepAttachment,
  structureLocalPosition,
  structureRegionAt,
  type AttachmentLatch,
  type AttachmentState
} from './selection.ts';
import {
  enterSpace,
  land,
  landingPoint,
  landingTrigger,
  landsOn,
  spaceAltitude,
  spaceFrame,
  subStellarLongitude,
  type SpaceFrame,
  type SpaceMemory,
  type SpaceState
} from './space.ts';
import { presentedText, type DamoclesStrings } from './strings.ts';
import { advanceTurn, inDaylight, turnOnClock } from './terminator.ts';
import {
  SURFACE_CELLS,
  bearingFromYaw,
  cellOf,
  erisSurfaceFrom,
  floorModelId,
  floorPlacement,
  floorsOf,
  insideCentralCellHalf,
  islandLocalCell,
  modelWaves,
  nearestIsland,
  pitchFromWord,
  placementHeading,
  startPose,
  structureInCell,
  type ErisCell,
  type ErisIsland,
  type ErisPlacement,
  type ErisSurface,
  type Pose
} from './world.ts';

/// What the Damocles Gameplay Session can say about itself in this slice.
///
/// The player is on foot on one admitted Body, or aboard one resident object there, which the
/// craft Mover drives and flies on the Body's surface (#556, ADR 0051). Object Residence, the head-significant Carried Stack, live inventory capacity,
/// Occupancy and the bounded Damocles Script are session-owned state; the renderer receives only
/// their immutable projection.
export interface DamoclesSnapshot {
  /// The Catalogue name of the Body the player is standing on. Published because the panel and
  /// the console both name the location, and both said ERIS whatever Body a switch had reached.
  readonly bodyName: string;
  /// The current Body's rotation accumulator (`$62EA + 4 * body`), one turn every `$04000000`.
  readonly bodyTurn: number;
  readonly briefcaseStore: readonly string[];
  readonly capacity: number;
  readonly carried: readonly string[];
  readonly cell: ErisCell;
  /// The craft words aboard, or null on foot (ADR 0051). `held` names a gate the port has no
  /// rule for: the craft stops there rather than run an invented one.
  readonly craft: DamoclesCraftSnapshot | null;
  /// The terminator's answer for the Pose (`$050562`): the sky takes the Body's day word and
  /// every `$80xx` colour the scene palette's day half (#494, #497).
  readonly daylight: boolean;
  readonly display: DamoclesDisplay;
  readonly displayCells: DisplayCells;
  readonly elapsed: number;
  /// Bank word `$070104`, the encounter gate TOLOSA's landing script arms (#576). The panel's
  /// second lamp `$050A5C` reads it.
  readonly encounter: number;
  readonly frameAccumulator: number;
  readonly inventoryLabel: string;
  /// The Damocles Island the Cell Readout is counted from, or null on a Body that carries no
  /// island record. An Island-Local Cell names a location only together with this record: the
  /// same label on two islands is two different places.
  readonly island: ErisIsland | null;
  /// Where the player stands as an Island-Local Cell: signed, unbounded, and the same as `cell`
  /// only while the player is inside the bound workspace's own 16-cell window. It falls back to
  /// `cell` on a Body with no island record.
  readonly islandCell: ErisCell;
  /// Where the player stands against `island`: on its core, elsewhere on it, or at sea. The
  /// renderer reads it to colour the ground plane, and leaving refuses on its `sea` answer. The
  /// coast a player cannot walk across is the same answer, and is not wired yet (#394).
  readonly landSea: LandSea;
  readonly message: Presenting | null;
  readonly occupancy: DamoclesOccupancy;
  readonly pose: Pose;
  readonly residence: readonly ResidenceDeparture[];
  readonly residents: readonly ErisPlacement[];
  /// What the TOLOSA encounter's zap, its flashes and the death state do to the screen (#581).
  readonly screen: DamoclesScreen;
  readonly scrollCounter: number;
  readonly selection: Selection;
  readonly structure: BoundStructureSnapshot | null;
  /// The workspace the player is standing on, anchored at the Body the Pose names. A switch
  /// rebuilds it, so a renderer that plans from the presentation document's own surface instead
  /// would go on drawing Eris after the session had left it (#379).
  readonly surface: ErisSurface;
}

export type { Residence, ResidenceDeparture } from './residence.ts';

/// The screen effects of the TOLOSA encounter (#581, ADR 0055), as the session's clock has them.
export interface DamoclesScreen {
  /// The death loop has cleared the view and named the Body VOID (`$050FF8`).
  readonly dead: boolean;
  /// Fade steps taken, each one level off every palette component (`$050FAC`), 0 to 8.
  readonly fade: number;
  /// The zap's palette-noise loop `$050ECC` is running, and the main loop with it is blocked.
  readonly noise: boolean;
  /// The VBL handler shifted a set bit out of the flash word `$51D24` this tick, and painted the
  /// view white.
  readonly white: boolean;
}

/// What the panel and the console read of the craft aboard.
export interface DamoclesCraftSnapshot {
  /// `unrecovered`: the occupied slot's entry is not a surface craft pass the port runs.
  readonly held: 'unrecovered' | null;
  /// `$4DFEC`, the speed field's integer.
  readonly panelSpeed: number;
  readonly slot: number;
  /// In space (occupancy 2), the space words; null on a Body.
  readonly space: DamoclesSpaceSnapshot | null;
  /// `$797A` and `$7BAC`, as the program's floats.
  readonly speed: number;
  /// `$7B0C`: the launch swing is running.
  readonly swing: boolean;
  readonly throttle: number;
}

/// What the panel and the frame read of the craft in space (#558).
export interface DamoclesSpaceSnapshot {
  /// `$04DEEE`: the altitude window's 16.16 value, range ÷ 16,384.
  readonly altitude: number;
  /// `$7876`, 32γ.
  readonly dilation: number;
  /// The Catalogue id of the nearest Body `$7924`, `body-<index>`.
  readonly nearest: string;
  /// `$799A`/`$799E`/`$79A2`, the craft's position in the System.
  readonly position: Vector3;
  /// `$791C`, the nearest range, a float.
  readonly range: number;
}

/// What the player is inside: on foot, or aboard one resident instance, named by its instance id
/// as everything else in Damocles is. Aboard, that instance's Object Residence is `occupied`.
/// A Save carries it as it is (#417).
export type DamoclesOccupancy = DamoclesSaveOccupancy;

/// Board test 1: the nearest drawn object is under 1024 units from the Pose. Derived from
/// `$054302`'s exponent test under the selection note's float rule; the Take's reach is 512.
const BOARD_REACH = 1024;

const decline = (reason: string) => ({ kind: 'declined' as const, reason });
const wrap = (coordinate: number) =>
  coordinate >= 0
    ? coordinate % SURFACE_CELLS
    : ((coordinate % SURFACE_CELLS) + SURFACE_CELLS) % SURFACE_CELLS;

/// The VOID staging Body, `$78`, which Take and Drop already refuse on.
const VOID_BODY = 'body-30';
/// DAMOCLES, the comet, whose centre the impact clock moves.
const COMET_BODY = 29;

/// The messages the refusal chooser `$0542E0` can present. The Data Payload names which one each
/// resident takes; this only narrows its string to a presentable id.
const BOARD_REFUSALS: readonly Extract<
  DamoclesMessageId,
  'system-string-22' | 'system-string-3'
>[] = ['system-string-3', 'system-string-22'];

export type Selection =
  | { readonly kind: 'none' }
  | {
      readonly inRange: boolean;
      readonly instance: string;
      readonly kind: 'object';
    };

export interface AtlasDestination {
  readonly bodyId: string;
  readonly x: number;
  readonly z: number;
}

export interface DamoclesContent {
  readonly catalogue: Catalogue;
  /// The comet's centre at an elapsed time, which `$051E88` moves before the range scan reads
  /// the Body table. Where it is absent or the comet is gone the scan reads the Catalogue's.
  readonly cometAt?: (
    elapsed: number
  ) => { readonly x: number; readonly z: number } | null;
  readonly doc: ErisPresentationDocument;
  /// The Catalogue's Models, read a Body's islands at a time (ADR 0048).
  readonly models: ModelStore;
  /// The arrival Poses, which decide which Bodies are switchable.
  readonly poses: ArrivalPoses;
  /// One identity over every Damocles presentation document, hashed from the bytes served.
  readonly presentationSha256: string;
  readonly strings: DamoclesStrings;
  readonly surface: ErisSurface;
}

const rulesFor = (doc: ErisPresentationDocument): WalkRules => ({
  eyeHeight: doc.eye.heightUnits,
  runMultiplier: doc.walk.runMultiplier,
  runTurnMultiplier: doc.walk.runTurnMultiplier,
  turnRadiansPerSecond: doc.walk.turnRadiansPerSecond,
  unitsPerSecond: doc.walk.unitsPerSecond
});

const inventorySourceLabel = (
  catalogue: Catalogue,
  instanceId: string
): string => {
  const instance = instanceById(catalogue, instanceId);
  const model =
    instance === undefined
      ? undefined
      : modelSummaryById(catalogue, instance.model);
  return (model?.name ?? instanceId).slice(0, 16).padEnd(16);
};

/// A door as a structure binds it: shut, its latch `$00`.
const SHUT: AttachmentState = { latch: 'closed', openUnits: 0 };

/// Every attachment of `placement`, shut.
const shutAttachments = (
  placement: ErisPlacement | undefined
): Map<number, AttachmentState> =>
  new Map(
    placement?.selection?.structure.attachments.map(attachment => [
      attachment.slot,
      SHUT
    ]) ?? []
  );

/// A region whose flags have bit 13 is a Damocles Lift (docs/research/damocles-lift-control.md).
const LIFT_REGION = 0x20_00;

/// The pitch word `$055BA6` writes on arrival at a Floor.
const ARRIVAL_PITCH_WORD = 0x01_ff;

/// The Floor the label shows after one step towards `destination`: `$055A88`–`$055AB2`. The
/// lift walks B, G, 1, … 9, so Floor 10 is below Floor 0 and is always reached going down.
const nextLabel = (label: number, destination: number): number =>
  destination < label || destination === 10
    ? label === 10
      ? 0
      : label === 0
        ? 10
        : label - 1
    : label + 1;

/// `busy`, and each trigger's script, queue bit and sticky bit, are recomputed rather than
/// stored: they are content, and the recovered program has no writer that could move them.
const scriptFromSave = (saved: DamoclesSaveScript): ScriptState => ({
  ...saved,
  busy: saved.execution !== null,
  triggers: saved.triggers.map(trigger => {
    const arming = TRIGGER_ARMING.find(item => item.index === trigger.index);
    return {
      ...trigger,
      queueable: ((arming?.byte ?? 0) & 0x20) !== 0,
      script: SCRIPT_FOR_TRIGGER[trigger.index] ?? null,
      sticky: ((arming?.byte ?? 0) & 0x40) !== 0
    };
  })
});

const scriptForSave = (script: ScriptState): DamoclesSaveScript => ({
  counter: script.counter,
  display: script.display,
  displayDuration: script.displayDuration,
  encounter: script.encounter,
  execution: script.execution,
  flags: script.flags,
  message: script.message,
  noise: script.noise,
  pending: script.pending,
  triggers: script.triggers.map(({ armed, index }) => ({ armed, index })),
  zaps: script.zaps
});

/// The workspace origin a Body's admitted arrival Pose publishes, if it has one.
const workspaceOriginFor = (
  content: DamoclesContent,
  bodyId: string
): { readonly x: number; readonly z: number } | undefined =>
  content.poses.poses.find(
    pose => pose.body === bodyId && pose.workspaceOrigin !== null
  )?.workspaceOrigin ?? undefined;

/// The origin a Body's surface is anchored at: its admitted Pose's workspace origin, and on a
/// Body a landing reaches without one, the Body's own origin (ADR 0052). No 16-cell window is
/// recovered there, so the local cell is the Body Coordinate.
const surfaceOriginFor = (
  content: DamoclesContent,
  bodyId: string
): { readonly x: number; readonly z: number } | undefined =>
  workspaceOriginFor(content, bodyId) ??
  (landsOn(content.catalogue, bodyId) ? { x: 0, z: 0 } : undefined);

/// A position on a Body as `$7AB2` holds it, masked to the surface's 28 bits (`$058F64`).
const surfaceLong = (value: number): number => (value >>> 0) & 0x0f_ff_ff_ff;

/// The single owner of Damocles's Session State.
///
/// Time reaches it as seconds and is stepped at no more than the shared `MAXIMUM_STEP`, so a
/// long frame is several short steps rather than one long one, as Targ's session does.
export class DamoclesSession implements TitleSession<
  DamoclesSnapshot,
  DamoclesSaveSnapshot
> {
  intent: Intent = IDLE;
  /// The fire button, bit 7 of the joystick softcopy `$79C2`: held, not pressed. The launcher
  /// fires whenever it is held and the player's shot is not in flight (#581).
  firing = false;

  private readonly content: DamoclesContent;
  private readonly negateModelZ: boolean;
  private readonly rules: WalkRules;
  private readonly scriptRules: ScriptRules;
  private readonly soundPermitted: () => boolean;
  private attachments = new Map<number, AttachmentState>();
  /// `$7AE6`: the attachment slot of the last doorway region the region walk accepted in the
  /// bound structure, or null before one has been crossed there. A ride pins its door shut.
  private doorway: number | null = null;
  /// A Damocles Lift ride between admission and arrival, or null when none is pending.
  private ride: LiftRideSnapshot | null = null;
  /// The bound structure as it stands on `floor`: the surface's own placement on Floor 0, and
  /// otherwise that placement carrying the selector of the structure the Floor binds.
  private boundPlacement: ErisPlacement | null = null;
  /// The Floor the player stands on in the bound structure, 0 when none is bound. Only a
  /// deliberate act changes it -- the console today, the lift later -- and it is never read off
  /// the Pose's height. Binding another structure puts it back to 0.
  private floor = 0;
  /// The Floor a switched-to arrival Pose was captured on (`$7AA4`), and the cell it stands in,
  /// until it lands. A Pose above Floor 0 waits unbound for the structure in its cell and for
  /// that Floor's structure to be read, and is dropped if the player leaves the cell first.
  private arrivalFloor: {
    readonly cell: ErisCell;
    readonly floor: number;
  } | null = null;
  /// The surface as published, with the bound placement on its Floor, and what it was built from.
  private floorSurface: {
    readonly bound: ErisPlacement;
    readonly surface: ErisSurface;
    readonly under: ErisSurface;
  } | null = null;
  private briefcaseStore: string[];
  /// The current Body's rotation accumulator, advanced by its rate every VBL (`$051E4E`). Only
  /// the Body underfoot is kept: a switch takes the arrival Pose's own, and a landing carries
  /// the clock every Body shares to the destination (#567).
  private bodyTurn: number;
  /// `$79BE` as the last landing wrote it, or null where no landing has since the session
  /// started or last switched: the terminator then reads the Body's captured or derived word.
  private subStellar: number | null = null;
  private carried: string[];
  /// `$5A9D9`: whether any door moved on the last pass, which the next pass compares with.
  private doorsMoving: boolean;
  private elapsed: number;
  private effects: Effect[] = [];
  /// `$5A647`: whether the clamp refused a step in the last frame, which the next frame's
  /// `$5A646` is compared with.
  private stepRefused = false;
  private frameAccumulator: number;
  /// The instance the player is aboard, or null on foot.
  private occupied: string | null = null;
  /// The craft Mover's words while aboard (ADR 0051), or null on foot.
  private craft: CraftState | null = null;
  /// The occupied slot, which indexes the craft table as `$7AB0` does.
  private craftSlot = 0;
  /// Ticks since the last pass; a pass runs on every `time.ticksPerPass`-th.
  private craftTicks = 0;
  /// On foot, ticks since the last main-loop pass; one runs on every
  /// `time.ticksPerPassOnFoot`-th, and all it steps is the noise pointer (ADR 0054).
  private footTicks = 0;
  /// Why the craft stands still with no rule to run, or null while the Mover runs.
  private craftHeld: DamoclesCraftSnapshot['held'] = null;
  /// The space words while in space (occupancy 2), or null on a Body.
  private space: SpaceState | null = null;
  /// In space, where the craft left the Body: the session's Pose stays there (#566).
  private spaceEntry: Vector3 | null = null;
  /// The range, nearest Body and pitch rate the last flight left, which the next reads.
  private spaceMemory: SpaceMemory;
  /// The instance angle byte leaving writes (`$0544FA`), by instance.
  private angleBytes = new Map<string, number>();
  /// The craft pass's published numbers, or null in a document that carries none.
  private readonly craftProgram: CraftProgram | null;
  /// The TOLOSA encounter's published numbers, or null in a document that carries none.
  private readonly encounterProgram: EncounterProgram | null;
  /// Slots 8, 11 and 15 of the moving-object pool (#581).
  private pool: Pool | null;
  /// Ticks since a zap began, or null while the player is alive. A zap blocks the main loop for
  /// the noise loop, then the death sequence fades the view and the loop waits for a restore.
  private death: number | null = null;
  /// Whether the death loop's `$21` has been presented.
  private deathMessage = false;
  /// `$51D24`, the flash word the VBL handler shifts left each tick, and whether the bit it shifted
  /// out this tick was set.
  private flashWord = 0;
  private flashWhite = false;
  /// The occupied instance's Object Residence departure from before boarding, or undefined where
  /// it had none and stood at its Catalogue residence. Leaving falls back to it where the leave
  /// placement cannot be held. A Save does not carry it, so a session restored aboard falls back to
  /// the Catalogue residence. Atlas Travel validates the destination Leave residence before
  /// moving an occupied object, so authored travel never reaches this fallback.
  private boardedFrom: Residence | undefined;
  private pendingBriefcaseDrop: {
    readonly head: string;
    readonly residence: PlacedResidence;
  } | null = null;
  private pose: Pose;
  private regionIndex: number | null = null;
  private residence = new Map<string, Residence>();
  /// The Body the session is standing on. A switch rebuilds it; walking never does, and nor
  /// does anything but a wave of that Body's Models landing (ADR 0048).
  private surface: ErisSurface;
  /// How many Models were in hand when `surface` was built.
  private surfaceModels = 0;
  /// Waves of Models that have landed, and how many of them `surface` has seen.
  private wavesLanded = 0;
  private wavesApplied = 0;
  private script: ScriptState;
  private scrollCounter: number;

  constructor(
    content: DamoclesContent,
    restore?: DamoclesSaveSnapshot,
    options: { readonly soundPermitted?: () => boolean } = {}
  ) {
    this.content = content;
    this.surface = content.surface;
    if (restore !== undefined) {
      this.validateRestore(restore);
    }
    this.rules = rulesFor(content.doc);
    this.scriptRules = {
      messageFrames: content.doc.time.messageFrames,
      messageText: id => {
        const text = presentedText(content.strings, id);
        if (text === undefined) {
          throw new Error(`Damocles strings have no ${id}`);
        }
        return text;
      },
      noise: content.catalogue.craft?.noise.words ?? new Uint16Array(),
      waitFrames: content.doc.time.waitFrames
    };
    this.soundPermitted = options.soundPermitted ?? (() => true);
    this.negateModelZ = content.doc.orientation.modelZ === 'negate';
    this.craftProgram =
      content.catalogue.craft === null
        ? null
        : craftProgram(content.catalogue.craft);
    this.encounterProgram =
      content.catalogue.craft === null
        ? null
        : encounterProgram(content.catalogue.craft);
    this.pool =
      restore?.encounter?.pool ?? this.encounterProgram?.initial ?? null;
    if (restore?.encounter?.dead === true) {
      this.death = this.deathEnd();
    }
    const boot = content.catalogue.craft?.boot;
    this.spaceMemory = {
      nearest: boot?.nearest.value ?? 0,
      pitchRate: boot?.pitchRate.value ?? 0xff_00_10_00,
      range: boot?.range.value ?? 0
    };
    if (restore?.spaceMemory != null) {
      this.spaceMemory = { ...restore.spaceMemory };
    }
    const opening = restore?.pose ?? startPose(content.doc);
    this.pose = {
      body: opening.body,
      heading: opening.heading,
      pitch: opening.pitch,
      position: { ...opening.position }
    };
    this.elapsed = restore?.elapsed ?? handoverElapsed(content.doc.time);
    this.bodyTurn = restore?.bodyTurn ?? content.doc.start.bodyTurn;
    this.briefcaseStore = [...(restore?.briefcaseStore ?? [])];
    this.pendingBriefcaseDrop = restore?.pendingBriefcaseDrop ?? null;
    this.carried = [...(restore?.carried ?? [])];
    this.doorsMoving = restore?.doorsMoving ?? false;
    this.frameAccumulator = restore?.frameAccumulator ?? 0;
    this.scrollCounter = restore?.scrollCounter ?? 0;
    this.footTicks = restore?.footTicks ?? 0;
    this.script =
      restore?.script === undefined
        ? initialScriptState()
        : scriptFromSave(restore.script);
    this.residence = new Map(
      restore?.residence?.map(item => [item.instance, item.residence]) ?? []
    );
    this.occupied =
      restore?.occupancy.kind === 'aboard' ? restore.occupancy.instance : null;
    this.angleBytes = new Map(
      restore?.angleBytes.map(item => [item.instance, item.byte]) ?? []
    );
    if (this.occupied !== null) {
      const saved = restore?.craft ?? null;
      if (saved === null) {
        // A migrated schema-11 record: seated at the boarding preset, facing the saved heading.
        this.seat(this.occupied, this.pose, this.yawFrom(this.pose));
      } else {
        this.resumeCraft(this.occupied, saved);
      }
      this.pose =
        this.space === null
          ? this.poseFromCraft(this.craft!)
          : this.spacePose(this.craft!);
    }
    // A restore may name a Body other than the document's, so the surface is anchored from the
    // Pose before anything binds against it.
    this.surface = this.surfaceFor(this.pose.body);
    this.bindAt(this.pose, restore?.structure);
    this.readBody();
  }

  /// The Models a restore needs before a session can be built from it and are not in hand yet:
  /// the island the saved Pose stands on, and the structure it saved as bound, which the
  /// constructor refuses to restore without. Everything else streams in once the session runs.
  /// A restore the constructor will refuse whatever is read needs nothing, so it is refused at
  /// once: one naming a Body with no admitted Pose, or a bound structure on another Body.
  static missingModels(
    content: DamoclesContent,
    restore: DamoclesSaveSnapshot
  ): readonly string[] {
    const origin = surfaceOriginFor(content, restore.pose.body);
    const bound = instanceById(
      content.catalogue,
      restore.structure?.instanceId ?? undefined
    );
    if (
      origin === undefined ||
      (restore.structure != null && bound?.location?.body !== restore.pose.body)
    ) {
      return [];
    }
    const surface = erisSurfaceFrom(
      content.catalogue,
      content.models,
      content.doc,
      { bodyId: restore.pose.body, origin }
    );
    // The structure a saved Floor binds is named only by the bound Model's Floor Table, so it
    // is missing only once that Model is in hand; `prepare` reads again until nothing is.
    const floor = restore.structure?.floor ?? 0;
    const floorStructure =
      bound === undefined || floor === 0
        ? undefined
        : content.models
            .peek(bound.model)
            ?.levelBinding?.floors.find(entry => entry.level === floor);
    return [
      ...(modelWaves(content.catalogue, surface, restore.pose.position)[0] ??
        []),
      ...(bound === undefined ? [] : [bound.model]),
      ...(floorStructure === undefined ? [] : [floorModelId(floorStructure)])
    ].filter(id => content.models.peek(id) === undefined);
  }

  /// Reads what `missingModels` names, until it names nothing it has not already tried.
  static async prepare(
    content: DamoclesContent,
    restore: DamoclesSaveSnapshot
  ): Promise<void> {
    const tried = new Set<string>();
    for (;;) {
      const missing = DamoclesSession.missingModels(content, restore).filter(
        id => !tried.has(id)
      );
      if (missing.length === 0) {
        return;
      }
      for (const id of missing) {
        tried.add(id);
      }
      await content.models.prefetch(missing);
    }
  }

  /// Reads the current Body's Models island by island, nearest first, counting each wave as it
  /// lands so the next step rebuilds the surface with it.
  private readBody(): void {
    const body = this.surface.body.id;
    const waves = modelWaves(
      this.content.catalogue,
      this.surface,
      this.pose.position
    );
    void (async () => {
      for (const wave of waves) {
        await this.content.models.prefetch(wave);
        if (this.surface.body.id !== body) {
          return;
        }
        this.wavesLanded += 1;
      }
    })();
  }

  /// Rebuilds the surface once a wave has landed that brought Models it lacks, keeping the bound
  /// structure bound, or binding one the player turns out to be standing in.
  private refreshSurface(): void {
    if (this.wavesLanded === this.wavesApplied) {
      return;
    }
    this.wavesApplied = this.wavesLanded;
    if (this.content.models.size === this.surfaceModels) {
      return;
    }
    this.surface = this.buildSurface(this.surface.body.id);
    const bound = this.boundPlacement;
    if (bound === null) {
      this.bindAt(this.pose);
    } else {
      const ground = this.surface.placements.find(
        placement => placement.id === bound.id
      );
      // The Floor's structure stays bound: its selector does not change with the surface.
      this.boundPlacement =
        ground === undefined
          ? bound
          : this.floor === 0 || bound.selection === undefined
            ? ground
            : { ...ground, selection: bound.selection };
    }
  }

  /// The surface for a Body, anchored at the workspace origin its admitted Pose publishes, and
  /// built from whatever of its Models are in hand. `validateRestore` has already refused a
  /// Body with no admitted Pose, so a missing origin here is a programming error rather than a
  /// refusal.
  ///
  /// The loaded surface is reused where it names that Body and already holds every Instance
  /// whose Model is in hand, so the common case rebuilds nothing; one built before later waves
  /// landed is rebuilt instead.
  private surfaceFor(bodyId: string): ErisSurface {
    const loaded = this.content.surface;
    if (
      bodyId === loaded.body.id &&
      loaded.placements.length ===
        this.content.catalogue.instances.filter(
          instance =>
            instance.location?.body === bodyId &&
            this.content.models.peek(instance.model) !== undefined
        ).length
    ) {
      this.surfaceModels = this.content.models.size;
      return loaded;
    }
    return this.buildSurface(bodyId);
  }

  private buildSurface(bodyId: string): ErisSurface {
    const origin = surfaceOriginFor(this.content, bodyId);
    if (origin === undefined) {
      throw new Error(
        `Damocles Body ${bodyId} has no admitted arrival Pose and no landing reaches it`
      );
    }
    this.surfaceModels = this.content.models.size;
    return erisSurfaceFrom(
      this.content.catalogue,
      this.content.models,
      this.content.doc,
      { bodyId, origin }
    );
  }

  private validateRestore(restore: DamoclesSaveSnapshot): void {
    if (
      !this.content.catalogue.bodies.some(body => body.id === restore.pose.body)
    ) {
      throw new Error('saved Pose names an unknown Body');
    }
    if (restore.footTicks >= this.content.doc.time.ticksPerPassOnFoot) {
      throw new Error('saved on-foot pass phase is outside a pass');
    }
    // Occupancy first: an occupied craft is otherwise named only as an untracked departure.
    validateOccupancy(
      restore.occupancy,
      restore.residence,
      this.content.catalogue
    );
    if (
      new Set(restore.carried).size !== restore.carried.length ||
      new Set(restore.residence.map(item => item.instance)).size !==
        restore.residence.length ||
      restore.carried.length > 255
    ) {
      throw new Error('saved Carried Stack or Object Residence is not tracked');
    }
    const known = new Set(
      this.content.catalogue.instances.map(item => item.id)
    );
    const carried = new Set(restore.carried);
    for (const instanceId of [
      ...restore.carried,
      ...restore.residence.map(item => item.instance)
    ]) {
      const instance = instanceById(this.content.catalogue, instanceId);
      if (!known.has(instanceId) || instance?.handling === null) {
        throw new Error(
          'saved Carried Stack or Object Residence is not tracked'
        );
      }
    }
    for (const departure of restore.residence) {
      const residence = departure.residence;
      const instance = instanceById(
        this.content.catalogue,
        departure.instance
      )!;
      if (!admissiblePlacementClass(residence.placementClass, instance)) {
        throw new Error('saved Object Residence contradicts the Catalogue');
      }
      if (residence.kind === 'carried') {
        if (!carried.has(departure.instance)) {
          throw new Error('saved Carried Stack and Object Residence disagree');
        }
      } else if (
        residence.kind === 'surface' &&
        !this.content.catalogue.bodies.some(body => body.id === residence.body)
      ) {
        throw new Error('saved surface residence names an unknown Body');
      } else if (
        residence.kind === 'structure' &&
        !validStructureResidence(this.content.catalogue, residence)
      ) {
        throw new Error(
          'saved structure residence is not admitted by the Catalogue'
        );
      }
    }
    for (const instanceId of restore.carried) {
      if (
        restore.residence.find(item => item.instance === instanceId)?.residence
          .kind !== 'carried'
      ) {
        throw new Error('saved Carried Stack and Object Residence disagree');
      }
    }
    if (
      restore.residence.some(
        item => item.residence.kind === 'carried' && !carried.has(item.instance)
      )
    ) {
      throw new Error('saved Carried Stack and Object Residence disagree');
    }
  }

  private readonly latchFor = (slot: number): AttachmentLatch =>
    (this.attachments.get(slot) ?? SHUT).latch;

  private bindAt(pose: Pose, restore?: BoundStructureSnapshot | null): void {
    const placement =
      pose.body === this.surface.body.id
        ? structureInCell(this.surface, pose.position)
        : undefined;
    if (restore !== undefined) {
      if (placement?.id !== restore?.instanceId) {
        throw new Error('saved structure does not match the current cell');
      }
    }
    if (placement?.id === this.boundPlacement?.id && restore === undefined) {
      return;
    }
    const arrival = restore === undefined ? this.landingFloor(pose) : null;
    if (arrival !== null) {
      if (placement === undefined) {
        return;
      }
      if (
        floorPlacement(placement, this.content.models, arrival) === undefined
      ) {
        // The payload's Floor comes from the same capture as the structure's Floor Table, so a
        // Floor the table does not bind is a payload fault, not a refusal.
        if (!this.floorBound(placement, arrival)) {
          throw new Error(`${placement.name} binds no Floor ${arrival}`);
        }
        this.readFloors(placement);
        return;
      }
      this.arrivalFloor = null;
    }
    const floor = restore?.floor ?? arrival ?? 0;
    const floored =
      placement === undefined || floor === 0
        ? placement
        : floorPlacement(placement, this.content.models, floor);
    if (floored === undefined && placement !== undefined) {
      throw new Error('saved Floor is not one the structure binds');
    }
    this.boundPlacement = floored ?? null;
    this.floor = floored === undefined ? 0 : floor;
    // Authored: `$7AE6` is not known to be cleared here, but a slot names an attachment of one
    // structure, so the port forgets it rather than pin a same-numbered door in another.
    this.doorway = null;
    this.ride = null;
    this.attachments = shutAttachments(floored);
    if (placement !== undefined) {
      this.readFloors(placement);
    }
    if (restore !== undefined && restore !== null && floored !== undefined) {
      if (
        restore.attachments.length !== this.attachments.size ||
        new Set(restore.attachments.map(item => item.slot)).size !==
          restore.attachments.length ||
        (restore.regionIndex !== null &&
          restore.regionIndex >= floored.selection!.structure.regions.length) ||
        restore.attachments.some(({ latch, openUnits, slot }) => {
          const attachment = floored.selection!.structure.attachments.find(
            item => item.slot === slot
          );
          if (attachment === undefined) {
            return true;
          }
          const travel = attachmentOpenLimit(attachment);
          // A latch settles only at its endpoint; moving, the edge may stand anywhere.
          return (
            openUnits < 0 ||
            openUnits > travel ||
            (latch === 'closed' && openUnits !== 0) ||
            (latch === 'open' && openUnits !== travel)
          );
        })
      ) {
        throw new Error('saved attachments do not match the bound structure');
      }
      const region =
        restore.regionIndex === null
          ? undefined
          : floored.selection!.structure.regions[restore.regionIndex];
      if (
        restore.ride !== null &&
        (region === undefined ||
          (region.flags & LIFT_REGION) === 0 ||
          !this.floorBound(placement!, restore.ride.destination))
      ) {
        throw new Error('saved lift ride does not match the bound structure');
      }
      this.attachments = new Map(
        restore.attachments.map(({ latch, openUnits, slot }) => [
          slot,
          { latch, openUnits }
        ])
      );
      this.regionIndex = restore.regionIndex;
      this.doorway = restore.doorway;
      this.ride = restore.ride;
      return;
    }
    this.enterRegion(this.regionAt(pose));
  }

  /// The Floor a switch's arrival still has to land on where the Pose stands in its cell, or
  /// null. Leaving the cell first drops it: the Floor belongs to that cell's structure.
  private landingFloor(pose: Pose): number | null {
    const pending = this.arrivalFloor;
    if (pending === null) {
      return null;
    }
    const cell = cellOf(pose.position, this.surface.grid);
    if (cell.x !== pending.cell.x || cell.z !== pending.cell.z) {
      this.arrivalFloor = null;
      return null;
    }
    return pending.floor;
  }

  /// Takes the region the walk accepted, remembering a doorway's attachment slot as `$05A372`
  /// does. A doorway is a region its attachment's latch gates.
  private enterRegion(index: number | null): void {
    this.regionIndex = index;
    const region =
      index === null
        ? undefined
        : this.boundPlacement?.selection?.structure.regions[index];
    if (region?.gate === 'attachmentLatch') {
      this.doorway = region.flags & 0x03_fc;
    }
  }

  /// Reads ahead the structures `ground`'s Floors bind, so a Floor change finds them in hand. No
  /// Floor structure is a placed Model, so neither the Body's waves nor Atlas Travel read them.
  private readFloors(ground: ErisPlacement): void {
    void this.content.models.prefetch(
      floorsOf(ground, this.content.models).map(floorModelId)
    );
  }

  /// Whether a structure's Floor Table binds `floor`.
  private floorBound(ground: ErisPlacement, floor: number): boolean {
    return floorsOf(ground, this.content.models).some(
      entry => entry.level === floor
    );
  }

  /// The surface's own placement of the bound structure, as it stands on Floor 0.
  private groundPlacement(): ErisPlacement | undefined {
    const bound = this.boundPlacement;
    return bound === null
      ? undefined
      : this.surface.placements.find(placement => placement.id === bound.id);
  }

  /// The bound structure's region the Pose stands in, where the Pose is in its cell's central half.
  private regionAt(pose: Pose): number | null {
    const placement = this.boundPlacement;
    return placement !== null &&
      insideCentralCellHalf(pose.position, this.surface.grid)
      ? structureRegionAt(placement, pose, this.negateModelZ, this.latchFor)
      : null;
  }

  private structureSnapshot(): BoundStructureSnapshot | null {
    if (this.boundPlacement === null) {
      return null;
    }
    return {
      attachments: [...this.attachments].map(
        ([slot, { latch, openUnits }]) => ({ latch, openUnits, slot })
      ),
      doorway: this.doorway,
      floor: this.floor,
      instanceId: this.boundPlacement.id,
      regionIndex: this.regionIndex,
      ride: this.ride
    };
  }

  /// The surface as the renderer draws it: the bound structure on its Floor, at that Floor's
  /// height. The same object comes back until the surface or the binding changes, so a frame
  /// does not rebuild it.
  ///
  /// The game draws a bound structure from the structure-local eye (`$79A8`/`$79AC`/`$79B0`,
  /// read at `$05A756` and `$053FB4`), and every write of the local eye height makes it 63
  /// (`$055948` on foot, `$055BA6` on arrival at a Floor). The eye stands at Floor × storey
  /// + 63, so the structure is drawn Floor × storey above its placement (#487).
  private publishedSurface(): ErisSurface {
    const bound = this.boundPlacement;
    if (bound === null || this.floor === 0) {
      return this.surface;
    }
    if (
      this.floorSurface?.bound !== bound ||
      this.floorSurface.under !== this.surface
    ) {
      const storey = this.content.models.peek(bound.modelId)?.storeyHeight;
      const drawn =
        storey === undefined
          ? bound
          : {
              ...bound,
              position: {
                ...bound.position,
                y: bound.position.y + this.floor * storey
              }
            };
      this.floorSurface = {
        bound,
        surface: {
          ...this.surface,
          placements: this.surface.placements.map(placement =>
            placement.id === bound.id ? drawn : placement
          )
        },
        under: this.surface
      };
    }
    return this.floorSurface.surface;
  }

  private residenceFor(instanceId: string): Residence | undefined {
    const departure = this.residence.get(instanceId);
    if (departure !== undefined) {
      return departure;
    }
    if (this.briefcaseStore.includes(instanceId)) {
      return undefined;
    }
    const instance = this.instanceFor(instanceId);
    if (instance?.handling?.carried === true) {
      return {
        kind: 'carried',
        placementClass: instance.placementClass ?? 0
      };
    }
    return catalogueResidence(this.content.catalogue, instanceId);
  }

  private instanceFor(instanceId: string) {
    return instanceById(this.content.catalogue, instanceId);
  }

  private worldPosition(
    instanceId: string,
    residence: Residence
  ): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null {
    if (residence.kind === 'carried' || residence.kind === 'occupied') {
      return null;
    }
    if (residence.kind === 'surface') {
      return residence.body === this.pose.body ? residence.position : null;
    }
    if (
      residence.body !== this.pose.body ||
      residence.parent !== this.boundPlacement?.id ||
      residence.level !== this.floor ||
      this.regionIndex === null
    ) {
      return null;
    }
    if (residence.level !== 0) {
      const parent = this.surface.placements.find(
        placement => placement.id === residence.parent
      );
      if (
        parent === undefined ||
        floorPlacement(parent, this.content.models, residence.level)?.selection
          ?.structure !== this.boundPlacement.selection?.structure
      ) {
        return null;
      }
    }
    if (this.insertions(instanceId, residence) === 0) {
      return null;
    }
    return {
      x: this.boundPlacement.position.x + residence.position.x,
      y: this.boundPlacement.position.y + residence.position.y,
      z: this.boundPlacement.position.z + residence.position.z
    };
  }

  /// How many times the bound structure inserts this resident in the region the player is in.
  /// Zero means it is placed but not exposed here, which is not the same as unplaced.
  private insertions(instanceId: string, residence: Residence): number {
    return this.regionIndex === null
      ? 0
      : insertionsInRegion(
          this.content.catalogue,
          instanceId,
          residence,
          this.regionIndex + 1
        );
  }

  private candidates(): readonly {
    readonly id: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
  }[] {
    const candidates: {
      id: string;
      position: { readonly x: number; readonly y: number; readonly z: number };
    }[] = [];
    const seen = new Set<string>();
    for (const placement of this.surface.placements) {
      if (placement.kind !== 'object' || seen.has(placement.id)) {
        continue;
      }
      const residence = this.residenceFor(placement.id);
      if (
        residence === undefined ||
        residence.kind === 'carried' ||
        residence.kind === 'occupied'
      ) {
        continue;
      }
      const position = this.worldPosition(placement.id, residence);
      if (position !== null) {
        candidates.push({ id: placement.id, position });
        seen.add(placement.id);
      }
    }
    // Authored (ADR 0055): a moving object is drawn but never selected. Whether a shot left in
    // the air by leaving the craft can be taken on foot is unrecovered.
    const pooled = new Set(
      this.poolObjects().map(([slot]) => `object-slot-${slot}`)
    );
    for (const resident of this.visibleResidents()) {
      if (seen.has(resident.id) || pooled.has(resident.id)) {
        continue;
      }
      candidates.push({ id: resident.id, position: resident.position });
      seen.add(resident.id);
    }
    return candidates;
  }

  private nearestCandidate(maximum: number):
    | {
        readonly distance: number;
        readonly id: string;
        readonly position: {
          readonly x: number;
          readonly y: number;
          readonly z: number;
        };
      }
    | undefined {
    let nearest:
      | {
          readonly distance: number;
          readonly id: string;
          readonly position: {
            readonly x: number;
            readonly y: number;
            readonly z: number;
          };
        }
      | undefined;
    for (const candidate of this.candidates()) {
      if (candidate.id === 'object-slot-74') {
        continue;
      }
      const dx = candidate.position.x - this.pose.position.x;
      const dy = candidate.position.y - this.pose.position.y;
      const dz = candidate.position.z - this.pose.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (
        distance < maximum &&
        (nearest === undefined || distance <= nearest.distance)
      ) {
        nearest = { ...candidate, distance };
      }
    }
    return nearest;
  }

  private selection(): Selection {
    const nearest = this.nearestCandidate(512);
    return nearest === undefined
      ? { kind: 'none' }
      : {
          inRange: nearest.distance < 512,
          instance: nearest.id,
          kind: 'object'
        };
  }

  private visibleResidents(): readonly ErisPlacement[] {
    const residents: ErisPlacement[] = [];
    const region =
      this.regionIndex === null
        ? undefined
        : this.boundPlacement?.selection?.structure.regions[this.regionIndex];
    // An enclosed region draws no object stream, so an object left on the surface is not seen
    // from it: a craft parked in the State Office lobby stays below Floor 10.
    const enclosed = region !== undefined && regionIsEnclosed(region);
    for (const instance of this.content.catalogue.instances) {
      const departure = this.residence.get(instance.id);
      const residence = this.residenceFor(instance.id);
      if (
        residence === undefined ||
        residence.kind === 'carried' ||
        residence.kind === 'occupied' ||
        (residence.kind === 'surface' && (departure === undefined || enclosed))
      ) {
        continue;
      }
      const position = this.worldPosition(instance.id, residence);
      if (position === null) {
        continue;
      }
      const placement = this.residentPlacement(instance, position);
      if (placement === undefined) {
        continue;
      }
      // One insertion is one drawn copy, and `worldPosition` has already refused zero.
      const copies =
        residence.kind === 'structure'
          ? this.insertions(instance.id, residence)
          : 1;
      residents.push(...Array.from({ length: copies }, () => placement));
    }
    // The moving-object pool (#581): a record stamped with the current Body is drawn where it
    // flies, as the surface residence list `$52C9C` draws it, and not from an enclosed region.
    for (const [slot, object] of this.poolObjects()) {
      if (enclosed || !poolObjectShown(object, this.selector())) {
        continue;
      }
      const instance = this.instanceFor(`object-slot-${slot}`);
      const placement =
        instance === undefined
          ? undefined
          : this.residentPlacement(instance, {
              x: object.position[0],
              y: object.position[1] | 0,
              z: object.position[2]
            });
      if (placement !== undefined) {
        residents.push(placement);
      }
    }
    return residents;
  }

  private poolObjects(): readonly (readonly [number, PoolObject])[] {
    const pool = this.pool;
    return pool === null
      ? []
      : [
          [8, pool.shot],
          [11, pool.ship],
          [15, pool.shipShot]
        ];
  }

  /// A resident drawn at `position` in its Model's own form, once the Model is in hand.
  private residentPlacement(
    instance: NonNullable<ReturnType<DamoclesSession['instanceFor']>>,
    position: Vector3
  ): ErisPlacement | undefined {
    const model = this.content.models.peek(instance.model);
    if (model === undefined) {
      // Drawn once its file lands: residents are recomputed every snapshot.
      void this.content.models.prefetch([instance.model]);
      return undefined;
    }
    const form =
      model.variants.find(variant => variant.id === model.id) ??
      model.variants[0];
    const base = this.surface.placements.find(
      placement => placement.id === instance.id
    );
    return {
      faceCount: form?.mesh.faces.length ?? 0,
      // A structure resident has no surface placement; it turns by its own instance angle
      // byte in the parent's frame, which structures never rotate (#361).
      heading:
        this.angleBytes.has(instance.id) || base === undefined
          ? placementHeading(
              model,
              this.angleBytes.get(instance.id) ??
                instance.placement?.heading ??
                null
            )
          : base.heading,
      id: instance.id,
      keyBase: instance.keyBase,
      kind: model.kind,
      mesh: form?.mesh,
      modelId: model.id,
      name: model.name,
      position,
      status: model.status
    };
  }

  private inventoryLabel(): string {
    const head = this.carried[0];
    if (head === undefined) {
      return this.scrollCounter > 0
        ? ''.padEnd(Math.max(0, this.scrollCounter), ' ')
        : 'EMPTY';
    }
    const label = inventorySourceLabel(this.content.catalogue, head);
    if (this.scrollCounter < 0) {
      return label.slice(0, 16 + this.scrollCounter);
    }
    const instance = instanceById(this.content.catalogue, head);
    const model = modelSummaryById(this.content.catalogue, instance?.model);
    return model?.name ?? head;
  }

  /// The Catalogue's name for the Body underfoot, falling back to its id so a Body the
  /// Catalogue does not name still reads as something a player can act on.
  private bodyName(): string {
    // `$050FF8`: the death loop names the Body by the selector it writes, VOID's.
    const id = this.screen().dead
      ? `body-${(this.encounterProgram?.constants.deathSelector ?? 0) / 4}`
      : this.pose.body;
    const body = this.content.catalogue.bodies.find(item => item.id === id);
    return (body?.name ?? this.pose.body).toUpperCase();
  }

  /// What the VBL handler adds to the current Body's rotation accumulator.
  private rotationRate(): number {
    return this.rateOf(this.pose.body);
  }

  private rateOf(bodyId: string): number {
    return (
      this.content.catalogue.bodies.find(item => item.id === bodyId)
        ?.bodySurface?.rotationRate ?? 0
    );
  }

  /// The terminator for the Pose, against the sub-stellar longitude the last landing wrote, or
  /// else the one the Body's arrival Poses captured, or else `$04EA02`'s from the Body's place,
  /// which every capture's but the moving comet's matches (#567).
  private daylight(): boolean {
    const longitude =
      this.subStellar ??
      this.content.poses.poses.find(pose => pose.body === this.pose.body)
        ?.subStellarLongitude ??
      this.derivedSubStellar();
    return (
      longitude !== undefined &&
      inDaylight(longitude, this.bodyTurn, this.pose.position)
    );
  }

  private derivedSubStellar(): number | undefined {
    const body = this.catalogueBody();
    return this.craftProgram === null || body === undefined
      ? undefined
      : subStellarLongitude(this.craftProgram.arithmetic, body);
  }

  private capacity(): number {
    return this.carried.includes('object-slot-108') ? 20 : 10;
  }

  private liveCarriedInstance(instanceId: string): boolean {
    const departure = this.residence.get(instanceId);
    if (departure !== undefined) {
      return departure.kind === 'carried';
    }
    if (this.briefcaseStore.includes(instanceId)) {
      return true;
    }
    return this.instanceFor(instanceId)?.handling?.carried === true;
  }

  private liveCarriedSlot(slot: number): boolean {
    return this.liveCarriedInstance(`object-slot-${slot}`);
  }

  /// Bit 7 of the handling byte at `$6FAA + 4 * slot`, for the renderer: the font-4 wall text
  /// fallback at `$054016` reads it for slots 49 and 91.
  carriesSlot(slot: number): boolean {
    return this.liveCarriedSlot(slot);
  }

  /// `$05AA82..$05AA98`: an `$F0` Entrance Attachment inside its Proximity Box opens only
  /// while the matching door key is in the Carried Stack.
  ///
  /// The live condition word's low byte at `$5A43 + slot` is the key, written by `$059FA6` as
  /// the control's low nybble plus the cell's `$7AFB` base — which is the key object's own
  /// slot, and its printed letter less `$23`. A zero low byte, which is every non-`$F0`
  /// attachment and every `$F0` attachment in a cell that installs no base, opens on
  /// proximity alone. Otherwise `$05AA90` tests `$6FAA + 4 * slot`, whose bit 7 the Take at
  /// `$0542A4` sets and the Drop at `$04CAF0` clears. Bit clear raises `$5A9DA`, which
  /// `$0595A4` shows as system string 0, LOCKED.
  private attachmentKeyHeld(
    placement: ErisPlacement,
    attachment: EntranceAttachment
  ): boolean {
    if (attachment.keyIndex === undefined || placement.keyBase === null) {
      return true;
    }
    return this.liveCarriedSlot(placement.keyBase + attachment.keyIndex);
  }

  private presentSystem(id: SystemMessageId): void {
    if (this.script.execution === null && this.script.message === null) {
      const transition = presentSystemMessage(
        this.script,
        id,
        this.scriptRules
      );
      this.script = transition.state;
      this.effects.push(...transition.effects);
    }
  }

  get snapshot(): DamoclesSnapshot {
    const island = nearestIsland(this.surface, this.pose.position);
    return {
      bodyName: this.bodyName(),
      bodyTurn: this.bodyTurn,
      briefcaseStore: [...this.briefcaseStore],
      capacity: this.capacity(),
      carried: [...this.carried],
      cell: cellOf(this.pose.position, this.surface.grid),
      craft:
        this.craft === null
          ? null
          : {
              held: this.craftHeld,
              panelSpeed: this.craft.panelSpeed,
              slot: this.craftSlot,
              space: this.spaceSnapshot(),
              speed: this.craft.speed,
              swing: this.craft.swing,
              throttle: this.craft.throttle
            },
      daylight: this.daylight(),
      display: this.script.display,
      displayCells: displayCells(
        this.script.display,
        this.script.display.kind === 'scrolling'
          ? this.scriptRules.messageText(this.script.display.id)
          : this.script.display.cells
      ),
      elapsed: this.elapsed,
      encounter: this.script.encounter,
      frameAccumulator: this.frameAccumulator,
      inventoryLabel: this.inventoryLabel(),
      island: island ?? null,
      islandCell:
        island === undefined
          ? cellOf(this.pose.position, this.surface.grid)
          : islandLocalCell(this.pose.position, this.surface.grid, island),
      landSea: classifyPosition(this.surface, this.pose.position).kind,
      message: this.script.message,
      occupancy: this.occupancy,
      pose: this.pose,
      residence: [...this.residence].map(([instance, residence]) => ({
        instance,
        residence
      })),
      residents: this.visibleResidents(),
      screen: this.screen(),
      scrollCounter: this.scrollCounter,
      selection: this.selection(),
      structure: this.structureSnapshot(),
      surface: this.publishedSurface()
    };
  }

  advance(seconds: number): DamoclesSnapshot {
    this.refreshSurface();
    let remaining = Math.max(0, seconds);
    while (remaining > 0) {
      const step = Math.min(MAXIMUM_STEP, remaining);
      // Aboard, the craft Mover moves the Pose once a pass, on the frame clock below. From a zap
      // on, the main loop is blocked in the noise loop and then the death loop, so nothing moves.
      const aboard = this.occupied !== null;
      const frozen = this.death !== null;
      const moved =
        aboard || frozen
          ? this.pose
          : walk(this.pose, this.intent, step, this.rules);
      this.bindAt(moved);
      const placement = this.boundPlacement;
      // `$059520` clears `$5A646` every frame, and only the clamp raises it.
      let refused = false;
      // Aboard there is no step to clamp: `$0590AE` refuses a craft instead.
      if (!aboard && !frozen) {
        if (
          placement !== null &&
          insideCentralCellHalf(moved.position, this.surface.grid)
        ) {
          const clamped = clampStructureStep(
            placement,
            this.pose,
            moved,
            this.negateModelZ,
            this.latchFor,
            this.regionIndex,
            this.ride !== null
          );
          this.pose = clamped.pose;
          refused = clamped.refused;
          // `$05A35C`: the region is not reselected while a ride is pending.
          if (this.ride === null) {
            this.enterRegion(clamped.regionIndex);
          }
        } else {
          this.pose = moved;
          this.regionIndex = null;
        }
      }
      this.elapsed += step;
      this.frameAccumulator += step * this.content.doc.time.vblHertz;
      const frames = Math.floor(this.frameAccumulator + 1e-9);
      this.frameAccumulator = Math.max(0, this.frameAccumulator - frames);
      this.bodyTurn = advanceTurn(this.bodyTurn, this.rotationRate(), frames);
      for (let frame = 0; frame < frames; frame += 1) {
        this.scrollCounter +=
          this.scrollCounter < 0 ? 1 : this.scrollCounter > 0 ? -1 : 0;
        const transition = runFrame(this.script, this.scriptRules);
        this.script = transition.state;
        this.effects.push(...transition.effects);
        this.tickFlash();
        if (this.death !== null) {
          this.tickDeath();
          continue;
        }
        if (this.occupied === null) {
          this.tickFoot();
        } else {
          this.tickCraft();
        }
        // `$059562` steps the ride before `$05AA3C` moves the doors, so a tick sees them as they
        // stood before it. The doors see the step's Pose before `$05A64A` clamps it. Aboard,
        // the port keeps ticking both every VBL; whether `$05970E` moves them is unrecovered
        // (ADR 0051).
        this.stepRide(this.rideDoorShut());
        this.askForDoorTone(
          this.moveAttachments(aboard ? this.pose.position : moved.position)
        );
      }
      this.askForThud(refused);
      remaining -= step;
    }
    return this.snapshot;
  }

  /// Aboard, the occupied instance's departure is `occupied` and the Pose is the seated view.
  captureResume(): DamoclesSaveSnapshot {
    const pose = this.pose;
    return {
      angleBytes: [...this.angleBytes].map(([instance, byte]) => ({
        byte,
        instance
      })),
      bodyTurn: this.bodyTurn,
      briefcaseStore: [...this.briefcaseStore],
      carried: [...this.carried],
      craft: this.craftForSave(),
      doorsMoving: this.doorsMoving,
      elapsed: this.elapsed,
      encounter:
        this.pool === null
          ? null
          : { dead: this.death !== null, pool: this.pool },
      footTicks: this.footTicks,
      frameAccumulator: this.frameAccumulator,
      occupancy: this.occupancy,
      pendingBriefcaseDrop: this.pendingBriefcaseDrop,
      // The bank is the craft's roll, which `craft` carries.
      pose: {
        body: pose.body,
        heading: pose.heading,
        pitch: pose.pitch,
        position: pose.position
      },
      residence: [...this.residence].map(([instance, residence]) => ({
        instance,
        residence
      })),
      script: scriptForSave(this.script),
      scrollCounter: this.scrollCounter,
      spaceMemory: { ...this.spaceMemory },
      structure: this.structureSnapshot()
    };
  }

  /// Aboard, the craft words, and in space the space words beside them (#568). The position is
  /// the Pose's on a Body and the space words' in space.
  private craftForSave(): DamoclesSaveCraft | null {
    const craft = this.craft;
    if (craft === null) {
      return null;
    }
    const space = this.space;
    return {
      contact: craft.contact,
      panelSpeed: craft.panelSpeed,
      passTicks: this.craftTicks,
      pitch: craft.pitch,
      roll: craft.roll,
      space:
        space === null
          ? null
          : {
              dilation: space.dilation,
              hold: space.hold,
              x: space.x,
              y: space.y,
              z: space.z
            },
      speed: craft.speed,
      supported: craft.supported,
      supportLevel: craft.supportLevel,
      swing: craft.swing,
      throttle: craft.throttle,
      trig: { pitch: craft.trig.pitch, yaw: craft.trig.yaw },
      turnRate: craft.turnRate,
      yaw: craft.yaw
    };
  }

  drainEffects(): readonly Effect[] {
    const effects = this.effects;
    this.effects = [];
    return effects;
  }

  /// The Catalogue name of an instance, for a caller that needs to name an object it is not
  /// carrying. `inventoryLabel` cannot serve: a take sets the scroll counter to -16, so the label
  /// is empty on the very frame a caller wants to report what it took.
  objectName(instanceId: string): string | undefined {
    const instance = instanceById(this.content.catalogue, instanceId);
    if (instance === undefined) {
      return undefined;
    }
    return (
      modelSummaryById(this.content.catalogue, instance.model)?.name ??
      instanceId
    );
  }

  /// Put the occupied instance back where boarding found it: its departure, or its Catalogue
  /// residence where it had none.
  private restoreBoardedFrom(
    residence: Map<string, Residence>,
    instance: string
  ): void {
    if (this.boardedFrom === undefined) {
      residence.delete(instance);
    } else {
      residence.set(instance, this.boardedFrom);
    }
  }

  /// What the player is inside. Cheap, for a Control Profile that asks on every key.
  get occupancy(): DamoclesOccupancy {
    return this.occupied === null
      ? { kind: 'onFoot' }
      : { instance: this.occupied, kind: 'aboard' };
  }

  /// The Pose the craft words draw: the attitude words as the Camera's turns (ADR 0051 decision
  /// 4). Roll is `$7ABE` read signed, positive banking right as a right turn raises it.
  private poseFromCraft(craft: CraftState): Pose {
    const orientation = this.content.doc.orientation;
    const roll = ((craft.roll & 0xff_ff) << 16) >> 16;
    return {
      body: this.pose.body,
      heading: bearingFromYaw(craft.yaw & 0x3_ff, orientation),
      pitch: pitchFromWord(craft.pitch, orientation),
      position: { x: craft.x, y: craft.y, z: craft.z },
      ...(roll === 0
        ? {}
        : { roll: (roll / orientation.yawUnitsPerTurn) * 2 * Math.PI })
    };
  }

  /// The craft words boarding leaves (`$054374`–`$0543B0`): the seat at the craft's origin
  /// plus the eye, `yaw` (boarding's is the instance angle byte × 4), and the stop preset. Pitch
  /// and roll are not written, so they are the on-foot view's, and the frame's sines are still
  /// the on-foot attitude's. On foot the player is always in ground contact.
  private seat(instance: string, at: Pose, yaw: number): void {
    const orientation = this.content.doc.orientation;
    const units = orientation.yawUnitsPerTurn;
    const footYaw = this.yawFrom(at);
    const footPitch =
      Math.round(orientation.pitchLevel - (at.pitch / (2 * Math.PI)) * units) &
      (units - 1);
    const zero = this.craftProgram?.constants.zero ?? 0xff_00_10_00;
    const craft: CraftState = {
      contact: 0x3f,
      panelSpeed: 0,
      pitch: footPitch,
      roll: 0,
      speed: zero >>> 0,
      supported: 0,
      supportLevel: 0,
      swing: false,
      throttle: zero >>> 0,
      trig: { pitch: footPitch, yaw: footYaw },
      turnRate: zero >>> 0,
      x: Math.round(at.position.x),
      y: Math.round(at.position.y),
      yaw,
      z: Math.round(at.position.z)
    };
    this.boardCraft(instance, craft, 0);
  }

  /// The craft words a Save carried aboard, at the saved Pose's position, or in space at the
  /// space words' with the Pose at the space entry's. A record whose Pose is not the one those
  /// words draw is one no play produces, so it is refused.
  private resumeCraft(instance: string, saved: DamoclesSaveCraft): void {
    const { passTicks, space, ...words } = saved;
    const { position } = this.pose;
    if (
      !Number.isInteger(position.x) ||
      !Number.isInteger(position.y) ||
      !Number.isInteger(position.z) ||
      this.pose.heading !==
        bearingFromYaw(words.yaw & 0x3_ff, this.content.doc.orientation)
    ) {
      throw new Error('saved Pose is not the view the craft words draw');
    }
    if (passTicks >= this.content.doc.time.ticksPerPass) {
      throw new Error('saved craft pass phase is outside a pass');
    }
    if (
      (space !== null || words.swing) &&
      this.slotHeld(this.slotOf(instance)) !== null
    ) {
      throw new Error('saved craft launched on a slot the Mover never runs');
    }
    const inSpace = space !== null && space !== 'entry';
    if (
      inSpace &&
      (space.hold > (this.craftProgram?.constants.spaceHold ?? 0) ||
        this.catalogueBody() === undefined)
    ) {
      throw new Error('saved space words are not ones a flight leaves');
    }
    // In space the pass writes the space position into the pose words too.
    const at = inSpace ? space : this.pose.position;
    this.boardCraft(
      instance,
      {
        ...words,
        x: at.x,
        y: at.y,
        z: at.z
      },
      passTicks
    );
    if (space === 'entry') {
      // A migrated schema-12 record: its words are the ones the space entry found.
      this.enterSpace(this.craft!);
    } else if (inSpace) {
      this.spaceEntry = { ...this.pose.position };
      this.space = { ...this.spaceMemory, ...space };
    }
  }

  private boardCraft(
    instance: string,
    craft: CraftState,
    passTicks: number
  ): void {
    const slot = this.slotOf(instance);
    this.craft = craft;
    this.craftSlot = slot;
    this.craftTicks = passTicks;
    this.craftHeld = this.slotHeld(slot);
    this.space = null;
    this.spaceEntry = null;
  }

  /// `$055868` after the frame's pass: space, from the centre of the Body the craft left. The
  /// session's Pose keeps the entry's position on that Body, so nothing on the surface rebinds;
  /// the view turns with the craft.
  private enterSpace(craft: CraftState): void {
    const program = this.craftProgram;
    const body = program === null ? undefined : this.catalogueBody();
    if (program === null || body === undefined) {
      throw new Error(
        `${this.pose.body} is not in the craft block's Body table`
      );
    }
    const entered = enterSpace(program, craft, this.spaceMemory, body);
    this.spaceEntry = { ...this.poseFromCraft(craft).position };
    this.space = entered.space;
    this.craft = entered.craft;
    this.pose = this.spacePose(entered.craft);
  }

  /// The craft block's entry for the Body the Pose names.
  private catalogueBody() {
    const index = Number(/^body-(\d+)$/.exec(this.pose.body)?.[1] ?? -1);
    return this.content.catalogue.craft?.bodies[index];
  }

  /// In space, the view the craft words draw from the space entry's place on the Body.
  private spacePose(craft: CraftState): Pose {
    return {
      ...this.poseFromCraft(craft),
      position: this.spaceEntry!
    };
  }

  /// The Body table the range scan reads this frame: the comet where the impact clock has it.
  private scannedBodies() {
    const bodies = this.content.catalogue.craft!.bodies;
    const comet = this.content.cometAt?.(this.elapsed) ?? null;
    return comet === null
      ? bodies
      : bodies.map((body, index) =>
          index === COMET_BODY ? { ...body, x: comet.x, z: comet.z } : body
        );
  }

  private spaceSnapshot(): DamoclesSpaceSnapshot | null {
    const space = this.space;
    if (space === null || this.craftProgram === null) {
      return null;
    }
    return {
      altitude: spaceAltitude(this.craftProgram, space.range),
      dilation: space.dilation,
      nearest: `body-${space.nearest / 4}`,
      position: { x: space.x, y: space.y, z: space.z },
      range: space.range
    };
  }

  private slotOf(instance: string): number {
    return Number(/^object-slot-(\d+)$/.exec(instance)?.[1] ?? -1);
  }

  /// `unrecovered` where the slot's entry is not a surface craft pass the port runs.
  private slotHeld(slot: number): 'unrecovered' | null {
    const entry = this.craftProgram?.slots[slot];
    return entry === undefined ||
      (entry.class !== 'flying' && entry.class !== 'wheeled')
      ? 'unrecovered'
      : null;
  }

  /// A Pose's heading as the yaw word.
  private yawFrom(at: Pose): number {
    const orientation = this.content.doc.orientation;
    const units = orientation.yawUnitsPerTurn;
    return (
      Math.round((at.heading / (2 * Math.PI)) * units + orientation.yawNorth) &
      (units - 1)
    );
  }

  /// The instance angle byte as it stands: the one leaving last wrote, or the Catalogue's.
  private angleByte(instance: string): number {
    const known = this.angleBytes.get(instance);
    if (known !== undefined) {
      return known;
    }
    const catalogued = this.instanceFor(instance);
    return catalogued?.location?.heading ?? catalogued?.placement?.heading ?? 0;
  }

  /// The bound structure's support and wall boxes as the cell bind leaves them at `$CB88`.
  /// A cell with no structure binds Building detail 1, which holds none.
  private boundBoxes(): BoundBoxes {
    const placement = this.boundPlacement;
    const selection = placement?.selection;
    if (placement === null || selection === undefined) {
      return NO_BOXES;
    }
    return bindBoxes(selection.boxes, selection.structure.scale, {
      x: placement.position.x,
      z: placement.position.z
    });
  }

  /// The joystick byte `$79C2` the pass reads, from the Movement Intent: up is nose down.
  private stick(): number {
    const { pitch, turn } = this.intent;
    return (
      (pitch < 0 ? STICK_UP : 0) |
      (pitch > 0 ? STICK_DOWN : 0) |
      (turn < 0 ? STICK_LEFT : 0) |
      (turn > 0 ? STICK_RIGHT : 0)
    );
  }

  /// One tick on foot: every `ticksPerPassOnFoot`-th is a main-loop pass, whose join `$05948C`
  /// steps the noise pointer (ADR 0054). The on-foot rules themselves run per tick (ADR 0049).
  private tickFoot(): void {
    this.footTicks += 1;
    if (this.footTicks < this.content.doc.time.ticksPerPassOnFoot) {
      return;
    }
    this.footTicks = 0;
    this.script = stepNoise(this.script);
  }

  /// One tick aboard: every `ticksPerPass`-th runs a frame of the craft Mover (ADR 0051).
  private tickCraft(): void {
    const program = this.craftProgram;
    const craft = this.craft;
    if (craft === null || program === null || this.craftHeld !== null) {
      return;
    }
    this.craftTicks += 1;
    if (this.craftTicks < this.content.doc.time.ticksPerPass) {
      return;
    }
    this.craftTicks = 0;
    // `$05948C` steps the noise pointer as the pass's frame joins the main loop, before the pass
    // itself: the traced landing drew the word after it (#576).
    this.script = stepNoise(this.script);
    if (this.space !== null) {
      this.tickSpace(program, craft, this.space);
      return;
    }
    const slot = program.slots[this.craftSlot]!;
    const frame = craftFrame(
      program,
      slot,
      craft,
      this.stick(),
      this.boundBoxes()
    );
    this.craft = frame.state;
    this.pose = this.poseFromCraft(frame.state);
    this.bindAt(this.pose);
    // Authored, as boarding's: the region is taken afresh where the craft now stands.
    this.regionIndex = this.regionAt(this.pose);
    if (frame.outcome === 'space') {
      // `$05976A`–`$059776`: into space, and back to the join without the pool.
      this.enterSpace(frame.state);
      return;
    }
    if (frame.outcome === 'refused') {
      // `$05975A`–`$059760`: the bump on sound channel B.
      this.effects.push({ cue: 'bump', type: 'sound-request' });
    }
    // `$05987A`: the fire launcher, the stepper and the attack routine, after the pass and the
    // draw. The landing handler leaves the craft inside the pass, so a hard touchdown on land
    // runs the pool on foot, where the launcher refuses.
    const landedOnLand =
      frame.outcome === 'landed' &&
      classifyPosition(this.surface, this.pose.position).kind !== 'sea';
    this.runPool(true, !landedOnLand);
    if (frame.outcome === 'landed') {
      this.touchDown();
    }
  }

  /// A frame in space: the pass over slot 0's block, the range scan, and the arrival hold. An
  /// arrival lands the craft over the Body it was raised for the same frame (#567).
  private tickSpace(
    program: CraftProgram,
    craft: CraftState,
    space: SpaceState
  ): void {
    const frame = spaceFrame(
      program,
      program.slots[0]!,
      craft,
      space,
      this.stick(),
      this.scannedBodies()
    );
    this.craft = frame.craft;
    this.space = frame.space;
    this.spaceMemory = {
      nearest: frame.space.nearest,
      pitchRate: frame.space.pitchRate,
      range: frame.space.range
    };
    this.pose = this.spacePose(frame.craft);
    // `$059906`: the space path runs the launcher and the stepper, but not the attack routine,
    // before `$059928` raises an arrival.
    this.runPool(false, true);
    if (frame.arrival !== null) {
      this.landCraft(program, frame, frame.arrival);
    }
  }

  /// The body selector `$7AA8`'s low byte, 4 × the Body, and `$FF` in space.
  private selector(): number {
    if (this.space !== null) {
      return 0xff;
    }
    return (Number(/^body-(\d+)$/.exec(this.pose.body)?.[1] ?? 0) * 4) & 0xff;
  }

  /// One pass of the moving-object pool (#581, ADR 0055), from the craft words the pass left.
  /// The camera is the craft's position: on a Body masked to the surface's 28 bits as `$7AB2` is,
  /// and in space the space words'.
  private runPool(attack: boolean, aboard: boolean): void {
    const program = this.encounterProgram;
    const craft = this.craft;
    if (program === null || this.pool === null || craft === null) {
      return;
    }
    const space = this.space;
    const camera: readonly [number, number, number] =
      space === null
        ? [surfaceLong(craft.x), craft.y >>> 0, surfaceLong(craft.z)]
        : [space.x >>> 0, space.y >>> 0, space.z >>> 0];
    const selector = this.selector();
    const result = encounterPass(program, this.pool, {
      attack,
      bodyByte: selector,
      camera,
      firing: aboard && this.firing,
      gate: this.script.encounter,
      selector,
      space: space !== null,
      speed: craft.speed,
      trig: { pitch: craft.pitch & 0x3_ff, yaw: craft.yaw & 0x3_ff }
    });
    this.pool = result.pool;
    this.script = { ...this.script, encounter: result.gate };
    const k = program.constants;
    for (const event of result.events) {
      switch (event) {
        case 'fire':
          this.effects.push({ cue: 'shot', type: 'sound-request' });
          break;
        case 'kill':
          // `$050B4A`–`$050B64`: the shot programme, the short flash and `$31` through the
          // shortened helper `$054808`.
          this.effects.push({ cue: 'shot', type: 'sound-request' });
          this.flashWord = k.killFlash & 0xff_ff;
          this.presentSystem(
            `system-string-${k.killString}` as SystemMessageId
          );
          break;
        case 'ship-fire':
          this.effects.push({ cue: 'thud', type: 'sound-request' });
          break;
        case 'steer':
          break;
        case 'zap':
          // `$050DFA`–`$050E0A`: the zapped programme, then the noise loop, which turns one table
          // word. The string, the flash and the death state follow once it returns.
          this.effects.push({ cue: 'zap', type: 'sound-request' });
          this.script = zapNoise(this.script);
          this.death = 0;
          this.deathMessage = false;
          break;
      }
    }
  }

  /// `$051D74`–`$051D94`, in the VBL handler: the flash word shifts left once a tick, and a set
  /// bit shifted out paints the view white for that tick.
  private tickFlash(): void {
    this.flashWhite = (this.flashWord & 0x80_00) !== 0;
    this.flashWord = (this.flashWord << 1) & 0xff_ff;
  }

  /// The ticks from a zap to the death loop: the noise loop, then the fade's steps, each after
  /// its VBL waits (`$050FAC`–`$050FF4`).
  private deathEnd(): number {
    const k = this.encounterProgram!.constants;
    return (
      this.content.doc.time.zapNoiseTicks + (k.fadeSteps + 1) * (k.fadeWait + 1)
    );
  }

  /// One tick from a zap on. The noise loop returns into the rest of the zap, which presents
  /// `$30` and sets the flash word, and the next pass enters the death sequence at once. Once
  /// the fade has run, the loop at `$051016` presents `$21` as soon as the row is free
  /// (`$05509C` waits for it) and then waits for a restore.
  private tickDeath(): void {
    const k = this.encounterProgram!.constants;
    const noise = this.content.doc.time.zapNoiseTicks;
    const death = this.death!;
    if (death === noise) {
      this.presentSystem(`system-string-${k.zapString}` as SystemMessageId);
      this.flashWord = k.zapFlash & 0xff_ff;
    }
    if (death >= this.deathEnd()) {
      if (!this.deathMessage && this.script.message === null) {
        this.presentSystem(`system-string-${k.deathString}` as SystemMessageId);
        this.deathMessage = this.script.message !== null;
      }
      return;
    }
    this.death = death + 1;
  }

  private screen(): DamoclesScreen {
    const death = this.death;
    if (death === null || this.encounterProgram === null) {
      return { dead: false, fade: 0, noise: false, white: this.flashWhite };
    }
    const k = this.encounterProgram.constants;
    const noise = this.content.doc.time.zapNoiseTicks;
    return {
      dead: death >= this.deathEnd(),
      fade:
        death < noise
          ? 0
          : Math.min(
              k.fadeSteps + 1,
              Math.floor((death - noise) / (k.fadeWait + 1))
            ),
      noise: death < noise,
      white: this.flashWhite
    };
  }

  /// `$059268`, the frame an arrival is raised: aboard over the landing point `$04E936` on the
  /// Body at `offset`, 25,165,824 up, with the throttle, speed, pitch and yaw the pass left. The
  /// Body is bound as a switch binds it (ADR 0046), but at the recovered point rather than an
  /// arrival Pose (ADR 0052). The destination's turn comes from the clock every Body shares,
  /// solved from the Body the craft left. The landing queues the Body's trigger, `body + $1F`.
  private landCraft(
    program: CraftProgram,
    frame: SpaceFrame,
    offset: number
  ): void {
    const index = offset / 4;
    const bodyId = `body-${index}`;
    const body = this.scannedBodies()[index]!;
    const turn = this.turnOf(index);
    const point = landingPoint(program.arithmetic, frame.space, body, turn);
    const surface = this.surfaceFor(bodyId);
    this.space = null;
    this.spaceEntry = null;
    this.surface = surface;
    this.bodyTurn = turn;
    this.subStellar = point.terminator;
    this.boundPlacement = null;
    this.regionIndex = null;
    this.floor = 0;
    this.floorSurface = null;
    this.arrivalFloor = null;
    this.attachments = new Map();
    this.doorway = null;
    this.doorsMoving = false;
    this.boardedFrom = undefined;
    // `$56488` binds the Body at the point before the support search reads its boxes.
    const over = {
      ...frame.craft,
      x: point.x,
      y: program.constants.landingY,
      z: point.z
    };
    this.pose = { ...this.poseFromCraft(over), body: bodyId };
    this.bindAt(this.pose);
    this.craft = land(program, frame.craft, point, this.boundBoxes());
    this.pose = this.poseFromCraft(this.craft);
    this.regionIndex = this.regionAt(this.pose);
    this.readBody();
    const trigger = landingTrigger(offset);
    if (trigger !== null) {
      // The Body's landing message, which draws its random skip here (#576).
      const transition = fireTrigger(this.script, trigger, this.scriptRules);
      this.script = transition.state;
      this.effects.push(...transition.effects);
    }
  }

  /// Body `index`'s rotation accumulator now: the current Body's carried along the clock every
  /// Body turns by, or the first world's where the current turn is off it.
  private turnOf(index: number): number {
    const bodies = this.content.catalogue.craft!.bodies;
    const from = Number(/^body-(\d+)$/.exec(this.pose.body)?.[1] ?? -1);
    const start = bodies[from]?.turn;
    const to = {
      rate: this.rateOf(`body-${index}`),
      start: bodies[index]!.turn
    };
    return (
      (start === undefined
        ? null
        : turnOnClock(
            { rate: this.rotationRate(), start, turn: this.bodyTurn },
            to
          )) ?? to.start
    );
  }

  /// Esc aboard on the ST (`$055822`): the launch. It is silent on the ground and in space, and
  /// presents system string 21 for a craft that cannot fly in space. A launch asks for the key
  /// effect `$054848`.
  launchCraft(): void {
    const program = this.craftProgram;
    const craft = this.craft;
    if (
      program === null ||
      craft === null ||
      this.craftHeld !== null ||
      this.death !== null
    ) {
      return;
    }
    const result = launch(
      program,
      program.slots[this.craftSlot]!,
      craft,
      this.space !== null
    );
    switch (result.outcome) {
      case 'launched':
        this.craft = result.state;
        this.effects.push({ cue: 'throttle', type: 'sound-request' });
        break;
      case 'refused':
        this.presentSystem('system-string-21');
        break;
      case 'ignored':
        break;
    }
  }

  /// `$057D16`–`$057D60`, after the landing handler has set the craft down and stopped it: the
  /// island answer masked with the Body's `$794A` decides. Land runs the leave path and the
  /// noise `$04C5A8`; sea keeps the player aboard under `$04C016`. `$794A`'s high byte is `$FF`
  /// on Eris, the only Body it is recovered for, so the port takes the answer unmasked.
  /// Not modelled: the engine flag `$7C0C`, `$78EE`, and the pause `$051036`.
  private touchDown(): void {
    const sea =
      classifyPosition(this.surface, this.pose.position).kind === 'sea';
    if (sea) {
      this.effects.push({ cue: 'splash', type: 'sound-request' });
      return;
    }
    this.effects.push({ cue: 'blast', type: 'sound-request' });
    this.leave();
  }

  /// A throttle key aboard (`$0556AA`): the table entry at `$0557D6` for the ST scancode. Space's
  /// `$80` writes the zero and leaves the speed to decay. A change asks for the key effect
  /// `$054848`; the same value again writes nothing. A write clears the launch swing `$7B0C`.
  /// The trim `$7A1C` it clears is not modelled.
  throttleKey(scancode: number): void {
    const program = this.craftProgram;
    const craft = this.craft;
    if (program === null || craft === null || this.death !== null) {
      return;
    }
    const entry = program.throttleKeys.find(
      key => key.scancode === scancode
    )?.entry;
    if (entry === undefined) {
      return;
    }
    const throttle = throttleForEntry(craft, entry, program.constants);
    if (throttle === undefined) {
      return;
    }
    this.craft = { ...craft, swing: false, throttle };
    this.effects.push({ cue: 'throttle', type: 'sound-request' });
  }

  /// `-` and `=` aboard (`$05575E`, `$055798`): the throttle scaled down or up a step.
  throttleScale(direction: -1 | 1): void {
    const program = this.craftProgram;
    const craft = this.craft;
    if (program === null || craft === null || this.death !== null) {
      return;
    }
    const next =
      direction < 0 ? throttleDown(program, craft) : throttleUp(program, craft);
    if (next === undefined) {
      return;
    }
    this.craft = next;
    this.effects.push({ cue: 'throttle', type: 'sound-request' });
  }

  /// `B`: the board gate `$054302`–`$05434E`, its eight tests in the Reference Build's order
  /// (docs/design/damocles-boarding-admission.md). The first that fails decides; every refusal
  /// but the key test's is silent and changes nothing.
  board(): { readonly kind: 'boarded' | 'refused' } {
    // From a zap on, the main loop reads no key but the death loop's.
    if (this.death !== null) {
      return { kind: 'refused' };
    }
    // 1. The nearest drawn object is inside the board reach, which is not the Take's.
    const selected = this.nearestCandidate(BOARD_REACH);
    // 2. The Selection names an instance. Slot 0 is no published instance.
    const instance =
      selected === undefined ? undefined : this.instanceFor(selected.id);
    if (selected === undefined || instance === undefined) {
      return { kind: 'refused' };
    }
    // 3. The current structure region's flags have bit 14 set, or no region is current.
    const region =
      this.regionIndex === null
        ? undefined
        : this.boundPlacement?.selection?.structure.regions[this.regionIndex];
    if (region !== undefined && (region.flags & 0x40_00) === 0) {
      return { kind: 'refused' };
    }
    // 4. Slots 1 to 22: the chooser's admission is published for exactly those.
    const boarding = instance.boarding;
    if (boarding === null || boarding.admission === null) {
      return { kind: 'refused' };
    }
    // 5. On foot. 6. Not on the VOID staging Body.
    if (this.occupied !== null || this.pose.body === VOID_BODY) {
      return { kind: 'refused' };
    }
    // 7. The key test asks the Carried Stack for the paired object; unkeyed and seatable
    // admissions need none. A missing pair can never be carried.
    if (
      boarding.admission === 'paired' &&
      (boarding.pairedInstance === null ||
        !this.liveCarriedInstance(boarding.pairedInstance))
    ) {
      const refusal = BOARD_REFUSALS.find(id => id === boarding.refusal);
      if (refusal === undefined) {
        throw new Error(
          `Damocles cannot present board refusal ${boarding.refusal}`
        );
      }
      this.presentSystem(refusal);
      return { kind: 'refused' };
    }
    // 8. The model guard: the model opens with the single-Y-turn orientation command.
    if (!boarding.boardable) {
      return { kind: 'refused' };
    }

    // `$054350`–`$0543BA`, in one step. The Carried Stack is unchanged: boarding does not
    // consume the Vehicle Key.
    const previous = this.residenceFor(instance.id);
    this.boardedFrom = this.residence.get(instance.id);
    this.residence.set(instance.id, {
      kind: 'occupied',
      placementClass: previous?.placementClass ?? instance.placementClass ?? 0
    });
    this.occupied = instance.id;
    // The instance angle byte, 256 a turn, becomes the yaw word, 1024 a turn, with no model
    // bias ($054390). The craft words take the seat; pitch is not written, so the view keeps
    // the on-foot pitch.
    this.seat(
      instance.id,
      {
        ...this.pose,
        position: {
          x: selected.position.x,
          y: selected.position.y + this.rules.eyeHeight,
          z: selected.position.z
        }
      },
      (this.angleByte(instance.id) * 4) & 0xff_ff
    );
    this.pose = this.poseFromCraft(this.craft!);
    // Authored: the region is taken afresh at the new Pose. Whether the original's changes here
    // is not established (#407), but keeping the pressed-from region would have the first step
    // after leaving clamp the player back into it, away from the object's origin.
    this.bindAt(this.pose);
    this.regionIndex = this.regionAt(this.pose);
    return { kind: 'boarded' };
  }

  /// `L`: the leave path `$05449C`–`$05450E`. Its four tests refuse silently.
  leave(): { readonly kind: 'left' | 'refused' } {
    // 1. Aboard.
    const instance = this.occupied;
    if (instance === null || this.death !== null) {
      return { kind: 'refused' };
    }
    // 2. The occupied object is in ground contact `$7ACA` ($0544A8).
    // 3. Not at sea by the island classification. 4. Not on the VOID staging Body.
    if (
      this.craft?.contact === 0 ||
      classifyPosition(this.surface, this.pose.position).kind === 'sea' ||
      this.pose.body === VOID_BODY
    ) {
      return { kind: 'refused' };
    }
    const occupied = this.residence.get(instance);
    const placed = this.directResidence();
    if (
      placed.kind === 'structure' &&
      !validStructureResidence(this.content.catalogue, placed)
    ) {
      // Authored: a structure placement the session cannot hold would lose the object, so it
      // returns where boarding found it, however far it was driven.
      this.restoreBoardedFrom(this.residence, instance);
    } else {
      this.residence.set(instance, placed);
    }
    // The stop preset runs and roll and pitch are levelled ($0544C2-$0544CC). The instance angle
    // byte takes the yaw ÷ 4 ($0544FA).
    if (this.craft !== null) {
      this.angleBytes.set(instance, (this.craft.yaw >> 2) & 0xff);
    }
    this.pose = {
      body: this.pose.body,
      heading: this.pose.heading,
      pitch: 0,
      position: this.pose.position
    };
    this.craft = null;
    this.craftHeld = null;
    this.space = null;
    this.spaceEntry = null;
    this.occupied = null;
    this.boardedFrom = undefined;
    return { kind: 'left' };
  }

  take(): { readonly kind: 'refused' | 'took' } {
    // Authored: no capture shows a Take completing aboard (#407).
    if (this.occupied !== null || this.death !== null) {
      return { kind: 'refused' };
    }
    const selection = this.selection();
    if (selection.kind === 'none' || !selection.inRange) {
      return { kind: 'refused' };
    }
    const instance = this.instanceFor(selection.instance);
    const handling = instance?.handling;
    const slot = /^object-slot-(\d+)$/.exec(selection.instance);
    if (slot !== null && Number(slot[1]) === 0) {
      return { kind: 'refused' };
    }
    if (
      this.pose.body === VOID_BODY ||
      handling === null ||
      handling === undefined
    ) {
      return { kind: 'refused' };
    }
    if (this.scrollCounter !== 0) {
      return { kind: 'refused' };
    }
    if ((handling.byte & 0x10) !== 0 && !this.liveCarriedSlot(0)) {
      return { kind: 'refused' };
    }
    if (
      (handling.byte & 0x20) !== 0 &&
      !this.liveCarriedSlot(0) &&
      !this.liveCarriedSlot(157) &&
      !this.liveCarriedSlot(158)
    ) {
      this.presentSystem('system-string-2');
      return { kind: 'refused' };
    }
    if (this.carried.length === this.capacity()) {
      return { kind: 'refused' };
    }
    const previous = this.residenceFor(selection.instance);
    const carriedResidence: Residence = {
      kind: 'carried',
      placementClass: previous?.placementClass ?? instance?.placementClass ?? 0
    };
    this.carried = [selection.instance, ...this.carried];
    if (
      selection.instance === 'object-slot-108' &&
      this.briefcaseStore.length > 0
    ) {
      this.carried = [
        selection.instance,
        ...this.carried.slice(1),
        ...this.briefcaseStore
      ];
      for (const stored of this.briefcaseStore) {
        const storedInstance = this.instanceFor(stored);
        this.residence.set(stored, {
          kind: 'carried',
          placementClass: storedInstance?.placementClass ?? 0
        });
      }
      this.briefcaseStore = [];
    }
    this.residence.set(selection.instance, carriedResidence);
    this.scrollCounter = -16;
    // $0543D2 walks the object-to-trigger table for every committed pickup, not just the key.
    const trigger = TRIGGER_FOR_RESIDENT[selection.instance];
    if (trigger !== undefined) {
      const transition = fireTrigger(this.script, trigger, this.scriptRules);
      this.script = transition.state;
      this.effects.push(...transition.effects);
    }
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'take', type: 'sound-request' });
    }
    return { kind: 'took' };
  }

  rotateForward(): { readonly kind: 'refused' | 'rotated' } {
    if (
      this.scrollCounter !== 0 ||
      this.carried.length === 0 ||
      this.death !== null
    ) {
      return { kind: 'refused' };
    }
    const [head, ...rest] = this.carried;
    this.carried = [...rest, head!];
    this.scrollCounter = 16;
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'take', type: 'sound-request' });
    }
    return { kind: 'rotated' };
  }

  rotateBackward(): { readonly kind: 'refused' | 'rotated' } {
    if (
      this.scrollCounter !== 0 ||
      this.carried.length === 0 ||
      this.death !== null
    ) {
      return { kind: 'refused' };
    }
    const tail = this.carried.at(-1)!;
    this.carried = [tail, ...this.carried.slice(0, -1)];
    this.scrollCounter = -16;
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'take', type: 'sound-request' });
    }
    return { kind: 'rotated' };
  }

  private supportResidence(support: {
    readonly id: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
  }): PlacedResidence | undefined {
    const residence = this.residenceFor(support.id);
    if (
      residence === undefined ||
      residence.kind === 'carried' ||
      residence.kind === 'occupied'
    ) {
      return undefined;
    }
    const model = modelSummaryById(
      this.content.catalogue,
      this.instanceFor(support.id)?.model
    );
    const top = model?.supportTop;
    if (top === undefined || top === null) {
      return undefined;
    }
    const position = { ...support.position, y: support.position.y + top };
    if (position.y > this.pose.position.y) {
      return undefined;
    }
    if (residence.kind === 'surface') {
      return { ...residence, position };
    }
    return {
      ...residence,
      position: {
        x: position.x - (this.boundPlacement?.position.x ?? 0),
        y: position.y - (this.boundPlacement?.position.y ?? 0),
        z: position.z - (this.boundPlacement?.position.z ?? 0)
      }
    };
  }

  private dropResidence(head: string): PlacedResidence | undefined {
    const selected = this.nearestCandidate(128);
    const support =
      selected === undefined || selected.id === 'object-slot-74'
        ? undefined
        : this.instanceFor(selected.id);
    const dropped = this.instanceFor(head);
    const droppedHandling = dropped?.handling;
    if (support !== undefined) {
      const supportHandling = support.handling;
      if (
        droppedHandling === null ||
        droppedHandling === undefined ||
        supportHandling === null ||
        supportHandling === undefined ||
        (!this.liveCarriedSlot(39) &&
          (droppedHandling.requiredSupportRank === 0 ||
            supportHandling.suppliedSupportRank === 0 ||
            supportHandling.suppliedSupportRank <
              droppedHandling.requiredSupportRank))
      ) {
        this.presentSystem('system-string-9');
        return undefined;
      }
      // `$0546A4`-`$0546CA` copies the support's placement: its X/Z, body, level, region
      // byte and placement class (`$0546C4`), so the dropped object takes the support's class.
      const placed = this.supportResidence(selected!);
      if (placed === undefined) {
        this.presentSystem('system-string-9');
        return undefined;
      }
      if (
        placed.kind === 'structure' &&
        !validStructureResidence(this.content.catalogue, placed)
      ) {
        this.presentSystem('system-string-9');
        return undefined;
      }
      return placed;
    }

    // `$05462A`: the direct path refuses silently without ground contact. On foot the player
    // is always in contact; aboard, a craft off the ground has cleared it (#357).
    if (this.craft !== null && this.craft.contact === 0) {
      return undefined;
    }
    // Aboard, `$7AAE` is not 1: the handler skips the interior group search ($05453A) and
    // direct placement writes insertion group zero, the surface placement. The zone is still
    // taken against the bound structure.
    const placed =
      this.occupied === null
        ? this.directResidence()
        : this.directResidence(this.pose, this.boundPlacement, null);
    if (placed.kind === 'surface') {
      return placed;
    }
    const parent = instanceById(this.content.catalogue, placed.parent);
    if (
      !parent?.associationGroups?.some(
        group => group.group === placed.insertionGroup
      ) ||
      !validStructureResidence(this.content.catalogue, placed)
    ) {
      this.presentSystem('system-string-9');
      return undefined;
    }
    return placed;
  }

  /// `$0546CC`, the direct-placement Drop: the point one eye height below the Pose, on the
  /// surface where no structure region is current or the region's flags have bit 14 set, and
  /// otherwise in the bound structure at the current region's insertion group. The Drop's own
  /// checks are the caller's; leaving enters here after them.
  private directResidence(
    pose = this.pose,
    structure = this.boundPlacement,
    regionIndex = this.regionIndex,
    floor = this.floor
  ): PlacedResidence {
    const region =
      regionIndex === null
        ? undefined
        : structure?.selection?.structure.regions[regionIndex];
    const exterior = region !== undefined && (region.flags & 0x40_00) !== 0;
    // `$0546FC` copies $7A39, which the Drop ($054520) and leave ($05449C) paths both
    // recompute from the Pose first: the zone against the bound structure's extent (#356).
    const placementClass = placementZone(pose.position, structure);
    if (structure === null || exterior || regionIndex === null) {
      return {
        body: pose.body,
        kind: 'surface',
        placementClass,
        position: {
          x: pose.position.x,
          y: pose.position.y - this.rules.eyeHeight,
          z: pose.position.z
        }
      };
    }
    return {
      body: pose.body,
      insertionGroup: regionIndex + 1,
      kind: 'structure',
      // The bound placement carries the structure selected by this Floor's table entry.
      level: floor,
      parent: structure.id,
      placementClass,
      position: {
        x: pose.position.x - structure.position.x,
        y: pose.position.y - this.rules.eyeHeight - structure.position.y,
        z: pose.position.z - structure.position.z
      }
    };
  }

  private finishDrop(head: string, residence: Residence): void {
    if (head === 'object-slot-108') {
      const remaining = this.carried.slice(1);
      this.carried = remaining.slice(0, 9);
      this.briefcaseStore = remaining.slice(9);
      for (const stored of this.briefcaseStore) {
        this.residence.delete(stored);
      }
    } else {
      this.carried = this.carried.slice(1);
    }
    this.residence.set(head, residence);
    this.scrollCounter = 16;
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'drop', type: 'sound-request' });
    }
  }

  drop(): { readonly kind: 'dropped' | 'refused' } {
    const head = this.carried[0];
    if (
      head === undefined ||
      this.pose.body === VOID_BODY ||
      this.scrollCounter !== 0 ||
      this.death !== null
    ) {
      return { kind: 'refused' };
    }
    if (this.pendingBriefcaseDrop !== null) {
      if (
        this.script.message !== null ||
        this.script.execution !== null ||
        this.pendingBriefcaseDrop.head !== head
      ) {
        return { kind: 'refused' };
      }
      // The warning may outlive movement or a workspace change. Its saved placement
      // is not authority for a later Drop: run the live support and placement gates again.
      const residence = this.dropResidence(head);
      if (residence === undefined) {
        return { kind: 'refused' };
      }
      this.pendingBriefcaseDrop = null;
      this.finishDrop(head, residence);
      return { kind: 'dropped' };
    }
    const residence = this.dropResidence(head);
    if (residence === undefined) {
      return { kind: 'refused' };
    }
    if (head === 'object-slot-108' && this.carried.length > 10) {
      this.pendingBriefcaseDrop = { head, residence };
      this.presentSystem('system-string-1');
      return { kind: 'refused' };
    }
    this.finishDrop(head, residence);
    return { kind: 'dropped' };
  }

  /// Switch to another Body, naming a Pose id or a Body with exactly one admitted Pose.
  ///
  /// One commit. Before it nothing happened; after it the current Body, the Pose and the bound
  /// Structure Workspace have all moved together. There is no transit, no duration and no
  /// animation, because none is recovered and none is play.
  ///
  /// Validate, then commit: the resolution and the surface are both computed before any field
  /// is replaced, so a decline leaves the live session exactly as it was. A half-switched
  /// session is not a state this contract admits.
  ///
  /// What it does not touch: the Carried Stack, which is body-independent by the original's own
  /// rule because carried objects hold body byte $78 (VOID); Object Residence, which is
  /// body-scoped and materialises lazily, so a Body never visited has no state to correct; and
  /// the Damocles Script, which is neither cancelled, restarted nor advanced. It stores no
  /// workspace binding -- binding is recomputed from the Pose exactly as walking does.
  switchToPose(
    name: string
  ):
    | { readonly kind: 'declined'; readonly reason: string }
    | { readonly kind: 'switched'; readonly pose: string } {
    // Authored: a switch would carry the player away from an object resident nowhere (#407).
    if (this.occupied !== null) {
      return { kind: 'declined', reason: 'the player is aboard; leave first' };
    }
    const resolution: PoseResolution = resolvePose(
      this.content.poses,
      this.content.catalogue,
      name
    );
    if (resolution.kind === 'unknown') {
      return { kind: 'declined', reason: `no Body or Pose named '${name}'` };
    }
    if (resolution.kind === 'ambiguous') {
      return {
        kind: 'declined',
        reason: `that Body has ${resolution.poses.length} admitted Poses: ${resolution.poses.join(', ')}`
      };
    }
    if (resolution.kind === 'unanchored') {
      return {
        kind: 'declined',
        reason: `${resolution.pose.id} has no recovered workspace origin`
      };
    }
    const arrival = resolution.pose;
    if (!arrival.onFoot) {
      return {
        kind: 'declined',
        reason: `${arrival.id} is not an on-foot Pose`
      };
    }
    let surface: ErisSurface;
    try {
      surface = this.surfaceFor(arrival.body);
    } catch (error) {
      return {
        kind: 'declined',
        reason: error instanceof Error ? error.message : String(error)
      };
    }
    const pose = poseOfArrival(arrival, this.content.doc);
    // The Pose lands on the Floor its capture stood on, never one read off its height (#505).
    // Where the structure in its cell is in hand its Floor Table must bind that Floor; where it
    // is not, the arrival waits for it.
    const ground = structureInCell(surface, pose.position);
    if (
      arrival.floor !== 0 &&
      ground !== undefined &&
      !this.floorBound(ground, arrival.floor)
    ) {
      return {
        kind: 'declined',
        reason: `${ground.name} binds no Floor ${arrival.floor}`
      };
    }
    // Everything that could refuse has refused. From here the commit cannot fail.
    this.surface = surface;
    this.pose = pose;
    this.bodyTurn = arrival.bodyTurn;
    this.subStellar = null;
    this.boundPlacement = null;
    this.regionIndex = null;
    this.attachments = new Map();
    this.arrivalFloor =
      arrival.floor === 0
        ? null
        : { cell: cellOf(pose.position, surface.grid), floor: arrival.floor };
    this.bindAt(this.pose);
    this.readBody();
    return { kind: 'switched', pose: arrival.id };
  }

  /// Prepare every placed Model on the target Body before validating an exact pin. A missing
  /// Model cannot silently turn a building into empty ground. This changes content caches only.
  static async prepareAtlasTravel(
    content: DamoclesContent,
    target: AtlasDestination
  ): Promise<void> {
    if (workspaceOriginFor(content, target.bodyId) === undefined) {
      throw new Error('This Body has no admitted arrival data.');
    }
    const errors = await content.models.prefetch(
      content.catalogue.instances
        .filter(instance => instance.location?.body === target.bodyId)
        .map(instance => instance.model)
    );
    if (errors.length > 0) {
      throw new Error(
        `Destination content could not be loaded: ${errors[0]!.message}`
      );
    }
  }

  /// Authored Atlas Travel. Validate against ground, region and Leave rules before one commit.
  travelToAtlas(
    target: AtlasDestination
  ):
    | { readonly kind: 'travelled' }
    | { readonly kind: 'declined'; readonly reason: string } {
    if (![target.x, target.z].every(Number.isFinite)) {
      return decline('The pin must have finite Body Coordinates.');
    }
    const origin = workspaceOriginFor(this.content, target.bodyId);
    const arrival = this.content.poses.poses.find(
      item => item.body === target.bodyId && item.workspaceOrigin !== null
    );
    if (
      origin === undefined ||
      arrival === undefined ||
      target.bodyId === VOID_BODY
    ) {
      return decline('This Body has no admitted arrival data.');
    }
    if (
      this.content.catalogue.instances.some(
        instance =>
          instance.location?.body === target.bodyId &&
          this.content.models.peek(instance.model) === undefined
      )
    ) {
      return decline('Destination content has not finished loading.');
    }
    const surface = erisSurfaceFrom(
      this.content.catalogue,
      this.content.models,
      this.content.doc,
      { bodyId: target.bodyId, origin }
    );
    const pose: Pose = {
      body: target.bodyId,
      heading: this.pose.heading,
      pitch: 0,
      position: {
        x: wrap(target.x) * surface.grid.cellUnits,
        y: this.rules.eyeHeight,
        z: wrap(target.z) * surface.grid.cellUnits
      }
    };
    if (classifyPosition(surface, pose.position).kind === 'sea') {
      return decline('The pin is at sea. Choose a point on land.');
    }
    const bound = structureInCell(surface, pose.position) ?? null;
    const region =
      bound !== null && insideCentralCellHalf(pose.position, surface.grid)
        ? structureRegionAt(bound, pose, this.negateModelZ)
        : null;
    if (bound !== null && region !== null) {
      const clamped = clampStructureStep(
        bound,
        pose,
        pose,
        this.negateModelZ,
        () => 'closed',
        region
      ).pose;
      if (
        Math.abs(clamped.position.x - pose.position.x) > 0.000_001 ||
        Math.abs(clamped.position.z - pose.position.z) > 0.000_001
      ) {
        return decline('The pin is too close to a structure boundary.');
      }
    }
    if (this.occupied !== null) {
      const residence = this.directResidence(pose, bound, region, 0);
      if (
        residence.kind === 'structure' &&
        !validStructureResidence(this.content.catalogue, residence)
      ) {
        return decline('The occupied object cannot be left at this pin.');
      }
    }
    if (this.pose.body !== pose.body) {
      this.bodyTurn = arrival.bodyTurn;
      this.subStellar = null;
    }
    this.surface = surface;
    this.surfaceModels = this.content.models.size;
    this.pose = pose;
    if (this.occupied !== null && this.craft !== null) {
      // Authored: aboard, the craft is set down at the pin at rest, facing as it was, so the
      // next pass flies from the pin rather than from where the craft was.
      this.seat(this.occupied, pose, this.craft.yaw);
      this.pose = this.poseFromCraft(this.craft);
    }
    this.boundPlacement = bound;
    if (bound !== null) {
      this.readFloors(bound);
    }
    this.regionIndex = region;
    this.floor = 0;
    this.floorSurface = null;
    this.arrivalFloor = null;
    this.attachments = shutAttachments(bound ?? undefined);
    this.doorway = null;
    this.ride = null;
    this.doorsMoving = false;
    this.boardedFrom = undefined;
    this.intent = IDLE;
    return { kind: 'travelled' };
  }

  /// Land at an Eris cell's centre, keeping heading and the walk eye height.
  teleportToCell(x: number, z: number): void {
    // Authored, as the Body switch is: aboard, the occupied object is resident nowhere (#407).
    if (this.occupied !== null) {
      throw new Error('the player is aboard; leave first');
    }
    const { grid } = this.surface;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(z) ||
      x < 0 ||
      z < 0 ||
      x >= grid.cellsPerAxis ||
      z >= grid.cellsPerAxis
    ) {
      throw new Error(
        `cell ${x}-${z} is not on Eris (0 through ${grid.cellsPerAxis - 1})`
      );
    }
    this.pose = {
      body: this.pose.body,
      heading: this.pose.heading,
      pitch: this.pose.pitch,
      position: {
        x: (x + grid.origin.x + 0.5) * grid.cellUnits,
        y: this.rules.eyeHeight,
        z: (z + grid.origin.z + 0.5) * grid.cellUnits
      }
    };
    this.boundPlacement = null;
    this.arrivalFloor = null;
    this.bindAt(this.pose);
  }

  /// Whether the player is in a Damocles Lift: the dispatcher's gate `$0555DC`–`$0555F0`, on foot
  /// in a structure region whose flags have bit 13 (docs/research/damocles-lift-control.md). The
  /// Working Authority also asks that `$7882` be zero, a digit-key mode the port does not have.
  get inLift(): boolean {
    const region =
      this.regionIndex === null
        ? undefined
        : this.boundPlacement?.selection?.structure.regions[this.regionIndex];
    return (
      this.occupied === null &&
      region !== undefined &&
      (region.flags & LIFT_REGION) !== 0
    );
  }

  /// A lift key asking for `floor`: `$055AE0`. Outside a lift the key is not the lift's. In one,
  /// the Floor the label shows now, or one the Floor Table leaves zero, is refused silently and
  /// changes nothing.
  ///
  /// An admitted key starts the ride, or during one replaces its destination, and pins the
  /// doorway's door shut. `advance` then plays the ride as #472 recovered it
  /// (docs/research/damocles-lift-ride.md): once the door is shut the label steps one Floor
  /// every 25 ticks, and one period after it shows the destination the player arrives.
  rideLift(floor: number): {
    readonly kind: 'admitted' | 'noLift' | 'refused';
  } {
    if (!this.inLift) {
      return { kind: 'noLift' };
    }
    if (this.death !== null) {
      return { kind: 'refused' };
    }
    const ground = this.groundPlacement();
    if (
      floor === this.labelFloor ||
      ground === undefined ||
      !this.floorBound(ground, floor)
    ) {
      return { kind: 'refused' };
    }
    this.ride = {
      countdown: this.ride?.countdown ?? LIFT_STEP_TICKS,
      destination: floor,
      label: this.labelFloor
    };
    // `$055B0A` sets the doorway's latch moving, even where its door is already shut, so the
    // countdown waits for the next pass to clear it.
    const door =
      this.doorway === null ? undefined : this.attachments.get(this.doorway);
    if (door !== undefined) {
      this.attachments.set(this.doorway!, { ...door, latch: 'moving' });
    }
    return { kind: 'admitted' };
  }

  /// `$7AC4`: the Floor the Floor Label shows. It is the player's Floor except during a ride,
  /// when it steps through each Floor passed.
  get labelFloor(): number {
    return this.ride?.label ?? this.floor;
  }

  /// Whether the door a ride pins has stopped: its latch reads `$00`, since the ride is closing it
  /// (`$055A76`). A doorway slot the bound structure has no attachment for has no door to wait on.
  private rideDoorShut(): boolean {
    return this.doorway === null || this.latchFor(this.doorway) === 'closed';
  }

  /// One tick of the bound structure's doors: `$05AA3C`, which the frame loop calls once a
  /// substep. Each door opens while the player at `position` is inside its Proximity Box and
  /// holds its key, and closes otherwise. Says whether any door's path ran: `$5A9D8`, which
  /// `$05AAA4` and `$05AC00` raise, including on the pass that only settles a latch.
  private moveAttachments(position: Vector3): boolean {
    const placement = this.boundPlacement;
    if (placement === null) {
      return false;
    }
    const local = structureLocalPosition(
      placement,
      position,
      this.negateModelZ
    );
    // `$055B04`: a ride pins the doorway's door shut whether or not the player is near it.
    const pinned = this.ride === null ? null : this.doorway;
    let moving = false;
    for (const attachment of placement.selection!.structure.attachments) {
      const approached =
        attachment.slot !== pinned &&
        insideLocalBox(local, attachment.proximityBox);
      const opening =
        approached && this.attachmentKeyHeld(placement, attachment);
      if (approached && !opening) {
        this.presentSystem('system-string-0');
      }
      const next = stepAttachment(
        attachment,
        this.attachments.get(attachment.slot) ?? SHUT,
        opening
      );
      if (next !== undefined) {
        this.attachments.set(attachment.slot, next);
        moving = true;
      }
    }
    return moving;
  }

  /// `$05A9EE`–`$05AA3A`, at the end of the door animation `$05AA3C`, which runs after the ride
  /// step: a rising edge of "any door moved" arms the door tone `$04C37A` in the second sound
  /// vector `$04BF58`, and a falling edge the noise burst `$04C2B8`. `$7A0C`, which silences the
  /// take cue, is not tested. The edge is dropped, though still latched, while the death state
  /// `$7A64` is set outside a structure region (bit 14 of `$7B34`), and the port has no death
  /// state, so every edge asks.
  private askForDoorTone(doorsMoving: boolean): void {
    if (doorsMoving === this.doorsMoving) {
      return;
    }
    this.doorsMoving = doorsMoving;
    this.effects.push({
      cue: doorsMoving ? 'door-start' : 'door-stop',
      type: 'sound-request'
    });
  }

  /// `$05958A`–`$0595B2`, after the substep loop: a step refused this frame and not the last
  /// arms the thud `$04C630` in the first sound vector (`$059594`), so pushing into a wall asks
  /// once as contact starts, not once a frame. The edge is not kept in a Save.
  private askForThud(refused: boolean): void {
    if (refused && !this.stepRefused) {
      this.effects.push({ cue: 'thud', type: 'sound-request' });
    }
    this.stepRefused = refused;
  }

  /// One tick of a pending ride: the step routine `$055A6E`, which the frame loop calls once a
  /// substep. A substep is one VBL while a frame takes 4 to 8 of them, which the port's frame
  /// clock stands in for.
  private stepRide(doorShut: boolean): void {
    const ride = this.ride;
    // `$055A76`: nothing counts while the pinned door is still moving.
    if (ride === null || !doorShut) {
      return;
    }
    if (ride.countdown > 1) {
      this.ride = { ...ride, countdown: ride.countdown - 1 };
      return;
    }
    if (ride.label !== ride.destination) {
      this.ride = {
        countdown: LIFT_STEP_TICKS,
        destination: ride.destination,
        label: nextLabel(ride.label, ride.destination)
      };
      return;
    }
    // `$055B12`–`$055B88`: the arrival. The Floor's structure is bound, Y set and the pitch
    // levelled; X, Z and yaw stay. The new structure's doors start shut and open by proximity.
    if (this.changeFloor(ride.destination).kind !== 'moved') {
      // Authored: the Floor's structure is not read yet, so the arrival waits a tick for it,
      // asking again in case a read failed.
      const ground = this.groundPlacement();
      if (ground !== undefined) {
        this.readFloors(ground);
      }
      this.ride = { ...ride, countdown: 1 };
      return;
    }
    this.pose = {
      ...this.pose,
      pitch: pitchFromWord(ARRIVAL_PITCH_WORD, this.content.doc.orientation)
    };
    // `$055B88` ends in the shared sound request `$054848` a take makes.
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'take', type: 'sound-request' });
    }
  }

  /// Stand on another Floor of the bound structure, as the development console's `floor N`.
  ///
  /// The lift's arrival and the console's are both this instant rebind. It acts only where the
  /// bound structure's Floor Table binds `floor`, and there binds that Floor's structure, sets Y
  /// to the Floor times the storey pitch plus the eye height, and leaves X, Z and the view as
  /// they are. The new structure's attachments start closed and its region is taken afresh. Any
  /// ride pending ends.
  changeFloor(
    floor: number
  ):
    | { readonly kind: 'moved' }
    | { readonly kind: 'refused'; readonly reason: string } {
    // Authored, as the Body switch is: aboard, the occupied object is resident nowhere (#407).
    if (this.occupied !== null) {
      return { kind: 'refused', reason: 'the player is aboard; leave first' };
    }
    const ground = this.groundPlacement();
    if (ground === undefined) {
      return { kind: 'refused', reason: 'not inside a structure' };
    }
    const storey = this.content.models.peek(ground.modelId)?.storeyHeight;
    if (storey === undefined || !this.floorBound(ground, floor)) {
      return {
        kind: 'refused',
        reason: `${ground.name} binds no Floor ${floor}`
      };
    }
    const floored = floorPlacement(ground, this.content.models, floor);
    if (floored === undefined) {
      return {
        kind: 'refused',
        reason: `Floor ${floor} of ${ground.name} is not read yet`
      };
    }
    this.floor = floor;
    this.boundPlacement = floored;
    this.ride = null;
    this.attachments = shutAttachments(floored);
    this.pose = {
      ...this.pose,
      position: {
        ...this.pose.position,
        y: floor * storey + this.rules.eyeHeight
      }
    };
    this.enterRegion(this.regionAt(this.pose));
    return { kind: 'moved' };
  }
}
