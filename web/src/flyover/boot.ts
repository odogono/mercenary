import { loadSettings } from '../settings/index.ts';

import '../shell/damoclesPanelElement.ts';

import { assertBrowserDocument, type SystemId } from '../shell/documentPath.ts';
import { installPanel, installPanelScale } from '../shell/panelView.ts';
import {
  advanceFlyoverCamera,
  bodyEntryPose,
  cappedFrameSeconds,
  nearestFlyoverBody,
  parseBodyQuery,
  type FlyoverCameraState
} from './camera.ts';
import { flyoverPanelViewModel } from './dashboard.ts';
import {
  readFlyoverPresentation,
  readGammaSystem,
  type TargPresentationDocument
} from './documents.ts';
import { FlyoverKeyboard } from './input.ts';
import { FlyoverRenderer } from './renderer.ts';
import { resetFlyover } from './runtime.ts';
import {
  composeGammaSystem,
  composeTargSystem,
  type FlyoverSystem
} from './system.ts';

const TARG_BODY_IDS = ['targ', 'sun', 'inner-moon', 'outer-moon'] as const;

const title = document.getElementById('title')!;
const status = document.getElementById('status')!;
const notice = document.getElementById('notice')!;
const failure = document.getElementById('failure')!;
const canvas = document.getElementById('flyover') as HTMLCanvasElement;
const dashboard = document.getElementById('flyover-dashboard')!;
const panelRoot = document.getElementById('panel-damocles')!;
const panelScale = document.getElementById('flyover-panel-scale')!;
const panelElements = {
  damoclesCompass: document.getElementById(
    'damocles-compass-canvas'
  ) as HTMLCanvasElement,
  damoclesElevation: document.getElementById(
    'damocles-elevation-canvas'
  ) as HTMLCanvasElement,
  fields: panelRoot.querySelectorAll<HTMLElement>('[data-field]'),
  lamps: panelRoot.querySelectorAll<HTMLElement>('[data-lamp]'),
  root: panelRoot
};

const requiredText = async (pathname: string): Promise<string> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  return await response.text();
};

const requiredJson = async (pathname: string): Promise<unknown> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      `${pathname} is not JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const systemFor = async (systemId: SystemId): Promise<FlyoverSystem> => {
  const presentationPath = `/flyover/${systemId}.json`;
  if (systemId === 'targ') {
    const [rawPresentation, settingsText] = await Promise.all([
      requiredJson(presentationPath),
      requiredText('/settings.json')
    ]);
    let presentation: TargPresentationDocument;
    try {
      presentation = readFlyoverPresentation(
        rawPresentation,
        'targ',
        TARG_BODY_IDS
      );
    } catch (error) {
      throw new Error(
        `${presentationPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return composeTargSystem(
      presentation,
      loadSettings(settingsText).presentation.sky
    );
  }
  const authorityPath = '/payload/damocles/system.json';
  const rawAuthority = await requiredJson(authorityPath);
  let authority: ReturnType<typeof readGammaSystem>;
  try {
    authority = readGammaSystem(rawAuthority);
  } catch (error) {
    throw new Error(
      `${authorityPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const rawPresentation = await requiredJson(presentationPath);
  try {
    const presentation = readFlyoverPresentation(
      rawPresentation,
      'gamma',
      authority.bodies
        .filter(body => body.positionKind === undefined)
        .map(body => body.id)
    );
    return composeGammaSystem(authority, presentation);
  } catch (error) {
    throw new Error(
      `${presentationPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

let animation: number | undefined;
let keyboard: FlyoverKeyboard | undefined;
let running = true;

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
  keyboard?.dispose();
  canvas.hidden = true;
  dashboard.hidden = true;
  status.hidden = true;
  notice.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
};

try {
  const route = assertBrowserDocument(location.pathname, 'flyover');
  const system = await systemFor(route.systemId);
  // Reveal before measuring and drawing. This all happens in one task, so a failed
  // constructor is hidden again before the browser can paint a partial Flyover.
  canvas.hidden = false;
  const reset = resetFlyover(system, {
    height: Math.max(1, canvas.clientHeight),
    width: Math.max(1, canvas.clientWidth)
  });
  const initialBodies = reset.bodies;
  document.documentElement.dataset['bodyCount'] = String(initialBodies.length);
  title.textContent = `${system.systemId.toUpperCase()} Flyover`;
  document.documentElement.dataset['system'] = system.systemId;
  const query = parseBodyQuery(location.search, initialBodies);
  if ('notice' in query) {
    notice.textContent = query.notice;
    notice.hidden = false;
  }
  let camera: FlyoverCameraState = {
    ...reset.camera,
    ...('body' in query ? { pose: bodyEntryPose(query.body) } : {})
  };
  let outwardDirections = {};
  const renderer = new FlyoverRenderer(canvas, system, () =>
    fail(
      new Error(
        'The graphics context was lost. Reload the page to restore the Flyover.'
      )
    )
  );
  dashboard.hidden = false;
  installPanelScale(dashboard, panelScale, (target, onResize) => {
    new ResizeObserver(onResize).observe(target);
  });
  const panel = installPanel(panelElements);
  keyboard = new FlyoverKeyboard(
    () => camera.speedNotch,
    speedNotch => {
      camera = { ...camera, speedNotch };
    }
  );
  const expose = (bodies: ReturnType<typeof system.bodiesAt>): void => {
    const nearest = nearestFlyoverBody(
      camera.pose.position,
      bodies,
      outwardDirections
    );
    outwardDirections = nearest.outwardDirections;
    panel.draw(
      flyoverPanelViewModel({
        camera,
        nearestBody: nearest.body,
        range: 'orbital',
        speedBounds: system.cameraSpeed,
        systemId: system.systemId
      })
    );
    document.documentElement.dataset['nearestBody'] = nearest.body.id;
    document.documentElement.dataset['speedNotch'] = String(camera.speedNotch);
    document.documentElement.dataset['cameraX'] = String(
      camera.pose.position.x
    );
    document.documentElement.dataset['cameraY'] = String(
      camera.pose.position.y
    );
    document.documentElement.dataset['cameraZ'] = String(
      camera.pose.position.z
    );
    document.documentElement.dataset['heading'] = String(camera.pose.heading);
    document.documentElement.dataset['pitch'] = String(camera.pose.pitch);
  };
  renderer.draw(initialBodies, camera.pose);
  expose(initialBodies);
  status.hidden = true;
  document.documentElement.dataset['flyoverReady'] = 'true';
  let previousTimestamp: number | undefined;
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      const seconds =
        previousTimestamp === undefined
          ? 0
          : cappedFrameSeconds((timestamp - previousTimestamp) / 1000);
      previousTimestamp = timestamp;
      camera = advanceFlyoverCamera(
        camera,
        keyboard!.controls(),
        seconds,
        system.cameraSpeed
      );
      const elapsed =
        system.systemId === 'targ' ? system.clock.elapsedSeconds() : 0;
      const bodies = system.bodiesAt(elapsed);
      renderer.draw(bodies, camera.pose);
      expose(bodies);
      animation = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  };
  animation = requestAnimationFrame(frame);
} catch (error) {
  fail(error);
}
