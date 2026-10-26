import { describe, expect, test } from 'bun:test';

import { checkAsset } from '../src/geometry/compose.ts';
import type { Colour, GeometryAsset, Part } from '../src/geometry/contract.ts';
import { planInspection } from '../src/shell/frame.ts';
import {
  DEFAULT_ORBIT,
  orbitCamera,
  previewGeometry
} from '../src/targAssetBrowser/preview.ts';
import { World, facePolygon, objectSegments } from '../src/world/index.ts';
import { FIXTURES } from '../tools/geometry-spike/fixtures.ts';
import { loadPayload, payloadDirectory } from './replay/artifacts.ts';

/// #874: Targ object models carry authored colours; anything left uncoloured draws in Line Colour.

const bundle = await loadPayload();
const model = bundle.objects.models[0]!;
const RED: Colour = { colour: '#ff0000', kind: 'palette' };

const errors = (asset: GeometryAsset, sidecar = model.sidecar) =>
  checkAsset(asset, sidecar)
    .filter(d => d.severity === 'error')
    .map(d => `${d.site}: ${d.message}`);

const withWireframe = (
  asset: GeometryAsset,
  change: (part: Part) => Part
): GeometryAsset => ({
  ...asset,
  parts: asset.parts.map(part =>
    part.role === 'wireframe' ? change(part) : part
  )
});

/// The object's wireframe with its first line coloured.
const firstLineRed = (part: Part): Part => ({
  ...part,
  lines: part.lines.map((line, i) =>
    i === 0 ? { ...line, colour: RED } : line
  )
});

describe('Targ object colour in the format', () => {
  test('an object part takes fixed colours and may mix them with uncoloured primitives', () => {
    expect(
      model.asset.parts.find(p => p.role === 'wireframe')!.colourModel
    ).toBe('palette');
    expect(errors(model.asset)).toEqual([]);
    expect(errors(withWireframe(model.asset, firstLineRed))).toEqual([]);
  });

  test('a Room part still carries no colour', () => {
    const room = withWireframe(model.asset, part => ({
      ...firstLineRed(part),
      colourModel: 'none'
    }));
    expect(errors(room)).toEqual([
      'wireframe/l0: this part carries no colours'
    ]);
  });

  test('a Damocles primitive needs a colour and its colour word', async () => {
    const { asset, sidecar } = await FIXTURES.find(
      f => f.slug === 'damocles-structure-01484e'
    )!.recover(payloadDirectory());
    const index = asset.parts.findIndex(p => p.faces.length > 0);
    const part = asset.parts[index]!;
    const face = part.faces[0]!;
    const edited = (colour: Colour | undefined): GeometryAsset => ({
      ...asset,
      parts: asset.parts.map((p, i) =>
        i === index
          ? {
              ...p,
              faces: [
                colour === undefined
                  ? { id: face.id, loop: face.loop }
                  : { ...face, colour },
                ...p.faces.slice(1)
              ]
            }
          : p
      )
    });
    const site = `${part.id}/f${face.id}`;
    expect(errors(edited(face.colour), sidecar)).toEqual([]);
    expect(errors(edited(undefined), sidecar)).toEqual([
      `${site}: needs a palette colour`
    ]);
    expect(errors(edited(RED), sidecar)).toEqual([
      `${site}: needs a colour word; Damocles records store one`
    ]);
  });
});

describe('Targ object colour in the frame', () => {
  test('a coloured object line draws in its colour after the white ink', () => {
    const asset = withWireframe(model.asset, firstLineRed);
    const world = new World({
      ...bundle,
      objects: {
        ...bundle.objects,
        models: bundle.objects.models.map(value =>
          value === model ? { ...value, asset } : value
        )
      }
    });
    const object = world.objects.find(o => `targ:${o.model}` === asset.asset)!;
    const segments = objectSegments(object);
    expect(segments[0]!.colour).toEqual({ blue: 0, green: 0, red: 255 });
    expect(segments.slice(1).every(s => s.colour === undefined)).toBe(true);

    const geometry = previewGeometry(asset);
    const plan = planInspection(
      orbitCamera(geometry, DEFAULT_ORBIT),
      geometry,
      { height: 400, width: 640 }
    );
    expect(plan.batches.map(b => b.colour)).toEqual([
      { blue: 255, green: 255, red: 255 },
      { blue: 0, green: 0, red: 255 }
    ]);
    expect(plan.batches[1]!.vertices.length).toBe(4);
  });

  test('an uncoloured face draws in Line Colour', () => {
    const corner = { x: 0, y: 0, z: 0 };
    expect(
      facePolygon({}, [corner, { ...corner, x: 1 }, { ...corner, y: 1 }]).colour
    ).toEqual({ blue: 255, green: 255, red: 255 });
  });
});
