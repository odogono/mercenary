import type { Catalogue } from '../catalogue/data.ts';
import { IDLE, MAXIMUM_STEP, type Intent } from '../gameCore/index.ts';
import type { TitleSession } from '../shell/title.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { walk, type WalkRules } from './mover.ts';
import type { DamoclesSaveSnapshot } from './save.ts';
import {
  cellOf,
  startPose,
  type ErisCell,
  type ErisPose,
  type ErisSurface
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
  readonly pose: ErisPose;
}

export interface DamoclesContent {
  readonly catalogue: Catalogue;
  readonly doc: ErisPresentationDocument;
  readonly surface: ErisSurface;
}

const rulesFor = (doc: ErisPresentationDocument): WalkRules => ({
  eyeHeight: doc.eye.heightUnits,
  turnRadiansPerSecond: doc.walk.turnRadiansPerSecond,
  unitsPerSecond: doc.walk.unitsPerSecond
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
  private readonly rules: WalkRules;
  private elapsed: number;
  private pose: ErisPose;

  constructor(content: DamoclesContent, restore?: DamoclesSaveSnapshot) {
    this.content = content;
    this.rules = rulesFor(content.doc);
    const opening = restore?.pose ?? startPose(content.doc);
    this.pose = {
      heading: opening.heading,
      position: { ...opening.position, y: this.rules.eyeHeight }
    };
    this.elapsed = restore?.elapsed ?? 0;
  }

  get snapshot(): DamoclesSnapshot {
    return {
      carried: [],
      cell: cellOf(this.pose.position, this.content.surface.grid),
      elapsed: this.elapsed,
      occupancy: { kind: 'onFoot' },
      pose: this.pose
    };
  }

  advance(seconds: number): DamoclesSnapshot {
    let remaining = Math.max(0, seconds);
    while (remaining > 0) {
      const step = Math.min(MAXIMUM_STEP, remaining);
      this.pose = walk(this.pose, this.intent, step, this.rules);
      this.elapsed += step;
      remaining -= step;
    }
    return this.snapshot;
  }

  captureResume(): DamoclesSaveSnapshot {
    return {
      elapsed: this.elapsed,
      pose: this.pose
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
      heading: this.pose.heading,
      position: {
        x: (x + grid.origin.x + 0.5) * grid.cellUnits,
        y: this.rules.eyeHeight,
        z: (z + grid.origin.z + 0.5) * grid.cellUnits
      }
    };
  }
}
