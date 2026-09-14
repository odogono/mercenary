import type { Catalogue } from '../catalogue/data.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { ErisPose } from './world.ts';

/// Version 3 replaces Capital Spaceport fields with the bound structure workspace.
export const DAMOCLES_SAVE_SCHEMA_VERSION = 3 as const;
export const DAMOCLES_DESTINATION = 'damocles' as const;

export interface DamoclesSaveIdentity {
  readonly catalogueProgramSha256: string;
  readonly destination: typeof DAMOCLES_DESTINATION;
  readonly erisSchemaVersion: number;
  readonly title: typeof DAMOCLES_DESTINATION;
}

export interface BoundStructureSnapshot {
  readonly attachments: readonly {
    readonly openUnits: number;
    readonly slot: number;
  }[];
  readonly instanceId: string;
  readonly regionIndex: number | null;
}

export interface DamoclesSaveSnapshot {
  readonly elapsed: number;
  readonly pose: ErisPose;
  readonly structure: BoundStructureSnapshot | null;
}

export interface DamoclesSaveRecord {
  readonly identity: DamoclesSaveIdentity;
  readonly savedAt: string;
  readonly schemaVersion: typeof DAMOCLES_SAVE_SCHEMA_VERSION;
  readonly snapshot: DamoclesSaveSnapshot;
  readonly where: string;
}

export const damoclesSaveIdentity = (
  catalogue: Catalogue,
  doc: ErisPresentationDocument
): DamoclesSaveIdentity => ({
  catalogueProgramSha256: catalogue.source.programSha256,
  destination: DAMOCLES_DESTINATION,
  erisSchemaVersion: doc.schemaVersion,
  title: DAMOCLES_DESTINATION
});

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const fail = (reason: string): never => {
  throw new Error(reason);
};

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${path} must be a record`);
  }
  return value as Record<string, unknown>;
};

const poseOf = (value: unknown): ErisPose => {
  const pose = object(value, 'pose');
  const position = object(pose['position'], 'pose.position');
  if (
    !finite(pose['heading']) ||
    !finite(position['x']) ||
    !finite(position['y']) ||
    !finite(position['z'])
  ) {
    return fail('pose is not a finite heading and position');
  }
  return {
    heading: pose['heading'],
    position: { x: position['x'], y: position['y'], z: position['z'] }
  };
};

const identityOf = (value: unknown): DamoclesSaveIdentity => {
  const identity = object(value, 'identity');
  if (
    identity['destination'] !== DAMOCLES_DESTINATION ||
    identity['title'] !== DAMOCLES_DESTINATION ||
    typeof identity['catalogueProgramSha256'] !== 'string' ||
    identity['catalogueProgramSha256'] === '' ||
    !finite(identity['erisSchemaVersion'])
  ) {
    return fail('identity is not a Damocles Destination');
  }
  return {
    catalogueProgramSha256: identity['catalogueProgramSha256'],
    destination: DAMOCLES_DESTINATION,
    erisSchemaVersion: identity['erisSchemaVersion'],
    title: DAMOCLES_DESTINATION
  };
};

export const encodeDamoclesSave = (record: DamoclesSaveRecord): string =>
  JSON.stringify(record);

/// Decode a Damocles Save or Session Resume, or throw the exact refusal.
///
/// Identity is exact: a Targ envelope, a schema-1 record, or a Catalogue/Eris mismatch cannot
/// become play without a migration this version does not have.
export const decodeDamoclesSave = (
  encoded: string,
  expected: DamoclesSaveIdentity
): DamoclesSaveRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return fail('not JSON');
  }
  const record = object(parsed, 'save');
  if (record['schemaVersion'] !== DAMOCLES_SAVE_SCHEMA_VERSION) {
    return fail(
      `schema ${String(record['schemaVersion'])} is not Damocles Save ${DAMOCLES_SAVE_SCHEMA_VERSION}`
    );
  }
  if (typeof record['savedAt'] !== 'string' || record['savedAt'] === '') {
    return fail('savedAt is missing');
  }
  if (typeof record['where'] !== 'string' || record['where'] === '') {
    return fail('where is missing');
  }
  const identity = identityOf(record['identity']);
  if (
    identity.catalogueProgramSha256 !== expected.catalogueProgramSha256 ||
    identity.erisSchemaVersion !== expected.erisSchemaVersion
  ) {
    return fail('payload identity does not match');
  }
  const snapshot = object(record['snapshot'], 'snapshot');
  if (!finite(snapshot['elapsed'])) {
    return fail('elapsed is not a finite number');
  }
  let structure: BoundStructureSnapshot | null = null;
  if (snapshot['structure'] !== null) {
    const bound = object(snapshot['structure'], 'snapshot.structure');
    const instanceId = bound['instanceId'];
    const regionIndex = bound['regionIndex'];
    if (
      typeof instanceId !== 'string' ||
      instanceId === '' ||
      (regionIndex !== null &&
        (!Number.isInteger(regionIndex) ||
          (regionIndex as number) < 0 ||
          (regionIndex as number) >= 256)) ||
      !Array.isArray(bound['attachments'])
    ) {
      return fail('bound structure state is outside its recovered bounds');
    }
    const attachments = bound['attachments'].map(value => {
      const attachment = object(value, 'snapshot.structure.attachments[]');
      const slot = attachment['slot'];
      const openUnits = attachment['openUnits'];
      if (
        !Number.isInteger(slot) ||
        (slot as number) <= 0 ||
        (slot as number) > 0x03_fc ||
        (slot as number) % 4 !== 0 ||
        !finite(openUnits) ||
        openUnits < 0 ||
        openUnits > 32_767
      ) {
        return fail('attachment state is outside its recovered bounds');
      }
      return { openUnits, slot: slot as number };
    });
    if (
      new Set(attachments.map(item => item.slot)).size !== attachments.length
    ) {
      return fail('attachment slots are duplicated');
    }
    structure = {
      attachments,
      instanceId,
      regionIndex: regionIndex as number | null
    };
  }
  return {
    identity,
    savedAt: record['savedAt'],
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot: {
      elapsed: snapshot['elapsed'],
      pose: poseOf(snapshot['pose']),
      structure
    },
    where: record['where']
  };
};

export const damoclesWhere = (cell: {
  readonly x: number;
  readonly z: number;
}): string =>
  `ERIS ${String(cell.x).padStart(2, '0')}-${String(cell.z).padStart(2, '0')}`;
