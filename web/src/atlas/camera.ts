import { panView, zoomView, type MapView } from '../catalogue/mapView.ts';

/// PROTOTYPE (not production; reachable only behind `?camera=1`).
///
/// Slippy-map gestures over any element: drag to pan, wheel to zoom about the pointer, arrow
/// keys to pan, `+`/`-` to zoom and `0` to fit. The arithmetic is all
/// `web/src/catalogue/mapView.ts`; this only turns events into cameras.
///
/// The behaviour is lifted from `web/src/catalogue/map.ts`, which already does exactly this for
/// the Catalogue placement map, but without that module's element ids or module-level view
/// state: the caller owns the camera and the redraw. Deliberately not a refactor of
/// `catalogue/map.ts`, which #415 deletes outright once the Atlas absorbs its map.

const BUTTON_ZOOM = 1.5;
const KEY_PAN = 0.1;
/// Css pixels of movement before a press becomes a drag rather than a pick.
const DRAG_THRESHOLD = 4;

export interface CameraFrame {
  readonly aspect: number;
  readonly height: number;
  readonly width: number;
}

export interface CameraSurface {
  /// The camera a gesture starts from and the fit that bounds it; null while there is nothing
  /// to look at, which disables every gesture.
  readonly camera: () => {
    readonly fit: MapView;
    readonly view: MapView;
  } | null;
  readonly element: HTMLElement;
  readonly frame: () => CameraFrame;
  /// A press that never became a drag, in css pixels within the element.
  readonly onPick: (x: number, y: number) => void;
  /// Every camera the gestures produce.
  readonly onView: (view: MapView) => void;
}

export interface CameraControls {
  readonly fit: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
}

export const mountCamera = (surface: CameraSurface): CameraControls => {
  const { element } = surface;
  const at = (event: { clientX: number; clientY: number }) => {
    const rect = element.getBoundingClientRect();
    return {
      u: (event.clientX - rect.left) / Math.max(rect.width, 1),
      v: (event.clientY - rect.top) / Math.max(rect.height, 1),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };
  const zoom = (factor: number, u = 0.5, v = 0.5) => {
    const camera = surface.camera();
    if (camera) {
      surface.onView(
        zoomView(camera.fit, camera.view, factor, u, v, surface.frame().aspect)
      );
    }
  };
  element.addEventListener(
    'wheel',
    event => {
      if (!surface.camera()) {
        return;
      }
      // The page must not scroll under a zoom gesture, so this listener cannot be passive.
      event.preventDefault();
      const { u, v } = at(event);
      zoom(Math.exp(-event.deltaY * 0.001), u, v);
    },
    { passive: false }
  );
  let drag: {
    moved: boolean;
    pointerId: number;
    x: number;
    y: number;
  } | null = null;
  element.addEventListener('pointerdown', event => {
    if (!surface.camera() || event.button !== 0) {
      return;
    }
    drag = {
      moved: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  });
  element.addEventListener('pointermove', event => {
    const camera = surface.camera();
    if (!drag || !camera || event.pointerId !== drag.pointerId) {
      return;
    }
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }
    if (!drag.moved) {
      // Capture only once this really is a drag, so a plain press still reads as a pick.
      element.setPointerCapture(event.pointerId);
      element.classList.add('dragging');
    }
    drag.moved = true;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const { aspect, height, width } = surface.frame();
    surface.onView(
      panView(camera.fit, camera.view, dx / width, dy / height, aspect)
    );
  });
  const release = (event: PointerEvent) => {
    element.classList.remove('dragging');
    if (!drag) {
      return;
    }
    const { moved, pointerId } = drag;
    drag = null;
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    // A drag that ends over a marker is not a pick. Nothing in the Atlas map takes pointer
    // events of its own, so unlike the Catalogue there is no click to suppress afterwards.
    if (!moved && event.type === 'pointerup') {
      const { x, y } = at(event);
      surface.onPick(x, y);
    }
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
  element.addEventListener('keydown', event => {
    const camera = surface.camera();
    if (!camera || event.altKey || event.ctrlKey || event.metaKey) {
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
      surface.onView(
        panView(camera.fit, camera.view, pan[0], pan[1], surface.frame().aspect)
      );
    } else if (event.key === '+' || event.key === '=') {
      zoom(BUTTON_ZOOM);
    } else if (event.key === '-') {
      zoom(1 / BUTTON_ZOOM);
    } else if (event.key === '0') {
      surface.onView(camera.fit);
    } else {
      return;
    }
    event.preventDefault();
  });
  return {
    fit: () => {
      const camera = surface.camera();
      if (camera) {
        surface.onView(camera.fit);
      }
    },
    zoomIn: () => zoom(BUTTON_ZOOM),
    zoomOut: () => zoom(1 / BUTTON_ZOOM)
  };
};
