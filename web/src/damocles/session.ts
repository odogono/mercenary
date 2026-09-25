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
import {
  displayCells,
  type DamoclesDisplay,
  type DamoclesMessageId,
  type DisplayCells
} from './display.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { classifyPosition, type LandSea } from './islands.ts';
import { walk, type WalkRules } from './mover.ts';
import {
  poseOfArrival,
  resolvePose,
  type ArrivalPoses,
  type PoseResolution
} from './poses.ts';
import {
  catalogueResidence,
  insertionsInRegion,
  validStructureResidence,
  type PlacedResidence,
  type Residence,
  type ResidenceDeparture
} from './residence.ts';
import {
  LIFT_STEP_TICKS,
  validateOccupancy,
  type BoundStructureSnapshot,
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
  type Effect,
  type Presenting,
  type ScriptRules,
  type ScriptState
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
  stepAttachment,
  structureLocalPosition,
  structureRegionAt,
  type AttachmentLatch,
  type AttachmentState
} from './selection.ts';
import { presentedText, type DamoclesStrings } from './strings.ts';
import { advanceTurn, inDaylight } from './terminator.ts';
import {
  bearingFromYaw,
  cellOf,
  erisSurfaceFrom,
  floorPlacement,
  floorsOf,
  insideCentralCellHalf,
  islandLocalCell,
  modelWaves,
  nearestIsland,
  pitchFromWord,
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
/// The player is on foot on one admitted Body, or aboard one resident object there that does not
/// move (#407). Object Residence, the head-significant Carried Stack, live inventory capacity,
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
  /// The terminator's answer for the Pose (`$050562`): the sky takes the Body's day word and
  /// every `$80xx` colour the scene palette's day half (#494, #497).
  readonly daylight: boolean;
  readonly display: DamoclesDisplay;
  readonly displayCells: DisplayCells;
  readonly elapsed: number;
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
  readonly scrollCounter: number;
  readonly selection: Selection;
  readonly structure: BoundStructureSnapshot | null;
  /// The workspace the player is standing on, anchored at the Body the Pose names. A switch
  /// rebuilds it, so a renderer that plans from the presentation document's own surface instead
  /// would go on drawing Eris after the session had left it (#379).
  readonly surface: ErisSurface;
}

export type { Residence, ResidenceDeparture } from './residence.ts';

/// What the player is inside: on foot, or aboard one resident instance, named by its instance id
/// as everything else in Damocles is. Aboard, that instance's Object Residence is `occupied`.
/// A Save carries it as it is (#417).
export type DamoclesOccupancy = DamoclesSaveOccupancy;

/// Board test 1: the nearest drawn object is under 1024 units from the Pose. Derived from
/// `$054302`'s exponent test under the selection note's float rule; the Take's reach is 512.
const BOARD_REACH = 1024;

/// The VOID staging Body, `$78`, which Take and Drop already refuse on.
const VOID_BODY = 'body-30';

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

export interface DamoclesContent {
  readonly catalogue: Catalogue;
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
  execution: script.execution,
  message: script.message,
  pending: script.pending,
  triggers: script.triggers.map(({ armed, index }) => ({ armed, index }))
});

/// The workspace origin a Body's admitted arrival Pose publishes, if it has one.
const workspaceOriginFor = (
  content: DamoclesContent,
  bodyId: string
): { readonly x: number; readonly z: number } | undefined =>
  content.poses.poses.find(
    pose => pose.body === bodyId && pose.workspaceOrigin !== null
  )?.workspaceOrigin ?? undefined;

/// The single owner of Damocles's Session State.
///
/// Time reaches it as seconds and is stepped at no more than the shared `MAXIMUM_STEP`, so a
/// long frame is several short steps rather than one long one, as Targ's session does.
export class DamoclesSession implements TitleSession<
  DamoclesSnapshot,
  DamoclesSaveSnapshot
