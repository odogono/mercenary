import { sha256 } from '../hash/index.ts';

export type TypefaceId = 'mercenary' | 'damocles';

/// The one typeface choice Targ and Damocles shared before it was kept per Title (ADR 0063).
export const SHARED_TYPEFACE_STORAGE_KEY =
  'mercenary.browser-shell.typeface.v1';

const TYPEFACE_IDS = ['mercenary', 'damocles'] as const;
const GLYPH_COUNT = 99;
const FACE_PATHS: Readonly<Record<TypefaceId, string>> = {
  damocles: 'fonts/damocles.woff2',
  mercenary: 'fonts/mercenary.woff2'
};
const FACE_FAMILIES: Readonly<Record<TypefaceId, string>> = {
  damocles: 'Damocles Interface',
  mercenary: 'Mercenary Pixel'
};

export interface TypefaceFace {
  readonly family: string;
  readonly id: TypefaceId;
  readonly path: string;
  readonly sha256: string;
  readonly sourceGlyphCount: number;
  readonly synthesizedGlyphCount: number;
}

export interface TypographyDocument {
  readonly defaultFace: 'mercenary';
  readonly faces: Readonly<Record<TypefaceId, TypefaceFace>>;
  readonly schemaVersion: 1;
}

interface ReadStorage {
  getItem(key: string): string | null;
}

interface WriteStorage {
  setItem(key: string, value: string): void;
}

interface RegisteredFont {
  readonly family: string;
}

interface LoadableFont extends RegisteredFont {
  load(): Promise<RegisteredFont>;
}

interface TypographyLoadOptions {
  readonly addFont?: (font: RegisteredFont) => void;
  readonly createFont?: (family: string, source: ArrayBuffer) => LoadableFont;
  readonly fetch?: (input: string | URL) => Promise<Response>;
  readonly rootUrl?: URL;
}

const fail = (message: string): never => {
  throw new Error(`Invalid typography.json: ${message}`);
};

