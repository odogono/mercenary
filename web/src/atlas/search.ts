import {
  instanceById,
  modelSummaryById,
  type Catalogue,
  type Instance,
  type Island,
  type ModelSummary
} from '../catalogue/data.ts';
import type { GammaBody, GammaSystemDocument } from '../flyover/documents.ts';
import type { MapPoint } from './mapView.ts';
import { catalogueBodyId } from './surface.ts';

/// The Atlas's research search (#453): find a recovered record by name or record id, then see
/// where it is recovered to be. Pure over the Gamma System and the Catalogue's shared document;
/// nothing here reads a Model file or touches the DOM.

/// The kinds of record a search finds, in the order results list them.
export const SEARCH_KINDS = [
  'body',
  'settlement',
  'place',
  'model',
  'instance'
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_LABEL: Readonly<Record<SearchKind, string>> = {
  body: 'Body',
  instance: 'Instance',
  model: 'Model',
  place: 'Damocles Place',
  settlement: 'Settlement'
};

export const isSearchKind = (value: string): value is SearchKind =>
  (SEARCH_KINDS as readonly string[]).includes(value);

/// One record a search can find.
export interface SearchRecord {
  /// The Atlas Bodies the record belongs to: its own Body, or for a Model every Body one of its
  /// Instances is located on. Empty where no Body the Atlas draws is recovered for it.
  readonly bodyIds: readonly string[];
  /// The record's own id: a Body's slug, or the Catalogue record id.
  readonly id: string;
  readonly kind: SearchKind;
  readonly name: string;
  /// What the words are matched against: the name and the id, lower-cased.
  readonly text: string;
}

export interface SearchQuery {
  /// An Atlas Body id the results must belong to, or null for the whole System.
  readonly bodyId: string | null;
  readonly kind: SearchKind | null;
  readonly q: string;
}

const record = (
  kind: SearchKind,
  id: string,
  name: string,
  bodyIds: readonly string[]
): SearchRecord => ({
  bodyIds,
  id,
  kind,
  name,
  text: `${name} ${id}`.toLowerCase()
});

/// The join from a Catalogue body id to the Atlas's own, keyed by recovered source slot. VOID
/// and any other Catalogue body the Gamma System does not draw has no entry.
export const atlasBodyIdsBySlot = (
  system: GammaSystemDocument
): ReadonlyMap<string, string> =>
  new Map(
    system.bodies.map(body => [catalogueBodyId(body.sourceIndex), body.id])
  );

/// Every record a search can find. Bodies come from the Gamma System and are there before the
/// Catalogue is read; everything else joins once it has been.
export const buildSearchIndex = (
  system: GammaSystemDocument,
  catalogue?: Catalogue
): readonly SearchRecord[] => {
  const bodies = system.bodies.map(body =>
    record('body', body.id, body.name, [body.id])
  );
  if (catalogue === undefined) {
    return bodies;
  }
  const atlas = atlasBodyIdsBySlot(system);
  const onBody = (id: string | null | undefined): readonly string[] => {
    const mapped = id === null || id === undefined ? undefined : atlas.get(id);
    return mapped === undefined ? [] : [mapped];
  };
  const modelBodies = new Map<string, Set<string>>();
  for (const instance of catalogue.instances) {
    const body = onBody(instance.location?.body)[0];
    if (body !== undefined) {
      let set = modelBodies.get(instance.model);
      if (set === undefined) {
        set = new Set();
        modelBodies.set(instance.model, set);
      }
      set.add(body);
    }
  }
  const order = system.bodies.map(body => body.id);
  return [
    ...bodies,
    ...catalogue.islands
      .filter(island => island.areaName !== null)
      .map(island =>
        record('settlement', island.id, island.areaName!, onBody(island.body))
      ),
    ...catalogue.places.map(place =>
      record('place', place.id, place.name, onBody(place.body))
    ),
    ...catalogue.modelIndex.map(model =>
      record(
        'model',
        model.id,
        model.name,
        order.filter(id => modelBodies.get(model.id)?.has(id))
      )
    ),
    ...catalogue.instances.map(instance =>
      record(
        'instance',
        instance.id,
        instance.name,
        onBody(instance.location?.body)
      )
    )
  ];
};

const words = (q: string): readonly string[] =>
  q.toLowerCase().trim().split(/\s+/).filter(Boolean);

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/// The records matching every word of `q`, in a fixed order: kind first, then name, then id,
/// so the same query always lists the same records the same way. An empty query finds nothing
/// rather than everything.
export const querySearch = (
  index: readonly SearchRecord[],
  query: SearchQuery
): readonly SearchRecord[] => {
  const wanted = words(query.q);
  if (wanted.length === 0) {
    return [];
  }
  return index
    .filter(
      item =>
        (query.kind === null || item.kind === query.kind) &&
        (query.bodyId === null || item.bodyIds.includes(query.bodyId)) &&
        wanted.every(word => item.text.includes(word))
    )
    .sort(
      (left, right) =>
        SEARCH_KINDS.indexOf(left.kind) - SEARCH_KINDS.indexOf(right.kind) ||
        compare(left.name.toLowerCase(), right.name.toLowerCase()) ||
        compare(left.id, right.id)
    );
};

/// Where one Instance is recovered to be, as the Atlas can show it.
///
/// Only a recovered location on a Body the Atlas draws puts an Instance on the map. A resident
/// placed inside another Instance has a parent-local position, and an Instance may carry no
/// location at all; neither is given surface coordinates, from its parent or from any Body it
/// is associated with.
export type InstancePlacement =
  | {
      readonly at: MapPoint;
      readonly body: GammaBody;
      readonly kind: 'located';
    }
  | { readonly kind: 'parent'; readonly parent: Instance | undefined }
  | { readonly catalogueBodyId: string; readonly kind: 'unmapped' }
  | { readonly kind: 'unlocated' };

export const instancePlacement = (
  system: GammaSystemDocument,
  catalogue: Catalogue,
  instance: Instance
): InstancePlacement => {
  const location = instance.location;
  if (location !== null) {
    const body = system.bodies.find(
      candidate => catalogueBodyId(candidate.sourceIndex) === location.body
    );
    return body === undefined
      ? { catalogueBodyId: location.body, kind: 'unmapped' }
      : {
          at: { x: location.position[0], z: location.position[2] },
          body,
          kind: 'located'
        };
  }
  if (instance.placement !== null) {
    return {
      kind: 'parent',
      parent: instanceById(catalogue, instance.placement.parent)
    };
  }
  return { kind: 'unlocated' };
};

/// Every recorded occurrence of one Model, grouped the way the search section lists them.
export interface ModelPlacements {
  /// Located Instances, grouped by Atlas Body in the Gamma System's own order.
  readonly byBody: readonly {
    readonly body: GammaBody;
    readonly instances: readonly {
      readonly at: MapPoint;
      readonly instance: Instance;
    }[];
  }[];
  readonly model: ModelSummary;
  /// Residents placed inside another Instance, at a position local to it.
  readonly parentLocal: readonly {
    readonly instance: Instance;
    readonly parent: Instance | undefined;
  }[];
  /// Instances with no recovered location.
  readonly unlocated: readonly Instance[];
  /// Instances located on a Catalogue body the Gamma System does not draw.
  readonly unmapped: readonly Instance[];
}

/// The whole list, never a chosen one: a Model is reusable geometry and each Instance one
/// occurrence of it, so which occurrence the reader wants is theirs to pick.
export const modelPlacements = (
  system: GammaSystemDocument,
  catalogue: Catalogue,
  modelId: string
): ModelPlacements | null => {
  const model = modelSummaryById(catalogue, modelId);
  if (model === undefined) {
    return null;
  }
  const located = new Map<
    string,
    { readonly at: MapPoint; readonly instance: Instance }[]
  >();
  const parentLocal: ModelPlacements['parentLocal'][number][] = [];
  const unlocated: Instance[] = [];
  const unmapped: Instance[] = [];
  for (const instance of catalogue.instances) {
    if (instance.model !== modelId) {
      continue;
    }
    const placement = instancePlacement(system, catalogue, instance);
    if (placement.kind === 'located') {
      const list = located.get(placement.body.id) ?? [];
      list.push({ at: placement.at, instance });
      located.set(placement.body.id, list);
    } else if (placement.kind === 'parent') {
      parentLocal.push({ instance, parent: placement.parent });
    } else if (placement.kind === 'unmapped') {
      unmapped.push(instance);
    } else {
      unlocated.push(instance);
    }
  }
  return {
    byBody: system.bodies.flatMap(body => {
      const instances = located.get(body.id);
      return instances ? [{ body, instances }] : [];
    }),
    model,
    parentLocal,
    unlocated,
    unmapped
  };
};

/// Where a Settlement is centred: the middle of the Structure Workspace its island record binds,
/// which is 16 Surface Cells square from the record's own origin ($056464). The record carries
/// a workspace whether or not it carries a coastline, so a coastline-less Settlement is as
/// locatable as any other.
export const settlementCentre = (island: Island): MapPoint => ({
  x: island.origin[0] + 8,
  z: island.origin[1] + 8
});
