/// Before/after previews for #671, drawn by the existing renderers from what the loading
/// adapters return. Targ: the composed record replaces its payload record in a real World, and
/// `visible`/`projectFrame` project it from a fixed Pose into Screen Lines, written as SVG. Damocles:
/// the composed Model goes through the Catalogue's Model reader into the catalogue's WebGL viewer
/// in headless Chromium, screenshotted to PNG.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import {
  parseCatalogueDocument,
  type Catalogue,
  type Mesh,
  type Model
} from '../../src/catalogue/data.ts';
import { regionForms } from '../../src/catalogue/regions.ts';
import {
  damoclesModel,
  targObjectModel,
  targRoom,
  targSurfaceCell
} from '../../src/geometrySpike/adapter.ts';
import type {
  GeometryAsset,
  Sidecar
} from '../../src/geometrySpike/contract.ts';
import type * as Doc from '../../src/payload/documents.ts';
import { load } from '../../src/payload/load.ts';
import { Camera, projectFrame, visible } from '../../src/projection/index.ts';
import { World } from '../../src/world/index.ts';
import { ROOT } from './paths.ts';

const payload = join(ROOT, 'payload');
const SIZE = { height: 272, width: 640 };

let bundle: Doc.Bundle | undefined;
const payloadBundle = async () =>
  (bundle ??= await load(async name => {
    try {
      return readFileSync(join(payload, name), 'utf8');
    } catch {
      return undefined;
    }
  }));

interface Pose {
  readonly at: { x: number; y: number; z: number };
  readonly room?: number;
  readonly target: { x: number; y: number; z: number };
}

/// A Camera at `at` turned toward `target`, under the projection module's own conventions.
const lookAt = ({ at, target }: Pose) => {
  const dx = target.x - at.x,
    dy = target.y - at.y,
    dz = target.z - at.z;
  return new Camera({
    heading: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    position: at
  });
};

/// The Pose each Targ fixture is previewed from.
const TARG_POSES: Record<string, Pose> = {
  'targ:object-model:1700': {
    at: { x: 1152, y: 160, z: 1200 },
    room: 111,
    target: { x: 1152, y: 120, z: 0 }
  },
  'targ:room:0': {
    at: { x: 600, y: 700, z: 600 },
    room: 0,
    target: { x: 3600, y: 200, z: 3600 }
  },
  'targ:surface-cell:1': {
    at: { x: 96_000, y: 6000, z: 30_000 },
    target: { x: 99_328, y: 1500, z: 33_792 }
  }
};

const svg = (
  title: string,
  lines: { ink: number; x1: number; x2: number; y1: number; y2: number }[]
) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.width}" height="${SIZE.height + 24}" viewBox="0 0 ${SIZE.width} ${SIZE.height + 24}">`,
    `<rect width="100%" height="100%" fill="#0b0d10"/>`,
    `<text x="8" y="16" fill="#9aa4ad" font-family="monospace" font-size="12">${title}</text>`,
    `<g transform="translate(0 24)" stroke-linecap="round">`,
    ...lines.map(
      l =>
        `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${l.ink === 0 ? '#e8edf2' : '#6c7884'}" stroke-width="1"/>`
    ),
    '</g>',
    '</svg>',
    ''
  ].join('\n');

export const targPreview = async (
  asset: GeometryAsset,
  sidecar: Sidecar,
  title: string
): Promise<string> => {
  const base = await payloadBundle();
  const pose = TARG_POSES[asset.asset]!;
  let substituted: Doc.Bundle;
  if (sidecar.family === 'targ-object-model') {
    const model = targObjectModel(asset, sidecar);
    substituted = {
      ...base,
      objects: {
        ...base.objects,
        models: base.objects.models.map(m => (m.id === model.id ? model : m))
      }
    };
  } else if (sidecar.family === 'targ-room') {
    const room = targRoom(asset, sidecar);
    substituted = {
      ...base,
      rooms: {
        ...base.rooms,
        rooms: base.rooms.rooms.map(r => (r.room === room.room ? room : r))
      }
    };
  } else {
    const cell = targSurfaceCell(asset, sidecar);
    substituted = {
      ...base,
      surface: {
        ...base.surface,
        cells: base.surface.cells.map(c => (c.cell === cell.cell ? cell : c))
      }
    };
  }
  const world = new World(substituted);
  const seen = visible(
    world,
    pose.at,
    pose.room === undefined ? {} : { room: pose.room }
  );
  const frame = projectFrame(lookAt(pose), seen, SIZE);
  return svg(title, [...frame.distant, ...frame.lines]);
};

