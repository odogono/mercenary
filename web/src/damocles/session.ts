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
import {
  catalogueResidence,
  validStructureResidence,
  type PlacedResidence,
  type Residence,
  type ResidenceDeparture
} from './residence.ts';
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
/// The player is on foot on one admitted Body. Object Residence, the head-significant Carried
/// Stack, live inventory capacity and the bounded Damocles Script are session-owned state; the
/// renderer receives only their immutable projection.
export interface DamoclesSnapshot {
  readonly briefcaseStore: readonly string[];
  readonly capacity: number;
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

export type { Residence, ResidenceDeparture } from './residence.ts';

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
  private briefcaseStore: string[];
  private carried: string[];
  private elapsed: number;
  private effects: Effect[] = [];
  private frameAccumulator: number;
  private pendingBriefcaseDrop: {
    readonly head: string;
    readonly residence: PlacedResidence;
  } | null = null;
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
      position: { ...opening.position }
    };
    this.elapsed = restore?.elapsed ?? 0;
    this.briefcaseStore = [...(restore?.briefcaseStore ?? [])];
    this.pendingBriefcaseDrop = restore?.pendingBriefcaseDrop ?? null;
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
      !this.content.catalogue.bodies.some(body => body.id === restore.pose.body)
    ) {
      throw new Error('saved Pose names an unknown Body');
    }
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
      const instance = this.content.catalogue.instances.find(
        item => item.id === instanceId
      );
      if (!known.has(instanceId) || instance?.handling === null) {
        throw new Error(
          'saved Carried Stack or Object Residence is not tracked'
        );
      }
    }
    for (const departure of restore.residence) {
      const residence = departure.residence;
      const instance = this.content.catalogue.instances.find(
        item => item.id === departure.instance
      )!;
      if (residence.drawClass !== (instance.handling!.byte & 0x0f)) {
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

  private readonly unitsFor = (slot: number): number =>
    this.attachmentUnits.get(slot) ?? 0;

  private bindAt(pose: Pose, restore?: BoundStructureSnapshot | null): void {
    const placement =
      pose.body === this.content.surface.body.id
        ? structureInCell(this.content.surface, pose.position)
        : undefined;
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
        drawClass: instance.handling.byte & 0x0f,
        kind: 'carried'
      };
    }
    return catalogueResidence(this.content.catalogue, instanceId);
  }

  private instanceFor(instanceId: string) {
    return this.content.catalogue.instances.find(
      instance => instance.id === instanceId
    );
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
    const admitted =
      residence.insertionGroup === regionSelector ||
      (group?.pairs.some(pair => pair.regionSelector === regionSelector) ??
        false);
    if (!admitted && parent?.associationGroups !== null) {
      return null;
    }
    return {
      x: this.boundPlacement.position.x + residence.position.x,
      y: this.boundPlacement.position.y + residence.position.y,
      z: this.boundPlacement.position.z + residence.position.z
    };
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
    for (const placement of this.content.surface.placements) {
      if (placement.kind !== 'object' || seen.has(placement.id)) {
        continue;
      }
      const residence = this.residenceFor(placement.id);
      if (residence === undefined || residence.kind === 'carried') {
        continue;
      }
      const position = this.worldPosition(residence);
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
        (departure === undefined && residence.kind === 'surface')
      ) {
        continue;
      }
      const position = this.worldPosition(residence);
      const model = this.content.catalogue.models.find(
        item => item.id === instance.model
      );
      if (position === null || model === undefined) {
        continue;
      }
      const form =
        model.variants.find(variant => variant.id === model.id) ??
        model.variants[0];
      const base = this.content.surface.placements.find(
        placement => placement.id === instance.id
      );
      const placement: ErisPlacement = {
        faceCount: form?.mesh.faces.length ?? 0,
        heading: base?.heading ?? 0,
        id: instance.id,
        kind: model.kind,
        mesh: form?.mesh,
        modelId: model.id,
        name: model.name,
        position,
        status: model.status
      };
      let copies = 1;
      if (residence.kind === 'structure' && this.regionIndex !== null) {
        const parent = this.content.catalogue.instances.find(
          item => item.id === residence.parent
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
    const instance = this.content.catalogue.instances.find(
      item => item.id === head
    );
    const model = this.content.catalogue.models.find(
      item => item.id === instance?.model
    );
    return model?.name ?? head;
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

  private presentSystem(
    id: 'system-string-1' | 'system-string-2' | 'system-string-9'
  ): void {
    if (this.script.execution === null && this.script.message === null) {
      this.script = presentSystemMessage(this.script, id, this.scriptRules);
    }
  }

  get snapshot(): DamoclesSnapshot {
    return {
      briefcaseStore: [...this.briefcaseStore],
      capacity: this.capacity(),
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
      briefcaseStore: [...this.briefcaseStore],
      carried: [...this.carried],
      elapsed: this.elapsed,
      frameAccumulator: this.frameAccumulator,
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

  take(): { readonly kind: 'refused' | 'took' } {
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
      this.pose.body === 'body-30' ||
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
      drawClass: previous?.drawClass ?? handling.byte & 0x0f,
      kind: 'carried'
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
          drawClass: (storedInstance?.handling?.byte ?? 0) & 0x0f,
          kind: 'carried'
        });
      }
      this.briefcaseStore = [];
    }
    this.residence.set(selection.instance, carriedResidence);
    this.scrollCounter = -16;
    if (selection.instance === 'object-slot-183') {
      this.script = fireTrigger(this.script, 2, this.scriptRules).state;
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
    if (residence === undefined || residence.kind === 'carried') {
      return undefined;
    }
    const model = this.content.catalogue.models.find(
      item => item.id === this.instanceFor(support.id)?.model
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
        drawClass:
          this.residenceFor(head)?.drawClass ??
          (droppedHandling?.byte ?? 0) & 0x0f
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

    const structure = this.boundPlacement;
    const region =
      this.regionIndex === null
        ? undefined
        : structure?.selection?.structure.regions[this.regionIndex];
    const exterior = region !== undefined && (region.flags & 0x40_00) !== 0;
    const drawClass =
      this.residenceFor(head)?.drawClass ?? (droppedHandling?.byte ?? 0) & 0x0f;
    if (structure === null || exterior || this.regionIndex === null) {
      return {
        body: this.pose.body,
        drawClass,
        kind: 'surface',
        position: {
          x: this.pose.position.x,
          y: this.pose.position.y - this.rules.eyeHeight,
          z: this.pose.position.z
        }
      };
    }
    const insertionGroup = this.regionIndex + 1;
    const parent = this.content.catalogue.instances.find(
      instance => instance.id === structure.id
    );
    if (
      !parent?.associationGroups?.some(group => group.group === insertionGroup)
    ) {
      this.presentSystem('system-string-9');
      return undefined;
    }
    const placed: Residence = {
      body: this.pose.body,
      drawClass,
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
    if (
      placed.kind === 'structure' &&
      !validStructureResidence(this.content.catalogue, placed)
    ) {
      this.presentSystem('system-string-9');
      return undefined;
    }
    return placed;
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
      this.pose.body === 'body-30' ||
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