const object = (value: unknown, at: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${at} must be an object`);
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown, at: string): string => {
  if (typeof value !== 'string' || value === '') {
    return fail(`${at} must be a non-empty string`);
  }
  return value;
};

const count = (value: unknown, at: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return fail(`${at} must be a non-negative integer`);
  }
  return Number(value);
};

const face = (value: unknown, id: TypefaceId): TypefaceFace => {
  const result = object(value, `faces.${id}`);
  if (result['id'] !== id) {
    return fail(`faces.${id}.id must be ${id}`);
  }
  if (result['path'] !== FACE_PATHS[id]) {
    return fail(`faces.${id}.path must be ${FACE_PATHS[id]}`);
  }
  if (result['family'] !== FACE_FAMILIES[id]) {
    return fail(`faces.${id}.family must be ${FACE_FAMILIES[id]}`);
  }
  const sha256 = string(result['sha256'], `faces.${id}.sha256`);
  if (!/^[\da-f]{64}$/.test(sha256)) {
    return fail(`faces.${id}.sha256 must be 64 lowercase hexadecimal digits`);
  }
  const sourceGlyphCount = count(
    result['sourceGlyphCount'],
    `faces.${id}.sourceGlyphCount`
  );
  const synthesizedGlyphCount = count(
    result['synthesizedGlyphCount'],
    `faces.${id}.synthesizedGlyphCount`
  );
  if (sourceGlyphCount + synthesizedGlyphCount !== GLYPH_COUNT) {
    return fail(`faces.${id} glyph counts must total ${GLYPH_COUNT}`);
  }
  return {
    family: FACE_FAMILIES[id],
    id,
    path: FACE_PATHS[id],
    sha256,
    sourceGlyphCount,
    synthesizedGlyphCount
  };
};

export const validateTypography = (value: unknown): TypographyDocument => {
  const result = object(value, '$');
  if (result['schemaVersion'] !== 1) {
    return fail('schemaVersion must be 1');
  }
  if (result['defaultFace'] !== 'mercenary') {
    return fail('defaultFace must be mercenary');
  }
  const faces = object(result['faces'], 'faces');
  if (
    Object.keys(faces).length !== TYPEFACE_IDS.length ||
    TYPEFACE_IDS.some(id => !(id in faces))
  ) {
    return fail('faces must contain exactly mercenary and damocles');
  }
  return {
    defaultFace: 'mercenary',
    faces: {
      damocles: face(faces['damocles'], 'damocles'),
      mercenary: face(faces['mercenary'], 'mercenary')
    },
    schemaVersion: 1
  };
};

const response = async (
  fetcher: (input: string | URL) => Promise<Response>,
  url: URL
): Promise<Response> => {
  const result = await fetcher(url);
  if (!result.ok) {
    throw new Error(`${url.pathname} answered HTTP ${result.status}`);
  }
  return result;
};

export const loadTypography = async (
  options: TypographyLoadOptions = {}
): Promise<TypographyDocument> => {
  const rootUrl = options.rootUrl ?? new URL(location.href);
  const fetcher = options.fetch ?? fetch;
  const metadataResponse = await response(
    fetcher,
    new URL('/payload/typography.json', rootUrl)
  );
  const typography = validateTypography(await metadataResponse.json());
  const assets = await Promise.all(
    TYPEFACE_IDS.map(async id => {
      const face = typography.faces[id];
      const result = await response(
        fetcher,
        new URL(`/payload/${face.path}`, rootUrl)
      );
      return { bytes: await result.arrayBuffer(), face };
    })
  );
  for (const asset of assets) {
    const actual = await sha256(asset.bytes);
    if (actual !== asset.face.sha256) {
      throw new Error(
        `${asset.face.path} sha256 mismatch: expected ${asset.face.sha256}, got ${actual}`
      );
    }
  }

  const createFont =
    options.createFont ??
    ((family: string, source: ArrayBuffer): LoadableFont =>
      new FontFace(family, source, {
        style: 'normal',
        weight: '400'
      }) as unknown as LoadableFont);
  const loaded = await Promise.all(
    assets.map(asset => createFont(asset.face.family, asset.bytes).load())
  );
  const addFont =
    options.addFont ??
    ((font: RegisteredFont): void => {
      document.fonts.add(font as unknown as FontFace);
    });
  loaded.forEach(addFont);
  return typography;
};

const isTypeface = (value: string | null): value is TypefaceId =>
  value === 'mercenary' || value === 'damocles';

/// A Title's typeface, from its own key, or while it has written none the choice it shared
/// before (ADR 0063).
export const readTypefacePreference = (
  storage: ReadStorage | undefined,
  key: string
): TypefaceId => {
  try {
    const value =
      storage?.getItem(key) ??
      storage?.getItem(SHARED_TYPEFACE_STORAGE_KEY) ??
      null;
    return isTypeface(value) ? value : 'mercenary';
  } catch {
    return 'mercenary';
  }
};

/// Where a typeface choice is kept: the Title's storage and its key.
export interface TypefaceStore {
  readonly key: string;
  readonly storage: WriteStorage | undefined;
}

export const applyTypeface = (
  root: HTMLElement,
  face: TypefaceId,
  store?: TypefaceStore
): void => {
  root.dataset['fontFace'] = face;
  try {
    store?.storage?.setItem(store.key, face);
  } catch {
    // Applying the in-memory choice does not depend on storage being available.
  }
};

export const installTypefaceSelector = (
  select: HTMLSelectElement,
  root: HTMLElement,
  storage: Storage | undefined,
  key: string
): TypefaceId => {
  const initial = readTypefacePreference(storage, key);
  select.value = initial;
  applyTypeface(root, initial);
  select.disabled = false;
  select.addEventListener('change', () => {
    const selected = isTypeface(select.value) ? select.value : 'mercenary';
    select.value = selected;
    applyTypeface(root, selected, { key, storage });
  });
  return initial;
};
