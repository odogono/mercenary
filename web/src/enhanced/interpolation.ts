import type { Vector3 } from '../orientation/index.ts';
import {
  cellOf,
  type Pose,
  type SceneGrid,
  type ScenePlacement
} from './scene.ts';
import type { SkyItem, SkyPass, StarPixel } from './sky.ts';

/// The Enhanced view between simulation passes (ADR 0078, #825).
///
/// The simulation moves the eye once a pass: every eleven ticks in Mercenary III, every four
/// aboard in Damocles. The display draws far more often, so a view drawn from the latest pass
/// alone steps. The Enhanced view instead draws one pass behind, blended from the previous pass
/// toward the current by how far the session's clock has run into the next one. Only the view
/// reads the blend: nothing here reaches a session, its Save or its traces.
///
/// A Title publishes each pass's view with whether it follows on from the last. A cut, such as
/// boarding, a Body entry or a restored Save, snaps to the new pass rather than sweeping to it.

/// How far a session has run toward its next pass: the pass the view was last moved on, and
/// the fraction of the pass's ticks spent since, in `[0, 1)`.
export interface PassPhase {
  readonly fraction: number;
  readonly pass: number;
}

/// What the blend moves: the eye, the residents by id, the sky and the models fixed to the
/// view. The rest of a Title's view is drawn as one pass or the other gives it.
export interface BlendableView {
  /// The eye the sky is measured from, where it is not the Pose's: Damocles's space words,
  /// while the Pose stays where the craft left the Body.
  readonly eye?: Vector3 | null;
  readonly pose: Pose;
  readonly residents: readonly ScenePlacement[];
  readonly sky: SkyPass | null;
  /// The sky's Bodies seen from any eye, where a Title can place them so: they are placed for
  /// the drawn eye at the session's own time rather than blended, as Damocles's Bodies turn
  /// with the whole accumulator between its steps. Absent, the Bodies are blended.
  readonly skyBodiesAt?: (pose: Pose) => readonly SkyItem[];
  readonly surface: { readonly grid: SceneGrid };
  readonly viewFixed: readonly ScenePlacement[];
}

const TURN = 2 * Math.PI;

const lerp = (from: number, to: number, t: number): number =>
  from + (to - from) * t;

/// `to - from` the short way round, in radians.
const arc = (from: number, to: number): number => {
  const turned = to - from;
  return turned - TURN * Math.round(turned / TURN);
};

const lerpAngle = (from: number, to: number, t: number): number =>
  from + arc(from, to) * t;

const lerpVector = (from: Vector3, to: Vector3, t: number): Vector3 => ({
  x: lerp(from.x, to.x, t),
  y: lerp(from.y, to.y, t),
  z: lerp(from.z, to.z, t)
});

/// The eye `t` of the way from one pass's Pose to the next: positions along the line, angles
/// the short way round. A Pose on another Body is not blended toward.
export const blendPose = (from: Pose, to: Pose, t: number): Pose => {
  if (from.body !== to.body) {
    return to;
  }
  const roll =
    from.roll === undefined && to.roll === undefined
      ? {}
      : { roll: lerpAngle(from.roll ?? 0, to.roll ?? 0, t) };
  return {
    body: to.body,
    heading: lerpAngle(from.heading, to.heading, t),
    pitch: lerpAngle(from.pitch, to.pitch, t),
    position: lerpVector(from.position, to.position, t),
    ...roll
  };
};

/// The current pass's placements, each one present in both passes moved `t` of the way from
/// where the previous pass had it. A placement new this pass appears where it is.
export const blendPlacements = (
  from: readonly ScenePlacement[],
  to: readonly ScenePlacement[],
  t: number
): readonly ScenePlacement[] => {
  const before = new Map(from.map(placement => [placement.id, placement]));
  return to.map(placement => {
    const was = before.get(placement.id);
    if (
      was === undefined ||
      (was.position === placement.position && was.heading === placement.heading)
    ) {
      return placement;
    }
    return {
      ...placement,
      heading: lerpAngle(was.heading, placement.heading, t),
      position: lerpVector(was.position, placement.position, t)
    };
  });
};

