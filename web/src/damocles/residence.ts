import {
  instanceById,
  modelSummaryById,
  type Catalogue,
  type Instance
} from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';
import { SCRIPT_FOR_TRIGGER, TRIGGER_FOR_RESIDENT } from './scripts.ts';

/// The raw-coordinate unit used by the Damocles surface grid.  A catalogue location is in
/// grid units while an Object Residence is in the same world units the renderer and Pose use.
export const DAMOCLES_CELL_UNITS = 65_536;

/// Where a Damocles resident object is. `occupied` is the object the player is aboard: boarding
/// removes it from Object Residence, so it is neither placed nor carried, and it is not drawn or
/// selectable until leaving restores it (#407). Its Catalogue coordinates are stale while it is
/// occupied and must not stand in for a place.
export type Residence =
  | { readonly kind: 'carried'; readonly placementClass: number }
  | { readonly kind: 'occupied'; readonly placementClass: number }
  | {
      readonly body: string;
      readonly kind: 'surface';
      readonly placementClass: number;
      readonly position: Vector3;
    }
  | {
      readonly body: string;
      readonly insertionGroup: number;
      readonly kind: 'structure';
      readonly level: number;
      readonly parent: string;
      readonly placementClass: number;
      readonly position: Vector3;
    };

export type PlacedResidence = Exclude<
  Residence,
  { readonly kind: 'carried' | 'occupied' }
>;

export interface ResidenceDeparture {
  readonly instance: string;
  readonly residence: Residence;
}

/// Association A byte 3, the recovered placement class. It is not the handling byte's low
/// nibble: the two disagree for 176 of the 241 resident slots
/// (docs/research/damocles-placement-class.md). A slot with no resident state has none, and
/// nothing derives one for it.
const placementClassOf = (instance: Instance): number =>
  instance.placementClass ?? 0;

const positionOf = (position: readonly [number, number, number]): Vector3 => ({
  x: position[0],
  y: position[1],
  z: position[2]
});

/// How many times a structure resident is inserted in one region of its parent.
///
/// A resident is exposed where its insertion group **numbers** the region — the implicit
/// `(group, group)` pair — plus once for each explicit pair in the parent's association list that
/// names that region. A group can expose one resident in several regions and can hold more than
/// one insertion for a region, so this counts rather than answering yes or no.
///
/// The explicit pairs come from the **resident's own** `association.insertions`, which the
/// extractor resolves from the parent's association-list root for every resident it places
/// (docs/research/damocles-dion-vesta-structure-groups.md, "the association-list root is derived,
/// not tabulated"). The parent's whole `associationGroups` table is published for Capital
/// Spaceport alone, so consulting that instead left every other structure with the implicit pair
/// only, and its residents placed and never drawn.
///
/// A Drop writes its own insertion group. Where that differs from the resident's authored group
/// the resident's pairs do not describe it, so only the parent's table can answer, and a parent
/// without one falls back to the implicit pair. That is a real limit, not a default: nothing in
/// the payload says which regions another group reaches.
export const insertionsInRegion = (
  catalogue: Catalogue,
  instanceId: string,
  residence: Residence,
  regionSelector: number
): number => {
  if (residence.kind !== 'structure') {
    return 0;
  }
  const instance = instanceById(catalogue, instanceId);
  const own = instance?.association;
  const explicit =
    own?.insertionGroupSelector === residence.insertionGroup
      ? own.insertions
      : catalogue.instances
          .find(item => item.id === residence.parent)
          ?.associationGroups?.find(
            group => group.group === residence.insertionGroup
          )?.pairs;
  return (
    (residence.insertionGroup === regionSelector ? 1 : 0) +
    (explicit?.filter(pair => pair.regionSelector === regionSelector).length ??
      0)
  );
};

