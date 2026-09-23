/// Where the Atlas is looking, and how that survives a URL.
///
/// One discrete hop: the System Range holds every recovered Body, and entering a Body starts a
/// camera of its own (#405). Each Range carries a camera of its own in the same three keys,
/// because a URL is only ever in one Range at a time; the System Range's is in engine units and
/// a Body's will be in Body Coordinates (#411).

import { STREET_SPAN } from './bodyRange.ts';
import type { MapPoint } from './mapView.ts';
import { isSearchKind, type SearchKind } from './search.ts';

export interface AtlasView {
  readonly span: number;
  readonly x: number;
  readonly z: number;
}

/// What the search section is showing (#453). It travels with every Range and every selection,
/// so a reader can move about the map, and hop between Ranges, without losing the question they
/// were asking.
export interface AtlasSearch {
  /// The Body results must belong to, or null for the whole System. Separate from the map's own
  /// `body`: which Body is searched and which Body is shown are two different choices.
  readonly bodyId: string | null;
  readonly kind: SearchKind | null;
  /// The Model whose Instances the search section lists, or null.
  readonly modelId: string | null;
  readonly q: string;
}

export const NO_SEARCH: AtlasSearch = {
  bodyId: null,
  kind: null,
  modelId: null,
  q: ''
};

export type AtlasState =
  | {
      readonly level: 'system';
      readonly search?: AtlasSearch;
      readonly view: AtlasView | null;
    }
  | {
      readonly bodyId: string;
      /// The picked Damocles Instance's record id, on the same footing as the other two and
      /// never together with either: a footprint stands inside a Settlement and often on an
      /// island, and is part of neither.
      readonly instanceId: string | null;
      /// The picked Damocles Island's record id, so a selection survives a link the way a
      /// camera does. Null when nothing on the surface is picked.
      readonly islandId: string | null;
      readonly level: 'body';
      /// The picked Damocles Place's record id, on the same footing as the island and never
      /// together with one: a Place lies inside a Settlement but is not part of it, and the
      /// panel names one thing at a time.
      readonly placeId: string | null;
      readonly search?: AtlasSearch;
      /// The picked Settlement, by the island record that carries it, on the same footing as
      /// the others. Distinct from `islandId` even though both name an island record: a
      /// Settlement is the area a Structure Workspace publishes, not the island under it.
      readonly settlementId?: string | null;
      readonly view: AtlasView | null;
    };

export const SYSTEM_RANGE: AtlasState = { level: 'system', view: null };

/// Two decimals of an engine unit is a thousandth of the tightest span the camera reaches, so
/// nothing visible is lost and `readAtlasState(atlasSearch(state))` is exact.
const round = (value: number): string => String(Number(value.toFixed(2)));

/// A camera survives only if all three keys are present, finite and the span is positive. Any
/// partial or unreadable camera yields `null` and the Range refits, the same forgiving rule a
/// `?body=` naming no recovered Body already gets.
const readView = (params: URLSearchParams): AtlasView | null => {
  const numbers = (['x', 'z', 'span'] as const).map(key => {
    const raw = params.get(key);
    return raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  });
  const [x, z, span] = numbers as [number, number, number];
  return numbers.every(Number.isFinite) && span > 0 ? { span, x, z } : null;
};

/// A `?body=` naming no recovered Body falls back to the System Range rather than opening an
/// empty Body, so a stale deep link lands somewhere true. It drops the camera with it: those
/// numbers were written in the missing Body's units and mean nothing in the System's.
/// Search survives whatever the map does with the rest of the URL: an unknown `searchBody` or
/// `kind` widens to the whole System or every kind rather than refusing the query.
const readSearch = (
  params: URLSearchParams,
  bodyIds: readonly string[]
): AtlasSearch => {
  const kind = params.get('kind');
  const bodyId = params.get('searchBody');
  const modelId = params.get('model');
  return {
    bodyId: bodyId !== null && bodyIds.includes(bodyId) ? bodyId : null,
    kind: kind !== null && isSearchKind(kind) ? kind : null,
    modelId: modelId !== null && modelId.trim() !== '' ? modelId : null,
    q: params.get('q') ?? ''
  };
};

export const readAtlasState = (
  search: string,
  bodyIds: readonly string[]
): AtlasState => {
  const params = new URLSearchParams(search);
  const searched = readSearch(params, bodyIds);
  const bodyId = params.get('body');
  if (bodyId !== null && !bodyIds.includes(bodyId)) {
    return { ...SYSTEM_RANGE, search: searched };
  }
  const view = readView(params);
  if (bodyId === null) {
    return { level: 'system', search: searched, view };
  }
  const named = (key: string) => {
    const value = params.get(key);
    return value !== null && value.trim() !== '' ? value : null;
  };
  return {
    bodyId,
    instanceId: named('instance'),
    islandId: named('island'),
    level: 'body',
    placeId: named('place'),
    search: searched,
    settlementId: named('settlement'),
    view
  };
};

export const atlasSearch = (state: AtlasState): string => {
  const params = new URLSearchParams();
  if (state.level === 'body') {
    params.set('body', state.bodyId);
    if (state.islandId) {
      params.set('island', state.islandId);
    }
    if (state.placeId) {
      params.set('place', state.placeId);
    }
    if (state.settlementId) {
      params.set('settlement', state.settlementId);
    }
    if (state.instanceId) {
      params.set('instance', state.instanceId);
    }
  }
  if (state.view) {
    params.set('x', round(state.view.x));
    params.set('z', round(state.view.z));
    params.set('span', round(state.view.span));
  }
  const searched = state.search ?? NO_SEARCH;
  if (searched.q) {
    params.set('q', searched.q);
  }
  if (searched.kind) {
    params.set('kind', searched.kind);
  }
  if (searched.bodyId) {
    params.set('searchBody', searched.bodyId);
  }
  if (searched.modelId) {
    params.set('model', searched.modelId);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
};

export const atlasHref = (state: AtlasState): string =>
  `/damocles/atlas${atlasSearch(state)}`;

/// Where the Catalogue hands one placed Instance over to the Atlas: that Body, that record
/// picked, and a camera one Surface Cell wide about its own recovered position (#415).
///
/// The Catalogue keeps the record and the Atlas keeps the map, so this is the whole of the hop:
/// the reader arrives at the Street Range looking at the cell the Instance stands in, with its
/// footprint selected where one was derived. An Instance the footprint layer does not draw — an
/// object, a ground record, a structure whose Model recovered no outline — still lands on its
/// own position, which is a true statement about where it is and an honest silence about what
/// the map can draw of it.
export const atlasInstanceHref = (
  bodyId: string,
  instanceId: string,
  at: MapPoint
): string =>
  atlasHref({
    bodyId,
    instanceId,
    islandId: null,
    level: 'body',
    placeId: null,
    view: { span: STREET_SPAN, x: at.x, z: at.z }
  });
