import type { Catalogue } from '../catalogue/data.ts';
import { IDLE, MAXIMUM_STEP, type Intent } from '../gameCore/index.ts';
import type { TitleSession } from '../shell/title.ts';
import {
  displayCells,
  type DamoclesDisplay,
  type DisplayCells
} from './display.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { walk, type WalkRules } from './mover.ts';
import type {
  BoundStructureSnapshot,
  DamoclesSaveScript,
  DamoclesSaveSnapshot
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
  attachmentOpenLimit,
  clampStructureStep,
  insideLocalBox,
  structureLocalPosition,
  structureRegionAt
} from './selection.ts';
import { findMessage, type DamoclesStrings } from './strings.ts';
import {
  cellOf,
  insideCentralCellHalf,
  startPose,
  structureInCell,
  type ErisCell,
  type ErisPlacement,
  type ErisSurface,
  type Pose
} from './world.ts';

/// What the Damocles Gameplay Session can say about itself in this slice.
///
/// On foot, somewhere on Eris, carrying nothing. It is the whole of Damocles's Session State
/// today, and it grows as the evidence does: Occupancy aboard a craft, a Carried Stack, the
/// impact clock and Damocles Script state are each a research issue away (ADR 0043).
export interface DamoclesSnapshot {
  readonly carried: readonly string[];
  readonly cell: ErisCell;
  readonly display: DamoclesDisplay;
  readonly displayCells: DisplayCells;
  readonly elapsed: number;
  readonly frameAccumulator: number;
  readonly inventoryLabel: string;
  readonly message: Presenting | null;
  readonly occupancy: { readonly kind: 'onFoot' };
  readonly pose: Pose;
  readonly residence: readonly ResidenceDeparture[];
  readonly residents: readonly ErisPlacement[];
  readonly scrollCounter: number;
  readonly selection: Selection;
  readonly structure: BoundStructureSnapshot | null;
}

export type Residence =
  | { readonly drawClass: number; readonly kind: 'carried' }
  | {
      readonly body: string;
      readonly drawClass: number;
      readonly kind: 'surface';
      readonly position: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
    }
  | {
      readonly body: string;
      readonly drawClass: number;
      readonly insertionGroup: number;
      readonly kind: 'structure';
      readonly level: number;
      readonly parent: string;
      readonly position: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
    };

export interface ResidenceDeparture {
  readonly instance: string;
  readonly residence: Residence;
}

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
  const instance = catalogue.instances.find(item => item.id === instanceId);
  const model = catalogue.models.find(item => item.id === instance?.model);
  return (model?.name ?? instanceId).slice(0, 16).padEnd(16);
};

// The pinned Structure 74 trace moved 92 one-unit ticks in 2.64 seconds.
const ATTACHMENT_UNITS_PER_SECOND = 92 / 2.64;

const scriptFromSave = (saved: DamoclesSaveScript): ScriptState => ({
  ...saved,
  busy: saved.execution !== null,
  triggers: saved.triggers.map(trigger => ({
    ...trigger,
    script: trigger.index === 2 ? 'damocles.script.slot-2' : null
  }))
});

