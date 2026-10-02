import type { DionCatalogue } from '../dion/catalogue.ts';
import {
  int,
  ints,
  list,
  provenance,
  record,
  type Provenance
} from '../dion/read.ts';
import {
  readGlyph,
  type DionGlyph,
  type DionScenePalette
} from '../dion/world.ts';

export const supportPath = '/payload/dion/catalogue/render-support.json';
export interface RenderSupport {
  readonly bodies: ReadonlyMap<
    string,
    {
      readonly land: number;
      readonly road: number;
      readonly skyDay: number;
      readonly skyNight: number;
    }
  >;
  readonly colours: readonly number[];
  readonly fixed: ReadonlyMap<number, number>;
  readonly glyphs: ReadonlyMap<string, DionGlyph>;
  readonly groups: ReadonlyMap<
    number,
    {
      readonly land: number;
      readonly road: number;
      readonly skyDay: number;
      readonly skyNight: number;
    }
  >;
  readonly palettes: ReadonlyMap<number, DionScenePalette>;
  readonly priority: readonly number[];
  readonly provenance: readonly Provenance[];
  readonly rotation: readonly number[];
  readonly surfaceYaw: ReadonlyMap<number, number>;
  readonly template: readonly number[];
  readonly tokens: ReadonlyMap<
    number,
    {
      readonly bindings?: readonly (readonly number[])[];
      readonly default: readonly number[];
    }
  >;
}
export const readRenderSupport = (
  value: unknown,
  catalogue: DionCatalogue
): RenderSupport => {
  const at = supportPath;
  const raw = record(value, at);
  if (
    raw['kind'] !== 'dion-catalogue-render-support' ||
    raw['schemaVersion'] !== 1
  ) {
    throw new Error(`${at}: unsupported kind/schemaVersion`);
  }
  const source = record(raw['source'], `${at}.source`);
  for (const [key, value] of Object.entries(catalogue.source)) {
    if (source[key] !== value) {
      throw new Error(
        `${at}.source.${key}: differs from the validated Catalogue`
      );
    }
  }
  const words = (key: string, count: number, min = 0) => {
    const row = record(raw[key], `${at}.${key}`);
    provenance(row['provenance'], `${at}.${key}.provenance`);
    return ints(
      row['words'] ?? row['bytes'],
      `${at}.${key}`,
      count,
      min,
      min < 0 ? 32_767 : 65_535
    );
  };
  const palette = record(raw['framePalette'], `${at}.framePalette`);
  const fixed = new Map<number, number>();
  for (const [key, v] of Object.entries(
    record(palette['fixed'], `${at}.framePalette.fixed`)
  )) {
    fixed.set(
      int(Number(key), `${at}.fixed key`, 0, 15),
      int(v, `${at}.fixed.${key}`, 0, 65_535)
    );
  }
  int(palette['horizonRow'], `${at}.horizonRow`, 68, 68);
  const glyphs = new Map<string, DionGlyph>();
  for (const [key, v] of Object.entries(
    record(raw['glyphs'], `${at}.glyphs`)
  )) {
    if (!/^[0-7]:[\dA-F]{2}$/.test(key)) {
      throw new Error(`${at}.glyphs: invalid key ${key}`);
    }
    const glyph = readGlyph(v, `${at}.glyphs.${key}`);
    if (
      key !==
      `${glyph.font}:${glyph.code.toString(16).padStart(2, '0').toUpperCase()}`
    ) {
      throw new Error(`${at}.glyphs.${key}: identity mismatch`);
    }
    glyphs.set(key, glyph);
  }
  for (let font = 0; font < 8; font += 1) {
    for (let code = 0x20; code < 0x60; code += 1) {
      if (!glyphs.has(`${font}:${code.toString(16).toUpperCase()}`)) {
        throw new Error(`${at}.glyphs: expected all eight fonts`);
      }
    }
  }
  const palettes = new Map<number, DionScenePalette>();
  for (const [key, v] of Object.entries(
    record(raw['palettes'], `${at}.palettes`)
  )) {
    const row = record(v, `${at}.palettes.${key}`);
    palettes.set(int(Number(key), `${at}.palette key`, 0, 255), {
      day: ints(row['day'], `${at}.palettes.${key}.day`, 64, 0, 65_535),
      night: ints(row['night'], `${at}.palettes.${key}.night`, 64, 0, 65_535),
      provenance: provenance(
        row['provenance'],
        `${at}.palettes.${key}.provenance`
      )
    });
  }
  for (const s of catalogue.structures) {
    for (const f of s.floorBindings) {
      if (!palettes.has(f.palette)) {
        throw new Error(`${at}.palettes: missing reference ${f.palette}`);
      }
    }
  }
  const groups = new Map<
    number,
    { land: number; road: number; skyDay: number; skyNight: number }
  >();
  for (const [key, v] of Object.entries(
    record(raw['groups'], `${at}.groups`)
  )) {
    const row = record(v, `${at}.groups.${key}`);
    list(row['provenance'], `${at}.groups.${key}.provenance`).forEach((p, i) =>
      provenance(p, `${at}.groups.${key}.provenance[${i}]`)
    );
    groups.set(int(Number(key), `${at}.group key`, 0, 56), {
      land: int(row['land'], `${at}.land`, 0, 65_535),
      road: int(row['road'], `${at}.road`, 0, 65_535),
      skyDay: int(row['skyDay'], `${at}.skyDay`, 0, 65_535),
      skyNight: int(row['skyNight'], `${at}.skyNight`, 0, 65_535)
    });
  }
  for (const group of Object.keys(catalogue.surfaceCells)) {
    if (!groups.has(Number(group))) {
      throw new Error(`${at}.groups: missing reference ${group}`);
    }
  }
  const bodies = new Map<
    string,
    { land: number; road: number; skyDay: number; skyNight: number }
  >();
  for (const [key, v] of Object.entries(
    record(raw['bodies'], `${at}.bodies`)
  )) {
    if (!catalogue.bodies.some(b => b.id === key)) {
      throw new Error(`${at}.bodies: foreign Body ${key}`);
    }
    const row = record(v, `${at}.bodies.${key}`);
    list(row['provenance'], `${at}.bodies.${key}.provenance`).forEach((p, i) =>
      provenance(p, `${at}.bodies.${key}.provenance[${i}]`)
    );
    bodies.set(key, {
      land: int(row['land'], `${at}.land`, 0, 65_535),
      road: int(row['road'], `${at}.road`, 0, 65_535),
      skyDay: int(row['skyDay'], `${at}.skyDay`, 0, 65_535),
      skyNight: int(row['skyNight'], `${at}.skyNight`, 0, 65_535)
    });
  }
  if (bodies.size !== catalogue.bodies.length) {
    throw new Error(`${at}.bodies: missing Body`);
  }
  const tokens = new Map<
    number,
    { bindings?: readonly (readonly number[])[]; default: readonly number[] }
  >();
  for (const [key, v] of Object.entries(
    record(raw['tokens'], `${at}.tokens`)
  )) {
    if (!/^\$[\dA-F]{2}$/.test(key)) {
      throw new Error(`${at}.tokens: invalid key ${key}`);
    }
    const row = record(v, `${at}.tokens.${key}`);
    tokens.set(Number.parseInt(key.slice(1), 16), {
      default: ints(
        row['default'],
        `${at}.tokens.${key}.default`,
        undefined,
        1,
        255
      ),
      ...(row['bindings'] === undefined
        ? {}
        : {
            bindings: list(row['bindings'], `${at}.tokens.${key}.bindings`).map(
              (b, i) =>
                ints(b, `${at}.tokens.${key}.bindings[${i}]`, undefined, 1, 255)
            )
          })
    });
  }
  const yaw = record(raw['surfaceYaw'], `${at}.surfaceYaw`);
  provenance(yaw['provenance'], `${at}.surfaceYaw.provenance`);
  const slots = record(yaw['slots'], `${at}.surfaceYaw.slots`);
  const surfaceYaw = new Map<number, number>();
  const surfaceObjects = catalogue.objects.filter(
    o => o.residence === 'surface'
  );
  if (Object.keys(slots).length !== surfaceObjects.length) {
    throw new Error(`${at}.surfaceYaw: surface inventory differs`);
  }
  for (const object of surfaceObjects) {
    surfaceYaw.set(
      object.slot,
      int(slots[String(object.slot)], `${at}.surfaceYaw.${object.slot}`, 0, 255)
    );
  }
  return {
    bodies,
    colours: words('modelColours', 60),
    fixed,
    glyphs,
    groups,
    palettes,
    priority: words('drawPriority', 82),
    provenance: list(
      palette['provenance'],
      `${at}.framePalette.provenance`
    ).map((p, i) => provenance(p, `${at}.framePalette.provenance[${i}]`)),
    rotation: words('rotationTable', 320, -32_768),
    surfaceYaw,
    template: ints(
      palette['template'],
      `${at}.framePalette.template`,
      17,
      0,
      65_535
    ),
    tokens
  };
};
