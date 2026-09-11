import '../shell/damoclesPanelElement.ts';

import { FixedStepClock } from '../shell/clock.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { BrowserControlProfile } from '../shell/input.ts';
import { installPanel, installPanelScale } from '../shell/panelView.ts';
import { installSuspensionHandlers } from '../shell/suspension.ts';
import {
  applyTypeface,
  loadTypography,
  readTypefacePreference
} from '../shell/typography.ts';
import { planErisFrame } from './frame.ts';
import { damoclesPanelViewModel } from './panel.ts';
import { ErisRenderer } from './renderer.ts';
import { writeDamoclesResume } from './resume.ts';
import { damoclesTitle, restoreFor } from './title.ts';

/// The Damocles Gameplay Session's document (ADR 0043).
///
/// Templated on the Flyover's boot rather than Targ's: one canvas, one panel, one loop. There
/// is no Departure, Arrival, Benson, sound, console or System Menu here yet; each arrives with
/// the evidence that gives it something to show. Nothing of Targ's boot is imported, so this
/// path loads none of Targ's Data Payload (ADR 0041).

const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;
const canvas = document.getElementById('frame') as HTMLCanvasElement;
const panelSection = document.getElementById('panel')!;
const panelScale = document.getElementById('panel-scale')!;
const panelRoot = document.getElementById('panel-damocles')!;
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

let animation: number | undefined;
let running = true;

const fail = (error: unknown): void => {
  if (!running) {
    return;
  }
  running = false;
  if (animation !== undefined) {
    cancelAnimationFrame(animation);
  }
  canvas.hidden = true;
  panelSection.hidden = true;
  status.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
};

try {
  assertBrowserDocument(location.pathname, 'damocles');
  document.documentElement.dataset['title'] = damoclesTitle.slug;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const [content] = await Promise.all([
    damoclesTitle.load(requiredJson),
    loadTypography()
  ]);
  applyTypeface(document.documentElement, readTypefacePreference(storage));
  panelRoot.dataset['rendition'] = 'damocles';

  const session = damoclesTitle.create(content, restoreFor(storage));
  const renderer = new ErisRenderer(
    canvas,
    { cullBackFaces: content.doc.rendering.cullBackFaces },
    () =>
      fail(
        new Error(
          'The graphics context was lost. Reload the page to restore Damocles.'
        )
      )
  );
  canvas.hidden = false;
  panelSection.hidden = false;
  installPanelScale(panelSection, panelScale, (target, onResize) => {
    new ResizeObserver(onResize).observe(target);
  });
  const panel = installPanel(panelElements);

  // Damocles's confirmed bindings beyond walking (take, board, leave, speed) have nothing to
  // act on in this slice, so the profile's Semantic Actions are inert and only Movement
  // Intent is read.
  const controls = new BrowserControlProfile({
    drop: () => undefined,
    fire: () => undefined,
    leaveCraft: () => undefined,
    occupancy: () => ({ kind: 'onFoot' }),
    page: () => undefined,
    press: () => undefined,
    reach: () => undefined,
    rideLift: () => undefined,
    shutThrottle: () => undefined,
    skipMessage: () => undefined,
    throttleNotchValue: () => undefined,
    throttleStep: () => undefined
  });
  window.addEventListener('keydown', event => {
    if (controls.keyDown(event)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', event => {
    if (controls.keyUp(event)) {
      event.preventDefault();
    }
  });
  const clock = new FixedStepClock();
  const saveResume = (): void => {
    writeDamoclesResume(storage, session.captureResume());
  };
  installSuspensionHandlers(window, document, () => {
    controls.releaseAll();
    clock.reset();
    saveResume();
  });
  window.addEventListener('pagehide', saveResume);

  let snapshot = session.snapshot;
  const expose = (triangles: number): void => {
    const root = canvas.dataset;
    root['cell'] = `${snapshot.cell.x}-${snapshot.cell.z}`;
    root['x'] = String(snapshot.pose.position.x);
    root['z'] = String(snapshot.pose.position.z);
    root['heading'] = String(snapshot.pose.heading);
    root['triangles'] = String(triangles);
    root['unresolved'] = String(content.surface.unresolvedCount);
  };
  const draw = (): void => {
    const plan = planErisFrame(content.surface, snapshot.pose, content.doc);
    renderer.render(plan);
    panel.draw(
      damoclesPanelViewModel(
        snapshot,
        content.doc,
        session.intent.walk !== 0 || session.intent.turn !== 0
      )
    );
    expose(plan.triangleCount);
  };
  draw();
  status.hidden = true;
  canvas.dataset['state'] = 'ready';
  let sinceResume = 0;
  const frame = (timestamp: number): void => {
    if (!running) {
      return;
    }
    try {
      const steps = clock.frame(timestamp, seconds => {
        session.intent = controls.intent;
        snapshot = session.advance(seconds);
        sinceResume += seconds;
      });
      if (steps > 0) {
        draw();
      }
      if (sinceResume >= 5) {
        sinceResume = 0;
        saveResume();
      }
      animation = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  };
  animation = requestAnimationFrame(frame);
} catch (error) {
  fail(error);
}
