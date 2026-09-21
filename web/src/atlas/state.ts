/// Where the Atlas is looking, and how that survives a URL.
///
/// One discrete hop: the System Range holds every recovered Body, and entering a Body starts a
/// camera of its own (#405). `view` is that camera; the System Range never has one, and the
/// Body Range leaves it null until #411 lands the wrapping surface camera and its `x/z/span`
/// round-trip.

export interface AtlasBodyView {
  readonly span: number;
  readonly x: number;
  readonly z: number;
}

export type AtlasState =
  | { readonly level: 'system' }
  | {
      readonly bodyId: string;
      readonly level: 'body';
      readonly view: AtlasBodyView | null;
    };

export const SYSTEM_RANGE: AtlasState = { level: 'system' };

/// A `?body=` naming no recovered Body falls back to the System Range rather than opening an
/// empty Body, so a stale deep link lands somewhere true.
export const readAtlasState = (
  search: string,
  bodyIds: readonly string[]
): AtlasState => {
  const bodyId = new URLSearchParams(search).get('body');
  return bodyId !== null && bodyIds.includes(bodyId)
    ? { bodyId, level: 'body', view: null }
    : SYSTEM_RANGE;
};

export const atlasSearch = (state: AtlasState): string =>
  state.level === 'system'
    ? ''
    : `?${new URLSearchParams({ body: state.bodyId }).toString()}`;

export const atlasHref = (state: AtlasState): string =>
  `/damocles/atlas${atlasSearch(state)}`;
