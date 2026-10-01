/// The preview page's script: the catalogue's own viewer, once per mesh the harness hands it.

import type { Mesh } from '../../src/catalogue/data.ts';
import { createViewer } from '../../src/catalogue/viewer.ts';

const views = (
  window as unknown as {
    __PREVIEW: { angle?: [number, number]; mesh: Mesh; title: string }[];
  }
).__PREVIEW;
for (const view of views) {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  const caption = document.createElement('figcaption');
  caption.textContent = view.title;
  figure.append(caption, canvas);
  document.body.append(figure);
  createViewer(canvas).show(view.mesh, false, view.angle);
}
requestAnimationFrame(
  () => ((window as unknown as { __READY: boolean }).__READY = true)
);
