import type { Catalogue, Instance } from './data.ts';
import { link, node } from './dom.ts';
import {
  clusterView,
  describeView,
  fitView,
  gridStep,
  panView,
  project,
  zoomView,
  type MapPoint,
  type MapView
} from './mapView.ts';

// How a render chooses the map view: refit the whole body, recentre on the
// selected placement's local cluster, or leave the current view alone (Back,
// filters and other navigation that does not open a placement).
export type MapFocus = 'fit' | 'cluster' | 'keep';

const BUTTON_ZOOM = 1.5;
const KEY_PAN = 0.1;
const DRAG_THRESHOLD = 4;

let fit: MapView | null = null,
  view: MapView | null = null,
  mappedBody = '';
let markers: {
  readonly anchor: HTMLAnchorElement;
  readonly point: MapPoint;
}[] = [];

const pointOf = (instance: Instance): MapPoint => ({
  x: instance.location!.position[0],
  z: instance.location!.position[2]
});

const frame = () => {
  const rect = node('map').getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    ? {
        aspect: rect.height / rect.width,
        height: rect.height,
        width: rect.width
      }
    : { aspect: 1, height: 520, width: 520 };
};

const place = () => {
  const map = node('map');
  for (const id of ['map-zoom-in', 'map-zoom-out', 'map-reset']) {
    node<HTMLButtonElement>(id).disabled = !view;
  }
  if (!fit || !view) {
    node('map-scale').textContent = '';
    return;
  }
  const { aspect, height, width } = frame();
  for (const { anchor, point } of markers) {
    const { u, v } = project(view, point, aspect);
    anchor.style.left = `${100 * u}%`;
    anchor.style.top = `${100 * v}%`;
  }
  const step = gridStep(view.span, width);
  const pixels = (step / view.span) * width;
  const origin = project(view, { x: 0, z: 0 }, aspect);
  map.style.backgroundSize = `${pixels}px ${pixels}px`;
  map.style.backgroundPosition = `${((origin.u * width) % pixels).toFixed(2)}px ${((origin.v * height) % pixels).toFixed(2)}px`;
  node('map-scale').textContent = describeView(fit, view, width);
};

const update = (next: MapView) => {
  view = next;
  place();
};

// Fractions of the map's width and height under a pointer event.
const fraction = (event: { clientX: number; clientY: number }) => {
  const rect = node('map').getBoundingClientRect();
  return {
    u: (event.clientX - rect.left) / rect.width,
    v: (event.clientY - rect.top) / rect.height
  };
};