/// Models fixed to the view, captured about the current pass's eye, carried to the drawn eye:
/// moved with it, and turned about it by the bearing between the two, so they stay where the
/// view holds them. A model with a bearing of its own, as a cab turns with its taxi rather
/// than with the passenger's look, turns instead from that bearing to `bearingOf`'s.
export const followView = (
  viewFixed: readonly ScenePlacement[],
  captured: Pose,
  drawn: Pose,
  bearingOf: (placement: ScenePlacement) => number | undefined = () => undefined
): readonly ScenePlacement[] => {
  if (viewFixed.length === 0 || captured === drawn) {
    return viewFixed;
  }
  const look = arc(captured.heading, drawn.heading);
  return viewFixed.map(placement => {
    const turn =
      placement.bearing === undefined
        ? look
        : arc(placement.bearing, bearingOf(placement) ?? placement.bearing);
    const sin = Math.sin(turn);
    const cos = Math.cos(turn);
    const x = placement.position.x - captured.position.x;
    const z = placement.position.z - captured.position.z;
    return {
      ...placement,
      heading: placement.heading + turn,
      position: {
        x: drawn.position.x + x * cos + z * sin,
        y: drawn.position.y + placement.position.y - captured.position.y,
        z: drawn.position.z - x * sin + z * cos
      }
    };
  });
};

/// The bearing `t` of the way between two passes' models fixed to the view, by id, for those
/// with a bearing of their own in both.
const bearingsBetween =
  (from: readonly ScenePlacement[], to: readonly ScenePlacement[], t: number) =>
  (placement: ScenePlacement): number | undefined => {
    const was = from.find(item => item.id === placement.id)?.bearing;
    const is = to.find(item => item.id === placement.id)?.bearing;
    return was === undefined || is === undefined
      ? undefined
      : lerpAngle(was, is, t);
  };

const blendSkyItem = (from: SkyItem, to: SkyItem, t: number): SkyItem => {
  if (from.kind === 'disc' && to.kind === 'disc') {
    return {
      ...to,
      offset: lerpVector(from.offset, to.offset, t),
      ...(from.first === to.first
        ? { split: lerp(from.split, to.split, t) }
        : {})
    };
  }
  if (from.kind === 'comet' && to.kind === 'comet') {
    return {
      ...to,
      offset: lerpVector(from.offset, to.offset, t),
      points:
        from.points.length === to.points.length
          ? to.points.map((point, index) =>
              lerpVector(from.points[index]!, point, t)
            )
          : to.points
    };
  }
  return to;
};

/// The ST's view in its own pixels: the rows above the panel.
const VIEW_COLUMNS = 320;
const VIEW_ROWS = 136;

/// One pass's starfield as the drawn eye sees it. Stars keep their place in the sky, so a view
/// lagging the pass's eye sees each one shifted by the bearing and pitch between them. Stars
/// the current pass cannot see, beyond its view's edge, are the previous pass's, shifted alike.
const blendStars = (
  from: SkyPass,
  to: SkyPass,
  poses: { readonly drawn: Pose; readonly from: Pose; readonly to: Pose }
): readonly StarPixel[] => {
  const scale = to.projectionScale * (to.zoom ?? 1);
  const shift = (stars: readonly StarPixel[], eye: Pose, target: Pose) => {
    const columns = arc(target.heading, eye.heading) * scale;
    const rows = arc(eye.pitch, target.pitch) * scale;
    return stars.map(star => ({
      ...star,
      column: star.column + columns,
      row: star.row + rows
    }));
  };
  const inside = (star: StarPixel): boolean =>
    star.column >= 0 &&
    star.column < VIEW_COLUMNS &&
    star.row >= 0 &&
    star.row < VIEW_ROWS;
  const current = shift(to.stars, poses.to, poses.drawn);
  const seenNow = shift(from.stars, poses.from, poses.to);
  const beyond = shift(from.stars, poses.from, poses.drawn).filter(
    (_, index) => !inside(seenNow[index]!)
  );
  return [...beyond, ...current].filter(inside);
};

