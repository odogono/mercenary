/// Where the Atlas is looking, and how that survives a URL.
///
/// One discrete hop: the System Range holds every recovered Body, and entering a Body starts a
/// camera of its own (#405). Each Range carries a camera of its own in the same three keys,
/// because a URL is only ever in one Range at a time; the System Range's is in engine units and
/// a Body's will be in Body Coordinates (#411).

export interface AtlasView {
  readonly span: number;
  readonly x: number;
  readonly z: number;
}

export type AtlasState =
  | { readonly level: 'system'; readonly view: AtlasView | null }
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
export const readAtlasState = (
  search: string,
  bodyIds: readonly string[]
): AtlasState => {
  const params = new URLSearchParams(search);
  const bodyId = params.get('body');
  if (bodyId !== null && !bodyIds.includes(bodyId)) {
    return SYSTEM_RANGE;
  }
  const view = readView(params);
  if (bodyId === null) {
    return { level: 'system', view };
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
    if (state.instanceId) {
      params.set('instance', state.instanceId);
    }
  }
  if (state.view) {
    params.set('x', round(state.view.x));
    params.set('z', round(state.view.z));
    params.set('span', round(state.view.span));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
};

export const atlasHref = (state: AtlasState): string =>
  `/damocles/atlas${atlasSearch(state)}`;
