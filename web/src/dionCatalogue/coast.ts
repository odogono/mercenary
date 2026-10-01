import type { CoastSurface } from '../coast/islands.ts';
import type { GeometryStore } from '../dion/catalogue.ts';
import type { DionCoastIsland } from '../dion/frame.ts';
import { ints, list, record } from '../dion/read.ts';

const box = (value: unknown) => {
  const r = record(value, 'island box');
  return {
    x: ints(r['x'], 'island box x', 2) as [number, number],
    z: ints(r['z'], 'island box z', 2) as [number, number]
  };
};

export const catalogueCoast = async (
  store: GeometryStore,
  bodyId: string,
  centre: readonly number[]
): Promise<CoastSurface<DionCoastIsland>> => {
  const body = store.catalogue.bodies.find(b => b.id === bodyId);
  if (!body) {
    throw new Error(`${bodyId}: missing Body`);
  }
  const islands: DionCoastIsland[] = [];
  for (const i of body.islands) {
    const g = await store.get(i.geometry);
    const v = g.variants['base']!;
    islands.push({
      boxes: [
        box(v['outer']),
        box(v['core']),
        ...list(v['sea'], 'island sea').map(box)
      ],
      coastline: {
        edges: list(v['edges'], 'island edges').map(e => {
          const r = record(e, 'island edge');
          return (Number(r['to']) << 8) | (Number(r['from']) * 4);
        }),
        vertices: list(v['vertices'], 'island vertices').map(
          p => ints(p, 'island vertex', 2) as [number, number]
        )
      },
      id: i.id,
      landColour: i.landColour,
      origin: { x: i.origin[0]! - centre[0]!, z: i.origin[1]! - centre[1]! }
    });
  }
  return { grid: { cellUnits: 65_536 }, islands };
};
