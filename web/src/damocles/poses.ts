import type { Catalogue } from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { bearingFromYaw, type Pose } from './world.ts';

/// The arrival Poses `payload/damocles/arrival-poses.json` publishes: one or more validated
/// on-foot standing positions per Body, each from a live capture.
///
/// A Pose is **admitted** if and only if its `workspaceOrigin` is non-null. The discriminator is
/// the origin, not the cell: every Pose carries a cell because `$7B5C` always exists, and what
/// varies is whether that cell is anchored to the Body surface. Without the anchor the Pose's
/// cell cannot be related to any resident placement, which is what a take requires.
///
/// `impliedWorkspaceOrigin` does not qualify a Pose. It is a navigation lead derived from the
/// camera longwords of a single standing position, not a recovered anchor, and admitting it
/// would place objects against a guess. #172 converted nineteen of them into recovered origins
/// by extracting each Body's live workspace out of the Pose's own memstate, so only MIDAS and
/// DAMOCLES still rest on an implied one — and for a stated reason: neither capture stands in a
/// built workspace, so there is nothing to extract without a fresh capture.

export interface ArrivalPose {
  readonly body: string;
  /// The Body's rotation accumulator when the capture was taken (`$62EA + 4 * body`), one turn
  /// every `$04000000`. The terminator reads the low ten bits of its high word (#497).
  readonly bodyTurn: number;
  readonly cell: number;
  /// `$7AA4`: the Floor the capture stands on in the structure bound in its cell, 0 outside
  /// one. Read from the capture, never from the height (#474, #505).
  readonly floor: number;
  readonly id: string;
  readonly name: string;
  readonly onFoot: boolean;
  readonly position: Vector3;
  /// `$79BE`: the Body's sub-stellar longitude, 1024 steps a turn, written on arrival.
  readonly subStellarLongitude: number;
  /// Null where the Body has no recovered 16x16 workspace origin.
  readonly workspaceOrigin: { readonly x: number; readonly z: number } | null;
  readonly yaw: number;
}

export interface ArrivalPoses {
  readonly poses: readonly ArrivalPose[];
  readonly programSha256: string;
}

const fail = (message: string): never => {
  throw new Error(message);
};

const record = (value: unknown, path: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(`${path} is not a record`);

const text = (value: unknown, path: string): string =>
  typeof value === 'string' && value !== '' ? value : fail(`${path} is empty`);

const finite = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(`${path} is not a finite number`);

const unsigned = (value: unknown, limit: number, path: string): number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= limit
    ? (value as number)
    : fail(`${path} is not an integer from 0 to ${limit}`);

const originOf = (
  value: unknown,
  path: string
): { readonly x: number; readonly z: number } | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const origin = record(value, path);
  return {
    x: finite(origin['x'], `${path}.x`),
    z: finite(origin['z'], `${path}.z`)
  };
};

export const parseDamoclesArrivalPoses = (value: unknown): ArrivalPoses => {
  const root = record(value, 'arrival poses');
  if (root['schemaVersion'] !== 1) {
    return fail(
      `arrival poses schema ${String(root['schemaVersion'])} is not 1`
    );
  }
  const source = record(root['source'], 'arrival poses source');
  const list = root['poses'];
  if (!Array.isArray(list)) {
    return fail('arrival poses have no poses');
  }
  const poses = list.map((entry, index): ArrivalPose => {
    const pose = record(entry, `arrival pose ${index}`);
    const position = record(pose['position'], `arrival pose ${index} position`);
    if (typeof pose['onFoot'] !== 'boolean') {
      return fail(`arrival pose ${index} does not say whether it is on foot`);
    }
    return {
      body: text(pose['body'], `arrival pose ${index} body`),
      bodyTurn: unsigned(
        pose['bodyTurn'],
        0xff_ff_ff_ff,
        `arrival pose ${index} bodyTurn`
      ),
      cell: finite(pose['cell'], `arrival pose ${index} cell`),
      floor: unsigned(pose['floor'], 10, `arrival pose ${index} floor`),
      id: text(pose['id'], `arrival pose ${index} id`),
      name: text(pose['name'], `arrival pose ${index} name`),
      onFoot: pose['onFoot'],
      position: {
        x: finite(position['x'], `arrival pose ${index} position.x`),
        y: finite(position['y'], `arrival pose ${index} position.y`),
        z: finite(position['z'], `arrival pose ${index} position.z`)
      },
      subStellarLongitude: unsigned(
        pose['subStellarLongitude'],
        0x3_ff,
        `arrival pose ${index} subStellarLongitude`
      ),
      workspaceOrigin: originOf(
        pose['workspaceOrigin'],
        `arrival pose ${index} workspaceOrigin`
      ),
      yaw: finite(pose['yaw'], `arrival pose ${index} yaw`)
    };
  });
  if (new Set(poses.map(pose => pose.id)).size !== poses.length) {
    return fail('arrival poses repeat an id');
  }
  return {
    poses,
    programSha256: text(
      source['programSha256'],
      'arrival poses source.programSha256'
    )
  };
};

