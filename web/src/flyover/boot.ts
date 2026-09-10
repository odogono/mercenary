import { assertBrowserDocument, type SystemId } from '../shell/documentPath.ts';
import { readFlyoverPresentation, readGammaSystem } from './documents.ts';

const TARG_BODY_IDS = ['targ', 'sun', 'inner-moon', 'outer-moon'] as const;

const title = document.getElementById('title')!;
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;

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

const authorityFor = async (systemId: SystemId): Promise<readonly string[]> => {
  if (systemId === 'targ') {
    return TARG_BODY_IDS;
  }
  const authorityPath = '/payload/damocles/system.json';
  try {
    const authority = readGammaSystem(await requiredJson(authorityPath));
    return authority.bodies
      .filter(body => body.positionKind === undefined)
      .map(body => body.id);
  } catch (error) {
    throw new Error(
      `${authorityPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

try {
  const route = assertBrowserDocument(location.pathname, 'flyover');
  const presentationPath = `/flyover/${route.systemId}.json`;
  const bodyIds = await authorityFor(route.systemId);
  try {
    readFlyoverPresentation(
      await requiredJson(presentationPath),
      route.systemId,
      bodyIds
    );
  } catch (error) {
    throw new Error(
      `${presentationPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  title.textContent = `${route.systemId.toUpperCase()} Flyover`;
  document.documentElement.dataset['system'] = route.systemId;
  status.textContent = 'Flyover renderer is not yet available.';
} catch (error) {
  status.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
}