/// The current pass's sky, with each Body listed in both passes moved `t` of the way from the
/// previous pass's place, and the stars where the drawn eye sees them.
export const blendSky = (
  from: SkyPass | null,
  to: SkyPass | null,
  t: number,
  poses: { readonly drawn: Pose; readonly from: Pose; readonly to: Pose }
): SkyPass | null => {
  if (from === null || to === null) {
    return to;
  }
  const before = new Map(from.bodies.map(item => [item.id, item]));
  return {
    ...to,
    bodies: to.bodies.map(item => {
      const was = before.get(item.id);
      return was === undefined ? item : blendSkyItem(was, item, t);
    }),
    stars:
      from.stars.length === 0 && to.stars.length === 0
        ? to.stars
        : blendStars(from, to, poses)
  };
};

const sameCell = (pose: Pose, view: BlendableView): boolean => {
  const here = cellOf(pose.position, view.surface.grid);
  const there = cellOf(view.pose.position, view.surface.grid);
  return here.x === there.x && here.z === there.z;
};

/// The view `t` of the way from one pass to the next. The rest of the view, its structure and
/// placements, is the pass whose cell the drawn eye stands in, since a Title may bind only the
/// eye's own cell.
export const blendView = <V extends BlendableView>(
  from: V,
  to: V,
  t: number
): V => {
  const pose = blendPose(from.pose, to.pose, t);
  if (pose === to.pose) {
    return to;
  }
  const base = !sameCell(pose, to) && sameCell(pose, from) ? from : to;
  const sky = blendSky(from.sky, to.sky, t, {
    drawn: pose,
    from: from.pose,
    to: to.pose
  });
  return {
    ...base,
    ...(from.eye != null && to.eye != null
      ? { eye: lerpVector(from.eye, to.eye, t) }
      : {}),
    pose,
    residents: blendPlacements(from.residents, to.residents, t),
    sky:
      sky === null || to.skyBodiesAt === undefined
        ? sky
        : { ...sky, bodies: to.skyBodiesAt(pose) },
    viewFixed: followView(
      base.viewFixed,
      base.pose,
      pose,
      bearingsBetween(from.viewFixed, to.viewFixed, t)
    )
  };
};

/// The last two passes a Title published, and the view between them.
export class ViewInterpolator<V extends BlendableView> {
  private previous: V | undefined;
  private current: { readonly pass: number; readonly view: V } | undefined;

  /// `continues` says whether one pass's view follows on from the previous pass's, or is cut
  /// from it, as boarding cuts the view from foot to cab. `settle`, where given, redraws the
  /// current pass's view for what the Title moves itself between passes, such as a door's
  /// opening, `t` of the way from the previous pass's.
  constructor(
    private readonly continues: (from: V, to: V) => boolean,
    private readonly settle?: (from: V, to: V, t: number) => V
  ) {}

  /// Forget both passes, as after a restored Save: the next view is drawn as it is published.
  reset(): void {
    this.previous = undefined;
    this.current = undefined;
  }

  /// Whether the view drawn is between two passes, and so moves with the clock while no pass
  /// runs.
  get blending(): boolean {
    return this.previous !== undefined;
  }

  /// The view to draw: `view`, published as pass `phase.pass`'s, blended from the previous
  /// pass's by `phase.fraction`. The same pass again replaces its view. A cut, a skipped pass,
  /// or no phase at all, as on foot in Damocles, draws `view` as it is.
  view(view: V, phase: PassPhase | null): V {
    if (phase === null) {
      this.reset();
      return view;
    }
    const current = this.current;
    if (current === undefined || current.pass !== phase.pass) {
      this.previous =
        current !== undefined && phase.pass === current.pass + 1
          ? current.view
          : undefined;
    }
    this.current = { pass: phase.pass, view };
    if (this.previous !== undefined && !this.continues(this.previous, view)) {
      this.previous = undefined;
    }
    if (this.previous === undefined) {
      return view;
    }
    const t = Math.min(1, Math.max(0, phase.fraction));
    return blendView(
      this.previous,
      this.settle?.(this.previous, view, t) ?? view,
      t
    );
  }
}
