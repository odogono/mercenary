import { fetchReader, load } from '../payload/load.ts';
import { World } from '../world/index.ts';

/// The smallest thing that proves the port runs in a browser rather than only in a test.
///
/// It loads the Data Payload over `fetch` — the read seam the loader was given for exactly this —
/// builds the world, and reports what came out. There are no pixels yet: the projection and the
/// WebGL2 line list are #91, which is where this page grows a canvas and draws a frame of Targ.
const status = document.getElementById('status')!;

try {
  const bundle = await load(
    fetchReader(new URL('/payload/', location.href).href)
  );
  const world = new World(bundle);
  status.textContent =
    `Data Payload ${bundle.manifest.sourceDatasetId} decoded: ` +
    `${world.objects.length} objects, ${world.cells.length} cells, ${world.rooms.size} rooms, ` +
    `ground extent ${world.groundExtent}. Projection and the wireframe are next (#91).`;
} catch (error) {
  status.textContent = `Could not load the Data Payload — ${String(error)}`;
}