let catalogue: Catalogue | undefined;
const catalogueDocument = () =>
  (catalogue ??= parseCatalogueDocument(
    JSON.parse(readFileSync(join(payload, 'damocles/catalogue.json'), 'utf8'))
  ));

/// The Mesh a part draws as, through the Catalogue reader: a variant, a walk mesh, an attachment,
/// or — for the plan, which draws only through region queues — region 1's assembled form.
export const damoclesPartMesh = (
  model: Model,
  part: string,
  detail?: Model
): Mesh => {
  const [kind, id] = part.split(/:(.*)/) as [string, string | undefined];
  if (kind === 'variant') {
    return model.variants.find(v => v.id === id)!.mesh;
  }
  if (kind === 'walk') {
    return model.variants.find(v => v.id === id)!.walkMesh!;
  }
  if (kind === 'attachment') {
    return model.structureSelection!.attachments.find(
      a => a.slot === Number(id)
    )!.mesh;
  }
  if (kind === 'plan') {
    return (
      regionForms(model, detail)[0]?.mesh ?? model.structureSelection!.plan
    );
  }
  throw new Error(`no preview for part ${part}`);
};

export const damoclesModelOf = (asset: GeometryAsset, sidecar: Sidecar) =>
  damoclesModel(asset, sidecar, catalogueDocument());

const PAGE = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0b0d10;color:#9aa4ad;font:12px monospace;display:flex;gap:8px;padding:8px}
figure{margin:0} canvas{width:420px;height:320px;display:block;background:#04090b}
figcaption{padding:4px 0}</style><body></body>`;

/// Ground records run strips out to ±32767 so that a cell's road reaches its neighbours; the
/// viewer frames a mesh by its extent, which would shrink the cell to a speck. Display only.
export const clampedToCell = (mesh: Mesh, extent = 1200): Mesh => ({
  ...mesh,
  vertices: mesh.vertices.map(
    v =>
      v.map(c =>
        Math.max(-extent, Math.min(extent, c))
      ) as unknown as Mesh['vertices'][number]
  )
});

/// Side-by-side views of each mesh through the catalogue viewer, as one PNG.
export const damoclesPreview = async (
  views: readonly {
    angle?: readonly [number, number];
    mesh: Mesh;
    title: string;
  }[]
): Promise<Uint8Array> => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, 'previewPage.ts')],
    target: 'browser'
  });
  if (!build.success) {
    throw new Error(build.logs.join('\n'));
  }
  const script = await build.outputs[0]!.text();
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: 360, width: 16 + views.length * 428 }
    });
    await page.setContent(PAGE);
    await page.evaluate(
      v => ((window as unknown as { __PREVIEW: unknown }).__PREVIEW = v),
      views as unknown as object
    );
    await page.addScriptTag({ content: script, type: 'module' });
    await page.waitForFunction(
      () => (window as unknown as { __READY?: boolean }).__READY === true
    );
    await page.waitForTimeout(200);
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    await browser.close();
  }
};

/// An SVG preview rasterised by the same headless browser, for review tools that show PNG only.
export const svgToPng = async (text: string): Promise<Uint8Array> => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: SIZE.height + 24, width: SIZE.width }
    });
    await page.setContent(`<body style="margin:0">${text}</body>`);
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
};