/// The canonical recovered Object Residence.  An instance with only an Association is not
/// returned: it names an eligible object, but not a recovered place from which the renderer or
/// selection loop may draw it.
export const catalogueResidence = (
  catalogue: Catalogue,
  instanceId: string
): PlacedResidence | undefined => {
  const instance = instanceById(catalogue, instanceId);
  if (instance === undefined) {
    return undefined;
  }
  if (instance.association !== null && instance.placement !== null) {
    return {
      body: instance.association.body,
      insertionGroup: instance.association.insertionGroupSelector,
      kind: 'structure',
      level: instance.association.levelSelector,
      parent: instance.placement.parent,
      placementClass: placementClassOf(instance),
      position: positionOf(instance.placement.position)
    };
  }
  if (instance.location !== null) {
    return {
      body: instance.location.body,
      kind: 'surface',
      placementClass: placementClassOf(instance),
      position: {
        x: instance.location.position[0] * DAMOCLES_CELL_UNITS,
        y: instance.location.position[1] * DAMOCLES_CELL_UNITS,
        z: instance.location.position[2] * DAMOCLES_CELL_UNITS
      }
    };
  }
  return undefined;
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/// Only the parent Model's recovered alias-header pitch can admit a structure residence.
/// Missing metadata is unknown, never inferred from child coordinates or provenance prose.
export const structureStoreyHeight = (
  catalogue: Catalogue,
  parentId: string
): number | undefined => {
  const parent = instanceById(catalogue, parentId);
  const model = modelSummaryById(catalogue, parent?.model);
  const height = model?.storeyHeight;
  return height !== undefined && Number.isSafeInteger(height) && height > 0
    ? height
    : undefined;
};

export const validStructureResidence = (
  catalogue: Catalogue,
  residence: Extract<Residence, { readonly kind: 'structure' }>
): boolean => {
  const parent = instanceById(catalogue, residence.parent);
  const parentModel = modelSummaryById(catalogue, parent?.model);
  if (
    parent?.location?.body !== residence.body ||
    parentModel?.kind !== 'structure'
  ) {
    return false;
  }
  if (
    residence.level < 0 ||
    residence.level > 255 ||
    residence.insertionGroup <= 0 ||
    residence.insertionGroup > 255 ||
    !Number.isInteger(residence.level) ||
    !Number.isInteger(residence.insertionGroup) ||
    !Number.isFinite(residence.position.x) ||
    !Number.isFinite(residence.position.y) ||
    !Number.isFinite(residence.position.z)
  ) {
    return false;
  }
  const height = structureStoreyHeight(catalogue, residence.parent);
  const recoveredPlacement = catalogue.instances.some(
    instance =>
      instance.placement?.parent === residence.parent &&
      instance.association?.body === residence.body &&
      instance.association.levelSelector === residence.level &&
      instance.association.insertionGroupSelector ===
        residence.insertionGroup &&
      instance.placement.position[0] === residence.position.x &&
      instance.placement.position[1] === residence.position.y &&
      instance.placement.position[2] === residence.position.z
  );
  const admittedGroup =
    parent.associationGroups?.some(
      group => group.group === residence.insertionGroup
    ) ?? false;
  // Direct structures do not publish an alias pitch ($054DE0). Level zero at
  // Y=0 satisfies every positive pitch; this admits no inferred height or elevation. A
  // recovered level-zero placement is admitted where it stands (a WALL PHONE hangs at Y=40),
  // as the extractor bounds it by the drawn structure; no other level has a floor to stand on.
  if (height === undefined) {
    return (
      residence.level === 0 &&
      (recoveredPlacement || (residence.position.y === 0 && admittedGroup))
    );
  }
  if (!recoveredPlacement && !admittedGroup) {
    return false;
  }
  return (
    0 <= residence.position.y - residence.level * height &&
    residence.position.y - residence.level * height < height
  );
};

export interface AcceptanceRow {
  readonly body: string;
  readonly drops: readonly {
    readonly outcome: 'dropped' | 'refused';
    readonly support: string | null;
    readonly supportClass: number | null;
    readonly tag: 'observed' | 'derived';
  }[];
  readonly instance: string;
  readonly pose: string;
  readonly poses: readonly string[];
  readonly residence: Residence;
  readonly residentBody: string;
  readonly take: {
    readonly outcome: 'took' | 'refused';
    readonly tag: 'observed';
  };
  readonly triggerResponse: string | null;
}

export interface AcceptanceMatrix {
  readonly residentCount: number;
  readonly rows: readonly AcceptanceRow[];
}

interface ArrivalPose {
  readonly body: string;
  readonly id: string;
  readonly onFoot: boolean;
  readonly workspaceOrigin: unknown;
}

const arrivalPosesOf = (value: unknown): readonly ArrivalPose[] => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Damocles arrival poses must be a record');
  }
  const poses = (value as { readonly poses?: unknown }).poses;
  if (!Array.isArray(poses)) {
    throw new Error('Damocles arrival poses have no poses');
  }
  return poses.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Damocles arrival pose ${index} is not a record`);
    }
    const pose = entry as Record<string, unknown>;
    if (
      typeof pose['id'] !== 'string' ||
      typeof pose['body'] !== 'string' ||
      typeof pose['onFoot'] !== 'boolean'
    ) {
      throw new Error(`Damocles arrival pose ${index} is incomplete`);
    }
    return {
      body: pose['body'],
      id: pose['id'],
      onFoot: pose['onFoot'],
      workspaceOrigin: pose['workspaceOrigin']
    };
  });
};

/// Generate the acceptance fixture from both payloads.  It is deliberately a Cartesian product:
/// each recovered resident is checked against every admitted Body, including the body-mismatch
/// cases that prove a Residence cannot leak between Bodies.
export const generateAcceptanceMatrix = (
  catalogue: Catalogue,
  arrivalPoses: unknown
): AcceptanceMatrix => {
  const admittedByBody = new Map<string, string[]>();
  for (const pose of arrivalPosesOf(arrivalPoses)) {
    if (pose.workspaceOrigin === null || pose.workspaceOrigin === undefined) {
      continue;
    }
    const poses = admittedByBody.get(pose.body) ?? [];
    poses.push(pose.id);
    admittedByBody.set(pose.body, poses);
  }
  const admitted = [...admittedByBody]
    .map(([body, poses]) => ({
      body,
      poses: poses.sort(compareText)
    }))
    .sort((left, right) => compareText(left.body, right.body));
  const residents = catalogue.instances
    .map(instance => {
      const residence = catalogueResidence(catalogue, instance.id);
      return residence === undefined || instance.placement === null
        ? undefined
        : { instance, residence };
    })
    .filter(
      (
        value
      ): value is {
        readonly instance: Instance;
        readonly residence: PlacedResidence;
      } => value !== undefined
    )
    .sort((left, right) => compareText(left.instance.id, right.instance.id));
  // A Damocles Script is named for its trigger index, which is also what the strings payload
  // names its inline records after. The resident that launches it is a separate identity.
  const responses: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(TRIGGER_FOR_RESIDENT).map(([instance, trigger]) => [
      instance,
      SCRIPT_FOR_TRIGGER[trigger]!
    ])
  );
  const rows = admitted.flatMap(({ body, poses }) =>
    residents.map(({ instance, residence }): AcceptanceRow => {
      const residentBody = residence.body;
      const takes =
        residentBody === body &&
        instance.handling !== null &&
        (instance.handling.byte & 0x30) === 0;
      // Isolated deterministic handler fixtures: empty stack, settled scroll,
      // no overrides, ground contact, and support origin Y=0 / player eye Y=63.
      // They assert branches, not an unrecovered walking route to each resident.
      const supports = residents.filter(
        candidate =>
          candidate.instance.id !== instance.id &&
          candidate.residence.body === body
      );
      const drops: AcceptanceRow['drops'][number][] = [
        {
          outcome: 'dropped',
          support: null,
          supportClass: null,
          tag: 'observed'
        }
      ];
      for (const support of supports) {
        const demand = instance.handling?.requiredSupportRank ?? 0;
        const supply = support.instance.handling?.suppliedSupportRank ?? 0;
        const top = modelSummaryById(
          catalogue,
          support.instance.model
        )?.supportTop;
        const rankPasses = demand !== 0 && supply !== 0 && supply >= demand;
        const formPasses = top !== null && top !== undefined;
        const heightPasses = formPasses && top <= 63;
        drops.push({
          outcome: rankPasses && heightPasses ? 'dropped' : 'refused',
          support: support.instance.id,
          supportClass: support.residence.placementClass,
          tag:
            demand === 0 || (rankPasses && !heightPasses)
              ? 'derived'
              : 'observed'
        });
      }
      return {
        body,
        drops,
        instance: instance.id,
        pose: poses[0]!,
        poses,
        residence,
        residentBody,
        take: { outcome: takes ? 'took' : 'refused', tag: 'observed' },
        triggerResponse: takes ? (responses[instance.id] ?? null) : null
      };
    })
  );
  return {
    residentCount: residents.length,
    rows: rows.sort(
      (left, right) =>
        compareText(left.body, right.body) ||
        compareText(left.instance, right.instance) ||
        compareText(left.pose, right.pose)
    )
  };
};
