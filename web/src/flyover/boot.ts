import { loadSettings } from '../settings/index.ts';
import { assertBrowserDocument, type SystemId } from '../shell/documentPath.ts';
import {
  readFlyoverPresentation,
  readGammaSystem,
  type TargPresentationDocument
} from './documents.ts';
import {
  composeGammaSystem,
  composeTargSystem,
  type FlyoverSystem
} from './system.ts';

const TARG_BODY_IDS = ['targ', 'sun', 'inner-moon', 'outer-moon'] as const;

const title = document.getElementById('title')!;
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;

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

try {
  const route = assertBrowserDocument(location.pathname, 'flyover');
  const system = await systemFor(route.systemId);
  const elapsed =
    system.systemId === 'targ' ? system.clock.elapsedSeconds() : 0;
  document.documentElement.dataset['bodyCount'] = String(
    system.bodiesAt(elapsed).length
  );
  title.textContent = `${system.systemId.toUpperCase()} Flyover`;
  document.documentElement.dataset['system'] = system.systemId;
  status.textContent = 'Flyover renderer is not yet available.';
} catch (error) {
  status.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
}
