import type { Catalogue, Instance } from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';

/// The raw-coordinate unit used by the Damocles surface grid.  A catalogue location is in
/// grid units while an Object Residence is in the same world units the renderer and Pose use.
export const DAMOCLES_CELL_UNITS = 65_536;

export type Residence =
  | { readonly drawClass: number; readonly kind: 'carried' }
  | {
      readonly body: string;
      readonly drawClass: number;
      readonly kind: 'surface';
      readonly position: Vector3;
    }
  | {
      readonly body: string;
      readonly drawClass: number;
      readonly insertionGroup: number;
      readonly kind: 'structure';
      readonly level: number;
      readonly parent: string;
      readonly position: Vector3;
    };

export type PlacedResidence = Exclude<Residence, { readonly kind: 'carried' }>;

export interface ResidenceDeparture {
  readonly instance: string;
  readonly residence: Residence;
}

const drawClassOf = (instance: Instance): number =>
  (instance.handling?.byte ?? 0) & 0x0f;

const positionOf = (position: readonly [number, number, number]): Vector3 => ({
  x: position[0],
  y: position[1],
  z: position[2]
});

/// The canonical recovered Object Residence.  An instance with only an Association is not
/// returned: it names an eligible object, but not a recovered place from which the renderer or
/// selection loop may draw it.
export const catalogueResidence = (
  catalogue: Catalogue,
  instanceId: string
): Residence | undefined => {
  const instance = catalogue.instances.find(item => item.id === instanceId);
  if (instance === undefined) {
    return undefined;
  }
  if (instance.association !== null && instance.placement !== null) {
    return {
      body: instance.association.body,
      drawClass: drawClassOf(instance),
      insertionGroup: instance.association.insertionGroupSelector,
      kind: 'structure',
      level: instance.association.levelSelector,
      parent: instance.placement.parent,
      position: positionOf(instance.placement.position)
    };
  }
  if (instance.location !== null) {
    return {
      body: instance.location.body,
      drawClass: drawClassOf(instance),
      kind: 'surface',
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
  const parent = catalogue.instances.find(instance => instance.id === parentId);
  const model = catalogue.models.find(model => model.id === parent?.model);
  const height = model?.storeyHeight;
  return height !== undefined && Number.isSafeInteger(height) && height > 0
    ? height
    : undefined;
};

export const validStructureResidence = (
  catalogue: Catalogue,
  residence: Extract<Residence, { readonly kind: 'structure' }>
): boolean => {
  const parent = catalogue.instances.find(
    instance => instance.id === residence.parent
  );
  const parentModel = catalogue.models.find(
    model => model.id === parent?.model
  );
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
  // Y=0 satisfies every positive pitch; this admits no inferred height or elevation.
  if (height === undefined) {
    return residence.level === 0 && residence.position.y === 0 && admittedGroup;
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
        readonly residence: Residence;
      } => value !== undefined
    )
    .sort((left, right) => compareText(left.instance.id, right.instance.id));
  const responses: Readonly<Record<string, string>> = {
    'object-slot-101': 'damocles.script.slot-101',
    'object-slot-151': 'damocles.script.slot-151',
    'object-slot-181': 'damocles.script.slot-181',
    'object-slot-183': 'damocles.script.slot-2',
    'object-slot-94': 'damocles.script.slot-94',
    'object-slot-95': 'damocles.script.slot-95'
  };
  const rows = admitted.flatMap(({ body, poses }) =>
    residents.map(({ instance, residence }): AcceptanceRow => {
      const residentBody = residence.kind === 'carried' ? body : residence.body;
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
          candidate.residence.kind !== 'carried' &&
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
        const top = catalogue.models.find(
          model => model.id === support.instance.model
        )?.supportTop;
        const rankPasses = demand !== 0 && supply !== 0 && supply >= demand;
        const formPasses = top !== null && top !== undefined;
        const heightPasses = formPasses && top <= 63;
        drops.push({
          outcome: rankPasses && heightPasses ? 'dropped' : 'refused',
          support: support.instance.id,
          supportClass: support.residence.drawClass,
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
