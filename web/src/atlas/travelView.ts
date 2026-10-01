import { parseDamoclesArrivalPoses } from '../damocles/poses.ts';
import type { GammaSystemDocument } from '../flyover/documents.ts';
import { STREET_SPAN, SURFACE_SPAN } from './bodyRange.ts';
import { project, unproject, type MapView } from './mapView.ts';
import type { AtlasPin, AtlasState } from './state.ts';
import { catalogueBodyId, wrapImages } from './surface.ts';
import { browserAtlasHandoff } from './travel.ts';

const wrap = (value: number) =>
  ((value % SURFACE_SPAN) + SURFACE_SPAN) % SURFACE_SPAN;

/// Pin controls stay independent of feature selection and its details panel.
export const installAtlasTravel = (options: {
  readonly go: (state: AtlasState) => void;
  readonly pick: (x: number, y: number) => void;
  readonly state: () => AtlasState;
  readonly system: () => GammaSystemDocument | undefined;
}) => {
  const node = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const marker = node<HTMLButtonElement>('atlas-pin');
  const playerMarker = node<HTMLElement>('atlas-player');
  const travel = node<HTMLButtonElement>('travel-here');
  const menu = node<HTMLElement>('pin-menu');
  const menuTravel = node<HTMLButtonElement>('pin-menu-travel');
  const message = node<HTMLElement>('pin-status');
  const coordinates = node<HTMLElement>('pin-coordinates');
  const recenter = node<HTMLButtonElement>('recenter-player');
  const handoff = browserAtlasHandoff();
  let player = handoff.player();
  let movingPlayer = false;
  if (player?.heading !== undefined) {
    playerMarker.style.setProperty('--heading', `${player.heading}rad`);
    playerMarker.dataset['facing'] = 'known';
    const degrees = ((((player.heading * 180) / Math.PI) % 360) + 360) % 360;
    playerMarker.setAttribute(
      'aria-label',
      `Player position when play paused. Facing ${Math.round(degrees)} degrees clockwise from north.`
    );
  }
  let playable: ReadonlySet<string> | undefined;
  let loadFailure = '';
  let selectionKey = '';
  let cameraKey = '';

  const focusPin = () => {
    if (!marker.hidden) {
      marker.focus();
    }
  };
  const closeMenu = () => {
    const focused = menu.contains(document.activeElement);
    menu.hidden = true;
    marker.setAttribute('aria-expanded', 'false');
    if (focused) {
      focusPin();
    }
  };
  const openMenu = () => {
    if (marker.hidden) {
      return;
    }
    menu.hidden = false;
    marker.setAttribute('aria-expanded', 'true');
    const range = marker.parentElement!;
    menu.style.left = `${Math.max(8, Math.min(marker.offsetLeft + 16, range.clientWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(marker.offsetTop + 16, range.clientHeight - menu.offsetHeight - 8))}px`;
    menuTravel.focus();
  };
  marker.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    openMenu();
  });
  marker.addEventListener('click', event => {
    if (event.detail === 0) {
      openMenu();
    } else {
      const frame = marker.parentElement!.getBoundingClientRect();
      options.pick(event.clientX - frame.x, event.clientY - frame.y);
    }
  });
  menu.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      menuTravel.focus();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (
      !menu.contains(event.target as Node) &&
      !marker.contains(event.target as Node)
    ) {
      closeMenu();
    }
  });
  document.addEventListener('focusin', event => {
    if (
      !menu.contains(event.target as Node) &&
      !marker.contains(event.target as Node)
    ) {
      closeMenu();
    }
  });

  const showPoint = (point: AtlasPin) =>
    options.go({
      bodyId: point.bodyId,
      instanceId: null,
      islandId: null,
      level: 'body',
      placeId: null,
      view: { span: STREET_SPAN, x: point.x, z: point.z }
    });
  recenter.hidden = player === null;
  recenter.addEventListener('click', () => {
    if (player) {
      showPoint(player);
    }
  });
  node<HTMLButtonElement>('show-pin').addEventListener('click', () => {
    const pin = options.state().pin;
    if (pin) {
      showPoint(pin);
    }
  });
  const requestTravel = (pin = options.state().pin) => {
    const body = options.system()?.bodies.find(item => item.id === pin?.bodyId);
    if (!pin || !body || !playable?.has(catalogueBodyId(body.sourceIndex))) {
      message.textContent =
        loadFailure ||
        'Travel is not available yet. Wait for the map to finish loading and try again.';
      return;
    }
    try {
      const token = handoff.request({
        ...pin,
        bodyId: catalogueBodyId(body.sourceIndex)
      });
      travel.disabled = true;
      menuTravel.disabled = true;
      location.assign(`/damocles?atlasTravel=${encodeURIComponent(token)}`);
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
  travel.addEventListener('click', () => requestTravel());
  menuTravel.addEventListener('click', () => requestTravel());

  let camera:
    | { bodyId: string; height: number; view: MapView; width: number }
    | undefined;
  let drag:
    | {
        left: number;
        moved: boolean;
        pointerId: number;
        top: number;
        x: number;
        y: number;
      }
    | undefined;
  const restorePlayer = () => {
    if (camera) {
      position(
        playerMarker,
        player,
        camera.bodyId,
        camera.view,
        camera.width,
        camera.height
      );
    }
  };
  const cancelDrag = () => {
    const active = drag;
    drag = undefined;
    playerMarker.classList.remove('dragging');
    if (active && playerMarker.hasPointerCapture(active.pointerId)) {
      playerMarker.releasePointerCapture(active.pointerId);
    }
    restorePlayer();
  };
  playerMarker.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !camera || !player || movingPlayer) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    drag = {
      left: Number.parseFloat(playerMarker.style.left),
      moved: false,
      pointerId: event.pointerId,
      top: Number.parseFloat(playerMarker.style.top),
      x: event.clientX,
      y: event.clientY
    };
    playerMarker.setPointerCapture(event.pointerId);
  });
  playerMarker.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) {
      return;
    }
    drag.moved = true;
    playerMarker.classList.add('dragging');
    playerMarker.style.left = `${drag.left + dx}px`;
    playerMarker.style.top = `${drag.top + dy}px`;
  });
  playerMarker.addEventListener('pointerup', event => {
    if (!drag || drag.pointerId !== event.pointerId || !camera) {
      return;
    }
    event.stopPropagation();
    const active = drag;
    const frame = playerMarker.parentElement!.getBoundingClientRect();
    const x =
      active.left +
      event.clientX -
      active.x +
      playerMarker.parentElement!.clientLeft;
    const y =
      active.top +
      event.clientY -
      active.y +
      playerMarker.parentElement!.clientTop;
    cancelDrag();
    if (
      !active.moved ||
      event.clientX < frame.left ||
      event.clientX > frame.right ||
      event.clientY < frame.top ||
      event.clientY > frame.bottom
    ) {
      return;
    }
    const point = unproject(
      camera.view,
      x / camera.width,
      y / camera.height,
      camera.height / camera.width
    );
    void movePlayer({
      bodyId: camera.bodyId,
      x: wrap(point.x),
      z: wrap(point.z)
    });
  });
  playerMarker.addEventListener('pointercancel', cancelDrag);
  playerMarker.addEventListener('lostpointercapture', cancelDrag);
  document.addEventListener(
    'keydown',
    event => {
      if (drag && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelDrag();
      }
    },
    true
  );

  const movePlayer = async (target: AtlasPin) => {
    const body = options
      .system()
      ?.bodies.find(item => item.id === target.bodyId);
    if (!body || movingPlayer) {
      return;
    }
    movingPlayer = true;
    playerMarker.setAttribute('aria-busy', 'true');
    message.textContent = 'Updating player position…';
    try {
      const { movePausedPlayer } = await import('../damocles/atlasMove.ts');
      const moved = await movePausedPlayer({
        ...target,
        bodyId: catalogueBodyId(body.sourceIndex)
      });
      player = { ...moved, bodyId: target.bodyId };
      restorePlayer();
      message.textContent =
        'Player position updated. Return to Game when you’re ready.';
      try {
        handoff.rememberPlayer(player);
      } catch {
        message.textContent += ' The map marker could not be saved for reload.';
      }
    } catch (error) {
      message.textContent = `Player move refused: ${error instanceof Error ? error.message : String(error)}`;
      restorePlayer();
    } finally {
      movingPlayer = false;
      playerMarker.removeAttribute('aria-busy');
    }
  };

  const render = () => {
    const state = options.state();
    const key = JSON.stringify([
      state.level,
      state.level === 'body' ? state.bodyId : null,
      state.pin
    ]);
    if (key !== selectionKey) {
      closeMenu();
      selectionKey = key;
    }
    const pin = state.pin;
    const body = options.system()?.bodies.find(item => item.id === pin?.bodyId);
    coordinates.textContent = pin
      ? `${body?.name ?? pin.bodyId} · ${pin.x.toFixed(5)}, ${pin.z.toFixed(5)}`
      : 'Tap the map to place a destination pin.';
    node<HTMLButtonElement>('show-pin').disabled = !pin;
    travel.disabled =
      !body || !playable?.has(catalogueBodyId(body.sourceIndex));
    menuTravel.disabled = travel.disabled;
    message.textContent = !pin
      ? 'Instant exploration travel brings any occupied craft or seat.'
      : loadFailure ||
        (playable === undefined
          ? 'Checking playable Bodies…'
          : travel.disabled
            ? 'Travel is unavailable: this Body has no admitted arrival data.'
            : 'Arrive at ground level. The game checks the exact point before moving you.');
  };
  const position = (
    element: HTMLElement,
    point: AtlasPin | null,
    bodyId: string,
    view: MapView,
    width: number,
    height: number
  ) => {
    const image =
      point?.bodyId === bodyId
        ? wrapImages([point], view, height / Math.max(width, 1))[0]?.[0]
        : undefined;
    element.hidden = !image;
    if (!image) {
      return;
    }
    const at = project(view, image, height / Math.max(width, 1));
    element.style.left = `${at.u * width - (element.parentElement?.clientLeft ?? 0)}px`;
    element.style.top = `${at.v * height - (element.parentElement?.clientTop ?? 0)}px`;
  };
  return {
    draw: (bodyId: string, view: MapView, width: number, height: number) => {
      position(
        marker,
        options.state().pin ?? null,
        bodyId,
        view,
        width,
        height
      );
      if (
        drag &&
        cameraKey !==
          `${bodyId}|${view.cx}|${view.cz}|${view.span}|${width}|${height}`
      ) {
        cancelDrag();
      }
      camera = { bodyId, height, view, width };
      if (!drag) {
        position(playerMarker, player, bodyId, view, width, height);
      }
      const key = `${bodyId}|${view.cx}|${view.cz}|${view.span}|${width}|${height}`;
      if (key !== cameraKey) {
        closeMenu();
        cameraKey = key;
      }
    },
    load: async () => {
      try {
        const response = await fetch('/payload/damocles/arrival-poses.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        playable = new Set(
          parseDamoclesArrivalPoses(await response.json())
            .poses.filter(pose => pose.workspaceOrigin !== null)
            .map(pose => pose.body)
        );
      } catch {
        loadFailure =
          'Travel availability could not be loaded. Reload the Atlas to retry.';
      }
      render();
    },
    render
  };
};