const scriptForSave = (script: ScriptState): DamoclesSaveScript => ({
  counter: script.counter,
  display: script.display,
  execution: script.execution,
  message: script.message,
  triggers: script.triggers.map(({ armed, index }) => ({ armed, index }))
});

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
  private attachmentUnits = new Map<number, number>();
  private boundPlacement: ErisPlacement | null = null;
  private carried: string[];
  private elapsed: number;
  private effects: Effect[] = [];
  private frameAccumulator: number;
  private pose: Pose;
  private regionIndex: number | null = null;
  private residence = new Map<string, Residence>();
  private script: ScriptState;
  private scrollCounter: number;

  constructor(
    content: DamoclesContent,
    restore?: DamoclesSaveSnapshot,
    options: { readonly soundPermitted?: () => boolean } = {}
  ) {
    this.content = content;
    if (restore !== undefined) {
      this.validateRestore(restore);
    }
    this.rules = rulesFor(content.doc);
    this.scriptRules = {
      messageFrames: content.doc.time.messageFrames,
      messageText: id => {
        const record = findMessage(content.strings, id);
        if (record === undefined) {
          throw new Error(`Damocles strings have no ${id}`);
        }
        return id === 'system-string-50' ? record.text.slice(1) : record.text;
      },
      waitFrames: content.doc.time.waitFrames
    };
    this.soundPermitted = options.soundPermitted ?? (() => true);
    this.negateModelZ = content.doc.orientation.modelZ === 'negate';
    const opening = restore?.pose ?? startPose(content.doc);
    this.pose = {
      body: opening.body,
      heading: opening.heading,
      position: { ...opening.position, y: this.rules.eyeHeight }
    };
    this.elapsed = restore?.elapsed ?? 0;
    this.carried = [...(restore?.carried ?? [])];
    this.frameAccumulator = restore?.frameAccumulator ?? 0;
    this.scrollCounter = restore?.scrollCounter ?? 0;
    this.script =
      restore?.script === undefined
        ? initialScriptState()
        : scriptFromSave(restore.script);
    this.residence = new Map(
      restore?.residence?.map(item => [item.instance, item.residence]) ?? []
    );
    this.bindAt(this.pose, restore?.structure);
  }

  private validateRestore(restore: DamoclesSaveSnapshot): void {
    if (
      new Set(restore.carried).size !== restore.carried.length ||
      restore.carried.some(instance => instance !== 'object-slot-183') ||
      new Set(restore.residence.map(item => item.instance)).size !==
        restore.residence.length ||
      restore.residence.some(item => item.instance !== 'object-slot-183')
    ) {
      throw new Error('saved Carried Stack or Object Residence is not tracked');
    }
    for (const departure of restore.residence) {
      const residence = departure.residence;
      if (residence.kind === 'surface') {
        if (residence.body !== 'body-11') {
          throw new Error('saved surface residence names the wrong Body');
        }
      } else if (residence.kind === 'structure') {
        const parent = this.content.catalogue.instances.find(
          instance => instance.id === residence.parent
        );
        if (
          parent?.location?.body !== residence.body ||
          residence.level !== 0 ||
          !parent.associationGroups?.some(
            group => group.group === residence.insertionGroup
          )
        ) {
          throw new Error(
            'saved structure residence is not admitted by the Catalogue'
          );
        }
      }
    }
  }

  private readonly unitsFor = (slot: number): number =>
    this.attachmentUnits.get(slot) ?? 0;

  private bindAt(pose: Pose, restore?: BoundStructureSnapshot | null): void {
    const placement = structureInCell(this.content.surface, pose.position);
    if (restore !== undefined) {
      if (placement?.id !== restore?.instanceId) {
        throw new Error('saved structure does not match the current cell');
      }
    }
    if (placement?.id === this.boundPlacement?.id && restore === undefined) {
      return;
    }
    this.boundPlacement = placement ?? null;
    this.attachmentUnits = new Map(
      placement?.selection?.structure.attachments.map(attachment => [
        attachment.slot,
        0
      ]) ?? []
    );
    if (restore !== undefined && restore !== null && placement !== undefined) {
      if (
        restore.attachments.length !== this.attachmentUnits.size ||
        new Set(restore.attachments.map(item => item.slot)).size !==
          restore.attachments.length ||
        (restore.regionIndex !== null &&
          restore.regionIndex >=
            placement.selection!.structure.regions.length) ||
        restore.attachments.some(({ openUnits, slot }) => {
          const attachment = placement.selection!.structure.attachments.find(
            item => item.slot === slot
          );
          return (
            attachment === undefined ||
            openUnits < 0 ||
            openUnits > attachmentOpenLimit(attachment)
          );
        })
      ) {
        throw new Error('saved attachments do not match the bound structure');
      }
      this.attachmentUnits = new Map(
        restore.attachments.map(item => [item.slot, item.openUnits])
      );
      this.regionIndex = restore.regionIndex;
      return;
    }
    this.regionIndex =
      placement !== undefined &&
      insideCentralCellHalf(pose.position, this.content.surface.grid)
        ? structureRegionAt(placement, pose, this.negateModelZ, this.unitsFor)
        : null;
  }

  private structureSnapshot(): BoundStructureSnapshot | null {
    if (this.boundPlacement === null) {
      return null;
    }
    return {
      attachments: [...this.attachmentUnits].map(([slot, openUnits]) => ({
        openUnits,
        slot
      })),
      instanceId: this.boundPlacement.id,
      regionIndex: this.regionIndex
    };
  }

  private keyResidence(): Residence {
    const departure = this.residence.get('object-slot-183');
    if (departure !== undefined) {
      return departure;
    }
    const key = this.content.catalogue.instances.find(
      instance => instance.id === 'object-slot-183'
    )!;
    const association = key.association!;
    return {
      body: association.body,
      drawClass: key.handling!.byte & 0x0f,
      insertionGroup: association.insertionGroupSelector,
      kind: 'structure',
      level: association.levelSelector,
      parent: key.placement!.parent,
      position: {
        x: key.placement!.position[0],
        y: key.placement!.position[1],
        z: key.placement!.position[2]
      }
    };
  }

  private worldPosition(residence: Residence): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null {
    if (residence.kind === 'carried') {
      return null;
    }
    if (residence.kind === 'surface') {
      return residence.body === this.pose.body ? residence.position : null;
    }
    if (
      residence.body !== this.pose.body ||
      residence.parent !== this.boundPlacement?.id ||
      residence.level !== 0 ||
      this.regionIndex === null
    ) {
      return null;
    }
    const parent = this.content.catalogue.instances.find(
      instance => instance.id === residence.parent
    );
    const group = parent?.associationGroups?.find(
      item => item.group === residence.insertionGroup
    );
    const regionSelector = this.regionIndex + 1;
    if (
      group === undefined ||
      (residence.insertionGroup !== regionSelector &&
        !group.pairs.some(pair => pair.regionSelector === regionSelector))
    ) {
      return null;
    }
    return {
      x: this.boundPlacement.position.x + residence.position.x,
      y: this.boundPlacement.position.y + residence.position.y,
      z: this.boundPlacement.position.z + residence.position.z
    };
  }

  private selection(): Selection {
    const candidates: {
      readonly id: string;
      readonly position: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
      };
    }[] = [];
    const keyPosition = this.worldPosition(this.keyResidence());
    if (keyPosition !== null) {
      candidates.push({ id: 'object-slot-183', position: keyPosition });
    }
    for (const placement of this.content.surface.placements) {
      if (placement.kind === 'object' && placement.id !== 'object-slot-183') {
        candidates.push({ id: placement.id, position: placement.position });
      }
    }
    let nearest: { readonly distance: number; readonly id: string } | undefined;
    for (const candidate of candidates) {
      const dx = candidate.position.x - this.pose.position.x;
      const dy = candidate.position.y - this.pose.position.y;
      const dz = candidate.position.z - this.pose.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (nearest === undefined || distance <= nearest.distance) {
        nearest = { distance, id: candidate.id };
      }
    }
    return nearest === undefined
      ? { kind: 'none' }
      : {
          inRange: nearest.distance < 512,
          instance: nearest.id,
          kind: 'object'
        };
  }

  private visibleResidents(): readonly ErisPlacement[] {
    const residence = this.keyResidence();
    const position = this.worldPosition(residence);
    if (position === null) {
      return [];
    }
    let copies = 1;
    if (residence.kind === 'structure' && this.regionIndex !== null) {
      const parent = this.content.catalogue.instances.find(
        instance => instance.id === residence.parent
      );
      const group = parent?.associationGroups?.find(
        item => item.group === residence.insertionGroup
      );
      const region = this.regionIndex + 1;
      copies =
        (residence.insertionGroup === region ? 1 : 0) +
        (group?.pairs.filter(pair => pair.regionSelector === region).length ??
          0);
    }
    const instance = this.content.catalogue.instances.find(
      item => item.id === 'object-slot-183'
    )!;
    const model = this.content.catalogue.models.find(
      item => item.id === instance.model
    )!;
    const mesh = model.variants[0]?.mesh;
    const placement: ErisPlacement = {
      faceCount: mesh?.faces.length ?? 0,
      heading: 0,
      id: instance.id,
      kind: model.kind,
      mesh,
      modelId: model.id,
      name: model.name,
      position,
      status: model.status
    };
    return Array.from({ length: copies }, () => placement);
  }

  private inventoryLabel(): string {
    const head = this.carried.at(-1);
    if (head === undefined) {
      return this.scrollCounter > 0
        ? inventorySourceLabel(this.content.catalogue, 'object-slot-183').slice(
            16 - this.scrollCounter
          )
        : 'EMPTY';
    }
    const label = inventorySourceLabel(this.content.catalogue, head);
    if (this.scrollCounter < 0) {
      return label.slice(0, 16 + this.scrollCounter);
    }
    const instance = this.content.catalogue.instances.find(
      item => item.id === head
    );
    const model = this.content.catalogue.models.find(
      item => item.id === instance?.model
    );
    return model?.name ?? head;
  }

  get snapshot(): DamoclesSnapshot {
    return {
      carried: [...this.carried],
      cell: cellOf(this.pose.position, this.content.surface.grid),
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
      message: this.script.message,
      occupancy: { kind: 'onFoot' },
      pose: this.pose,
      residence: [...this.residence].map(([instance, residence]) => ({
        instance,
        residence
      })),
      residents: this.visibleResidents(),
      scrollCounter: this.scrollCounter,
      selection: this.selection(),
      structure: this.structureSnapshot()
    };
  }

  advance(seconds: number): DamoclesSnapshot {
    let remaining = Math.max(0, seconds);
    while (remaining > 0) {
      const step = Math.min(MAXIMUM_STEP, remaining);
      const moved = walk(this.pose, this.intent, step, this.rules);
      this.bindAt(moved);
      const placement = this.boundPlacement;
      if (placement !== null) {
        const local = structureLocalPosition(
          placement,
          moved.position,
          this.negateModelZ
        );
        for (const attachment of placement.selection!.structure.attachments) {
          const opening = insideLocalBox(local, attachment.proximityBox);
          const current = this.unitsFor(attachment.slot);
          this.attachmentUnits.set(
            attachment.slot,
            Math.max(
              0,
              Math.min(
                attachmentOpenLimit(attachment),
                current +
                  (opening ? 1 : -1) * ATTACHMENT_UNITS_PER_SECOND * step
              )
            )
          );
        }
      }
      if (
        placement !== null &&
        insideCentralCellHalf(moved.position, this.content.surface.grid)
      ) {
        const clamped = clampStructureStep(
          placement,
          this.pose,
          moved,
          this.negateModelZ,
          this.unitsFor,
          this.regionIndex
        );
        this.pose = clamped.pose;
        this.regionIndex = clamped.regionIndex;
      } else {
        this.pose = moved;
        this.regionIndex = null;
      }
      this.elapsed += step;
      this.frameAccumulator += step * this.content.doc.time.vblHertz;
      const frames = Math.floor(this.frameAccumulator + 1e-9);
      this.frameAccumulator = Math.max(0, this.frameAccumulator - frames);
      for (let frame = 0; frame < frames; frame += 1) {
        this.scrollCounter +=
          this.scrollCounter < 0 ? 1 : this.scrollCounter > 0 ? -1 : 0;
        const transition = runFrame(this.script, this.scriptRules);
        this.script = transition.state;
        this.effects.push(...transition.effects);
      }
      remaining -= step;
    }
    return this.snapshot;
  }

  captureResume(): DamoclesSaveSnapshot {
    return {
      carried: [...this.carried],
      elapsed: this.elapsed,
      frameAccumulator: this.frameAccumulator,
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

  take(): { readonly kind: 'refused' | 'took' } {
    const selection = this.selection();
    if (
      selection.kind === 'none' ||
      !selection.inRange ||
      selection.instance !== 'object-slot-183' ||
      this.scrollCounter !== 0 ||
      this.carried.length >= 10
    ) {
      return { kind: 'refused' };
    }
    this.carried.push(selection.instance);
    this.scrollCounter = -16;
    const previous = this.keyResidence();
    this.residence.set(selection.instance, {
      drawClass: previous.drawClass,
      kind: 'carried'
    });
    this.script = fireTrigger(this.script, 2, this.scriptRules).state;
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'take', type: 'sound-request' });
    }
    return { kind: 'took' };
  }

  drop(): { readonly kind: 'dropped' | 'refused' } {
    const head = this.carried.at(-1);
    if (head !== 'object-slot-183' || this.scrollCounter !== 0) {
      return { kind: 'refused' };
    }
    const structure = this.boundPlacement;
    const region =
      this.regionIndex === null
        ? undefined
        : structure?.selection?.structure.regions[this.regionIndex];
    const exterior = region !== undefined && (region.flags & 0x40_00) !== 0;
    let residence: Residence;
    if (structure === null) {
      return { kind: 'refused' };
    }
    if (exterior) {
      residence = {
        body: this.pose.body,
        drawClass: 0,
        kind: 'surface',
        position: {
          x: this.pose.position.x,
          y: this.pose.position.y - this.rules.eyeHeight,
          z: this.pose.position.z
        }
      };
    } else {
      if (this.regionIndex === null) {
        return { kind: 'refused' };
      }
      const insertionGroup = this.regionIndex + 1;
      const parent = this.content.catalogue.instances.find(
        instance => instance.id === structure.id
      );
      if (
        !parent?.associationGroups?.some(
          group => group.group === insertionGroup
        )
      ) {
        if (this.script.execution === null && this.script.message === null) {
          this.script = presentSystemMessage(
            this.script,
            'system-string-9',
            this.scriptRules
          );
        }
        return { kind: 'refused' };
      }
      residence = {
        body: this.pose.body,
        drawClass: this.keyResidence().drawClass,
        insertionGroup,
        kind: 'structure',
        level: 0,
        parent: structure.id,
        position: {
          x: this.pose.position.x - structure.position.x,
          y: this.pose.position.y - this.rules.eyeHeight - structure.position.y,
          z: this.pose.position.z - structure.position.z
        }
      };
    }
    this.carried.pop();
    this.scrollCounter = 16;
    this.residence.set(head, residence);
    if (this.soundPermitted()) {
      this.effects.push({ cue: 'drop', type: 'sound-request' });
    }
    return { kind: 'dropped' };
  }

  /// Land at an Eris cell's centre, keeping heading and the walk eye height.
  teleportToCell(x: number, z: number): void {
    const { grid } = this.content.surface;
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
      position: {
        x: (x + grid.origin.x + 0.5) * grid.cellUnits,
        y: this.rules.eyeHeight,
        z: (z + grid.origin.z + 0.5) * grid.cellUnits
      }
    };
    this.boundPlacement = null;
    this.bindAt(this.pose);
  }
}