export const mountMap = (): void => {
  const map = node('map');
  let drag: {
    moved: boolean;
    pointerId: number;
    x: number;
    y: number;
  } | null = null;
  map.addEventListener(
    'wheel',
    event => {
      if (!fit || !view) {
        return;
      }
      event.preventDefault();
      const { u, v } = fraction(event);
      update(
        zoomView(
          fit,
          view,
          Math.exp(-event.deltaY * 0.001),
          u,
          v,
          frame().aspect
        )
      );
    },
    { passive: false }
  );
  map.addEventListener('pointerdown', event => {
    if (!view || event.button !== 0) {
      return;
    }
    drag = {
      moved: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  });
  map.addEventListener('pointermove', event => {
    if (!drag || !fit || !view || event.pointerId !== drag.pointerId) {
      return;
    }
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }
    if (!drag.moved) {
      // Capture only once this is a drag, so a plain click still reaches
      // the marker link underneath.
      map.setPointerCapture(event.pointerId);
    }
    drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const { aspect, height, width } = frame();
    update(panView(fit, view, dx / width, dy / height, aspect));
  });
  // A drag that ends over a marker is not a selection. The click that
  // follows a pointerup arrives in the same task, before this flag clears.
  let dragged = false;
  map.addEventListener(
    'click',
    event => {
      if (dragged) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true }
  );
  const release = () => {
    map.classList.remove('dragging');
    if (!drag) {
      return;
    }
    const { moved, pointerId } = drag;
    drag = null;
    if (map.hasPointerCapture(pointerId)) {
      map.releasePointerCapture(pointerId);
    }
    if (moved) {
      dragged = true;
      setTimeout(() => {
        dragged = false;
      }, 0);
    }
  };
  map.addEventListener('pointerup', release);
  map.addEventListener('pointercancel', release);
  map.addEventListener('lostpointercapture', release);
  map.addEventListener('pointermove', () => {
    if (drag?.moved) {
      map.classList.add('dragging');
    }
  });
  map.addEventListener('keydown', event => {
    if (!fit || !view || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const pans: Record<string, [number, number]> = {
      ArrowDown: [0, -KEY_PAN],
      ArrowLeft: [KEY_PAN, 0],
      ArrowRight: [-KEY_PAN, 0],
      ArrowUp: [0, KEY_PAN]
    };
    const pan = pans[event.key];
    if (pan) {
      update(panView(fit, view, pan[0], pan[1], frame().aspect));
    } else if (event.key === '+' || event.key === '=') {
      update(zoomView(fit, view, BUTTON_ZOOM));
    } else if (event.key === '-') {
      update(zoomView(fit, view, 1 / BUTTON_ZOOM));
    } else if (event.key === '0') {
      update(fit);
    } else {
      return;
    }
    event.preventDefault();
  });
  node('map-zoom-in').addEventListener('click', () => {
    if (fit && view) {
      update(zoomView(fit, view, BUTTON_ZOOM));
    }
  });
  node('map-zoom-out').addEventListener('click', () => {
    if (fit && view) {
      update(zoomView(fit, view, 1 / BUTTON_ZOOM));
    }
  });
  node('map-reset').addEventListener('click', () => {
    if (fit) {
      update(fit);
    }
  });
  window.addEventListener('resize', place);
};

export const renderMap = (
  data: Catalogue,
  body: string,
  selected: string | null,
  focus: MapFocus
): void => {
  const map = node('map'),
    locations = node('locations');
  map.replaceChildren();
  locations.replaceChildren();
  markers = [];
  const located = data.instances.filter(
    instance => instance.location?.body === body
  );
  const systems = new Set(
    located.map(instance => instance.location!.coordinateSystem)
  );
  if (systems.size > 1) {
    node('map-note').textContent =
      'Placements use incompatible coordinate systems; see the location list.';
    fit = view = null;
    mappedBody = '';
  } else if (!located.length) {
    node('map-note').textContent =
      'No verified surface placements for this body yet. Unknown locations are not plotted.';
    fit = view = null;
    mappedBody = '';
  } else {
    const points = located.map(pointOf);
    if (body !== mappedBody || !fit || !view) {
      fit = fitView(points);
      view = fit;
      mappedBody = body;
    }
    const index = located.findIndex(instance => instance.id === selected);
    if (focus === 'fit') {
      view = fit;
    } else if (focus === 'cluster' && index >= 0) {
      view = clusterView(points, index, fit);
    }
    const chosen = index >= 0 ? points[index]! : null;
    const sharing = chosen
      ? points.filter(point => point.x === chosen.x && point.z === chosen.z)
          .length - 1
      : 0;
    node('map-note').textContent =
      `${located.length} recovered placements · ${[...systems][0]} · X right, Z up` +
      (sharing
        ? ` · the selected placement shares its position with ${sharing} other${sharing === 1 ? '' : 's'}; see the location list`
        : '');
    for (const [i, instance] of located.entries()) {
      const at = instance.location!;
      const a = link('', 'instance', instance.id);
      a.title = `${instance.name} · ${at.position[0].toFixed(3)}, ${at.position[2].toFixed(3)}`;
      a.setAttribute('aria-label', instance.name);
      a.setAttribute('aria-current', String(instance.id === selected));
      map.append(a);
      markers.push({ anchor: a, point: points[i]! });
    }
  }
  place();
  for (const instance of located) {
    locations.append(
      link(
        `${instance.name} · ${instance.location!.position.map(value => value.toFixed(3)).join(', ')}`,
        'instance',
        instance.id
      )
    );
  }
};
