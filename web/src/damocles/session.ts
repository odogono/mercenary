import type { Catalogue } from '../catalogue/data.ts';
import { IDLE, MAXIMUM_STEP, type Intent } from '../gameCore/index.ts';
import type { TitleSession } from '../shell/title.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { walk, type WalkRules } from './mover.ts';
import type { BoundStructureSnapshot, DamoclesSaveSnapshot } from './save.ts';
import {
  attachmentOpenLimit,
  clampStructureStep,
  insideLocalBox,
  structureLocalPosition,
  structureRegionAt
} from './selection.ts';
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
  readonly elapsed: number;
  readonly occupancy: { readonly kind: 'onFoot' };
  readonly pose: Pose;
  readonly structure: BoundStructureSnapshot | null;
}

export interface DamoclesContent {
  readonly catalogue: Catalogue;
  readonly doc: ErisPresentationDocument;
  /// One identity over every Damocles presentation document, hashed from the bytes served.
  readonly presentationSha256: string;
  readonly surface: ErisSurface;
}

const rulesFor = (doc: ErisPresentationDocument): WalkRules => ({
  eyeHeight: doc.eye.heightUnits,
  runMultiplier: doc.walk.runMultiplier,
  runTurnMultiplier: doc.walk.runTurnMultiplier,
  turnRadiansPerSecond: doc.walk.turnRadiansPerSecond,
  unitsPerSecond: doc.walk.unitsPerSecond
});

// The pinned Structure 74 trace moved 92 one-unit ticks in 2.64 seconds.
const ATTACHMENT_UNITS_PER_SECOND = 92 / 2.64;

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
  private attachmentUnits = new Map<number, number>();
  private boundPlacement: ErisPlacement | null = null;
  private elapsed: number;
  private pose: Pose;
  private regionIndex: number | null = null;

  constructor(content: DamoclesContent, restore?: DamoclesSaveSnapshot) {
    this.content = content;
    this.rules = rulesFor(content.doc);
    this.negateModelZ = content.doc.orientation.modelZ === 'negate';
    const opening = restore?.pose ?? startPose(content.doc);
    this.pose = {
      body: opening.body,
      heading: opening.heading,
      position: { ...opening.position, y: this.rules.eyeHeight }
    };
    this.elapsed = restore?.elapsed ?? 0;
    this.bindAt(this.pose, restore?.structure);
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

  get snapshot(): DamoclesSnapshot {
    return {
      carried: [],
      cell: cellOf(this.pose.position, this.content.surface.grid),
      elapsed: this.elapsed,
      occupancy: { kind: 'onFoot' },
      pose: this.pose,
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
      remaining -= step;
    }
    return this.snapshot;
  }

  captureResume(): DamoclesSaveSnapshot {
    return {
      elapsed: this.elapsed,
      pose: this.pose,
      structure: this.structureSnapshot()
    };
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