> {
  intent: Intent = IDLE;

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
  /// the Body underfoot is kept: a switch takes the arrival Pose's own.
  private bodyTurn: number;
  private carried: string[];
  /// `$5A9D9`: whether any door moved on the last pass, which the next pass compares with.
  private doorsMoving: boolean;
  private elapsed: number;
  private effects: Effect[] = [];
  private frameAccumulator: number;
  /// The instance the player is aboard, or null on foot.
  private occupied: string | null = null;
  /// The occupied instance's Object Residence departure from before boarding, or undefined where
  /// it had none and stood at its Catalogue residence. Leaving falls back to it where the leave
  /// placement cannot be held. A Save does not carry it, so a session restored aboard falls back to
  /// the Catalogue residence. Nothing moves aboard, so that fallback is reached only where the
  /// earlier leave from this place fell back too.
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
      waitFrames: content.doc.time.waitFrames
    };
    this.soundPermitted = options.soundPermitted ?? (() => true);
    this.negateModelZ = content.doc.orientation.modelZ === 'negate';
    const opening = restore?.pose ?? startPose(content.doc);
    this.pose = {
      body: opening.body,
      heading: opening.heading,
      pitch: opening.pitch,
      position: { ...opening.position }
    };
    this.elapsed = restore?.elapsed ?? 0;
    this.bodyTurn = restore?.bodyTurn ?? content.doc.start.bodyTurn;
    this.briefcaseStore = [...(restore?.briefcaseStore ?? [])];
    this.pendingBriefcaseDrop = restore?.pendingBriefcaseDrop ?? null;
    this.carried = [...(restore?.carried ?? [])];
    this.doorsMoving = restore?.doorsMoving ?? false;
    this.frameAccumulator = restore?.frameAccumulator ?? 0;
    this.scrollCounter = restore?.scrollCounter ?? 0;
    this.script =
      restore?.script === undefined
        ? initialScriptState()
        : scriptFromSave(restore.script);
    this.residence = new Map(
      restore?.residence?.map(item => [item.instance, item.residence]) ?? []
    );
    this.occupied =
      restore?.occupancy.kind === 'aboard' ? restore.occupancy.instance : null;
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
    const origin = workspaceOriginFor(content, restore.pose.body);
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
            ?.levelBinding?.floors.find(entry => entry.level === floor)
            ?.structureId;
    return [
      ...(modelWaves(content.catalogue, surface, restore.pose.position)[0] ??
        []),
      ...(bound === undefined ? [] : [bound.model]),
      ...(floorStructure === undefined ? [] : [floorStructure])
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
    const origin = workspaceOriginFor(this.content, bodyId);
    if (origin === undefined) {
      throw new Error(`Damocles Body ${bodyId} has no admitted arrival Pose`);
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
      if (residence.placementClass !== (instance.placementClass ?? 0)) {
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
        void this.content.models.prefetch(
          floorsOf(placement, this.content.models).map(
            entry => entry.structureId
          )
        );
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
      // Read ahead the structures its Floors bind, so a Floor change finds them in hand.
      void this.content.models.prefetch(
        floorsOf(placement, this.content.models).map(entry => entry.structureId)
      );
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
    for (const resident of this.visibleResidents()) {
      if (seen.has(resident.id)) {
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
    for (const instance of this.content.catalogue.instances) {
      const departure = this.residence.get(instance.id);
      const residence = this.residenceFor(instance.id);
      if (
        residence === undefined ||
        residence.kind === 'carried' ||
        residence.kind === 'occupied' ||
        (departure === undefined && residence.kind === 'surface')
      ) {
        continue;
      }
      const position = this.worldPosition(instance.id, residence);
      if (position === null) {
        continue;
      }
      const model = this.content.models.peek(instance.model);
      if (model === undefined) {
        // Drawn once its file lands: residents are recomputed every snapshot.
        void this.content.models.prefetch([instance.model]);
        continue;
      }
      const form =
        model.variants.find(variant => variant.id === model.id) ??
        model.variants[0];
      const base = this.surface.placements.find(
        placement => placement.id === instance.id
      );
      const placement: ErisPlacement = {
        faceCount: form?.mesh.faces.length ?? 0,
        heading: base?.heading ?? 0,
        id: instance.id,
        keyBase: instance.keyBase,
        kind: model.kind,
        mesh: form?.mesh,
        modelId: model.id,
        name: model.name,
        position,
        status: model.status
      };
      // One insertion is one drawn copy, and `worldPosition` has already refused zero.
      const copies =
        residence.kind === 'structure'
          ? this.insertions(instance.id, residence)
          : 1;
      residents.push(...Array.from({ length: copies }, () => placement));
    }
    return residents;
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
    const body = this.content.catalogue.bodies.find(
      item => item.id === this.pose.body
    );
    return (body?.name ?? this.pose.body).toUpperCase();
  }

  /// What the VBL handler adds to the current Body's rotation accumulator.
  private rotationRate(): number {
    return (
      this.content.catalogue.bodies.find(item => item.id === this.pose.body)
        ?.bodySurface?.rotationRate ?? 0
    );
  }

  /// The terminator for the Pose, against the sub-stellar longitude the Body's arrival Poses
  /// captured. Every admitted Body has one, since a Session stands only on those.
  private daylight(): boolean {
    const longitude = this.content.poses.poses.find(
      pose => pose.body === this.pose.body
    )?.subStellarLongitude;
    return (
      longitude !== undefined &&
      inDaylight(longitude, this.bodyTurn, this.pose.position)
    );
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

  private presentSystem(
    id:
      | 'system-string-0'
      | 'system-string-1'
      | 'system-string-2'
      | 'system-string-22'
      | 'system-string-3'
      | 'system-string-9'
  ): void {
    if (this.script.execution === null && this.script.message === null) {
      this.script = presentSystemMessage(this.script, id, this.scriptRules);
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
      daylight: this.daylight(),
      display: this.script.display,
      displayCells: displayCells(
        this.script.display,
        this.script.display.kind === 'scrolling'
          ? this.scriptRules.messageText(this.script.display.id)
          : this.script.display.cells
      ),
      elapsed: this.elapsed,
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
      // No Mover runs aboard, so the Pose holds: driving is not admitted (ADR 0047).
      const aboard = this.occupied !== null;
      const moved = aboard
        ? this.pose
        : walk(this.pose, this.intent, step, this.rules);
      this.bindAt(moved);
      const placement = this.boundPlacement;
      // Aboard there is no step to clamp, and the region boarding selected stands.
      if (!aboard) {
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
            this.regionIndex
          );
          this.pose = clamped.pose;
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
        // `$059562` steps the ride before `$05AA3C` moves the doors, so a tick sees them as they
        // stood before it. The doors see the step's Pose before `$05A64A` clamps it.
        this.stepRide(this.rideDoorShut());
        this.askForDoorTone(this.moveAttachments(moved.position));
      }
      remaining -= step;
    }
    return this.snapshot;
  }

  /// Aboard, the occupied instance's departure is `occupied` and the Pose is the seated view.
  captureResume(): DamoclesSaveSnapshot {
    return {
      bodyTurn: this.bodyTurn,
      briefcaseStore: [...this.briefcaseStore],
      carried: [...this.carried],
      doorsMoving: this.doorsMoving,
      elapsed: this.elapsed,
      frameAccumulator: this.frameAccumulator,
      occupancy: this.occupancy,
      pendingBriefcaseDrop: this.pendingBriefcaseDrop,
      pose: this.pose,
      residence: [...this.residence].map(([instance, residence]) => ({
        instance,
        residence
      })),
      script: scriptForSave(this.script),
      scrollCounter: this.scrollCounter,
      structure: this.structureSnapshot()
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

  /// `B`: the board gate `$054302`–`$05434E`, its eight tests in the Reference Build's order
  /// (docs/design/damocles-boarding-admission.md). The first that fails decides; every refusal
  /// but the key test's is silent and changes nothing.
  board(): { readonly kind: 'boarded' | 'refused' } {
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
    // bias ($054390). Nothing moves aboard, so the byte is still the Catalogue's.
    const byte = instance.location?.heading ?? instance.placement?.heading ?? 0;
    this.pose = {
      body: this.pose.body,
      heading: bearingFromYaw(byte * 4, this.content.doc.orientation),
      // Not written by boarding; on foot nothing pitches the view.
      pitch: this.pose.pitch,
      position: {
        x: selected.position.x,
        y: selected.position.y + this.rules.eyeHeight,
        z: selected.position.z
      }
    };
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
    if (instance === null) {
      return { kind: 'refused' };
    }
    // 2. The occupied object is in ground contact: always, since no Mover runs aboard.
    // 3. Not at sea by the island classification. 4. Not on the VOID staging Body.
    if (
      classifyPosition(this.surface, this.pose.position).kind === 'sea' ||
      this.pose.body === VOID_BODY
    ) {
      return { kind: 'refused' };
    }
    const occupied = this.residence.get(instance);
    const placed = this.directResidence(occupied?.placementClass ?? 0);
    if (
      placed.kind === 'structure' &&
      !validStructureResidence(this.content.catalogue, placed)
    ) {
      // Authored: a structure placement the session cannot hold would lose the object, so it
      // returns where boarding found it -- the same place, since nothing moves aboard.
      this.restoreBoardedFrom(this.residence, instance);
    } else {
      this.residence.set(instance, placed);
    }
    // Roll and pitch are leveled ($0544C6, $0544CC). The instance angle byte takes the yaw ÷ 4
    // ($0544FA); with no Mover aboard that is the byte boarding read, which is not stored.
    this.pose = { ...this.pose, pitch: 0 };
    this.occupied = null;
    this.boardedFrom = undefined;
    return { kind: 'left' };
  }

  take(): { readonly kind: 'refused' | 'took' } {
    // Authored: no capture shows a Take completing aboard (#407).
    if (this.occupied !== null) {
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
      this.script = fireTrigger(this.script, trigger, this.scriptRules).state;
    }
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'take', type: 'sound-request' });
    }
    return { kind: 'took' };
  }

  rotateForward(): { readonly kind: 'refused' | 'rotated' } {
    if (this.scrollCounter !== 0 || this.carried.length === 0) {
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
    if (this.scrollCounter !== 0 || this.carried.length === 0) {
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
      const residence = this.supportResidence(selected!);
      if (residence === undefined) {
        this.presentSystem('system-string-9');
        return undefined;
      }
      const placed: Residence = {
        ...residence,
        placementClass:
          this.residenceFor(head)?.placementClass ??
          dropped?.placementClass ??
          0
      };
      if (
        placed.kind === 'structure' &&
        !validStructureResidence(this.content.catalogue, placed)
      ) {
        this.presentSystem('system-string-9');
        return undefined;
      }
      return placed;
    }

    const placementClass =
      this.residenceFor(head)?.placementClass ?? dropped?.placementClass ?? 0;
    const placed = this.directResidence(placementClass);
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
  private directResidence(placementClass: number): PlacedResidence {
    const structure = this.boundPlacement;
    const region =
      this.regionIndex === null
        ? undefined
        : structure?.selection?.structure.regions[this.regionIndex];
    const exterior = region !== undefined && (region.flags & 0x40_00) !== 0;
    // The native direct path copies $7A39, the player's 3x3 zone against the bound
    // structure's extent rectangle. That rectangle has no static decode yet (#356), so the
    // Residence keeps the class it already carries rather than inventing a zone.
    if (structure === null || exterior || this.regionIndex === null) {
      return {
        body: this.pose.body,
        kind: 'surface',
        placementClass,
        position: {
          x: this.pose.position.x,
          y: this.pose.position.y - this.rules.eyeHeight,
          z: this.pose.position.z
        }
      };
    }
    return {
      body: this.pose.body,
      insertionGroup: this.regionIndex + 1,
      kind: 'structure',
      // The bound placement carries the structure selected by this Floor's table entry.
      level: this.floor,
      parent: structure.id,
      placementClass,
      position: {
        x: this.pose.position.x - structure.position.x,
        y: this.pose.position.y - this.rules.eyeHeight - structure.position.y,
        z: this.pose.position.z - structure.position.z
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
      // Authored: no capture shows a Drop completing aboard (#407).
      this.occupied !== null ||
      head === undefined ||
      this.pose.body === VOID_BODY ||
      this.scrollCounter !== 0
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
      // Authored: the Floor's structure is not read yet, so the arrival waits a tick for it.
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