export const admittedPoses = (poses: ArrivalPoses): readonly ArrivalPose[] =>
  poses.poses.filter(pose => pose.workspaceOrigin !== null);

/// A Pose the session can stand in: admitted, on foot, and on a Body the Catalogue knows.
export type AdmittedPose = ArrivalPose & {
  readonly workspaceOrigin: { readonly x: number; readonly z: number };
};

export type PoseResolution =
  | { readonly kind: 'ambiguous'; readonly poses: readonly string[] }
  | { readonly kind: 'resolved'; readonly pose: AdmittedPose }
  | { readonly kind: 'unanchored'; readonly pose: ArrivalPose }
  | { readonly kind: 'unknown' };

/// Resolve what the console was given: a Pose id, or a Body name as shorthand.
///
/// A bare Body name is accepted only where that Body has exactly one admitted Pose. Three of the
/// four admitted Bodies carry two, so a Body alone is ambiguous today and would become silently
/// ambiguous tomorrow for any Body that gains a second -- a default would make `switch vesta`
/// mean a different standing position the day a third Pose lands, with nothing a reader could
/// see. GAEA settles it: `switch gaea` resolves because it has one admitted Pose, while
/// `switch gaea-transporter` declines with the unanchored reason, which is only expressible
/// because Poses are addressable individually.
export const resolvePose = (
  poses: ArrivalPoses,
  catalogue: Catalogue,
  name: string
): PoseResolution => {
  const wanted = name.trim().toLowerCase();
  const known = poses.poses.filter(pose =>
    catalogue.bodies.some(body => body.id === pose.body)
  );
  const byId = known.find(pose => pose.id.toLowerCase() === wanted);
  if (byId !== undefined) {
    return byId.workspaceOrigin === null
      ? { kind: 'unanchored', pose: byId }
      : { kind: 'resolved', pose: byId as AdmittedPose };
  }
  const bodyPoses = known.filter(pose => pose.name.toLowerCase() === wanted);
  if (bodyPoses.length === 0) {
    return { kind: 'unknown' };
  }
  const anchored = bodyPoses.filter(pose => pose.workspaceOrigin !== null);
  if (anchored.length === 1) {
    return { kind: 'resolved', pose: anchored[0] as AdmittedPose };
  }
  if (anchored.length === 0) {
    return { kind: 'unanchored', pose: bodyPoses[0]! };
  }
  return {
    kind: 'ambiguous',
    poses: anchored.map(pose => pose.id).sort()
  };
};

/// The standing Pose an arrival Pose describes, in the session's own terms.
export const poseOfArrival = (
  arrival: AdmittedPose,
  doc: ErisPresentationDocument
): Pose => ({
  body: arrival.body,
  heading: bearingFromYaw(arrival.yaw, doc.orientation),
  // Every arrival capture is on foot and none records a pitch word, so an arrival is level.
  pitch: 0,
  position: { ...arrival.position }
});
