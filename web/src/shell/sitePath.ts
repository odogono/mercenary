/// Where the app is served from, so one set of root-relative paths works both on the
/// development server (at `/`) and on the Published Site (at `/mercenary/`).
///
/// This module is served at `<base>src/shell/sitePath.{ts,js}`, so its own URL names the
/// base: no build-time setting is needed, and a worker or worklet that imports it agrees with
/// the page. Off HTTP — under `bun test` — the base is `/`, so paths are unchanged there.
///
/// The Published Site is a static export (`bun run export:site`): its modules are `.js`, so a
/// module path given here as `.ts` is renamed on the way out.

const moduleUrl = new URL(import.meta.url);
const served =
  moduleUrl.protocol === 'http:' || moduleUrl.protocol === 'https:';

/// The path the site is served under, with leading and trailing slashes.
export const SITE_BASE = served ? new URL('../../', moduleUrl).pathname : '/';

const exported = served && moduleUrl.pathname.endsWith('.js');

/// The served path of a root-relative app path such as `/payload/sound.json`.
export const sitePath = (path: string): string => {
  if (!path.startsWith('/')) {
    throw new Error(`site paths are root-relative: ${path}`);
  }
  const renamed =
    exported && path.startsWith('/src/') && path.endsWith('.ts')
      ? `${path.slice(0, -'.ts'.length)}.js`
      : path;
  return SITE_BASE + renamed.slice(1);
};

/// The app path of a served pathname: the inverse of `sitePath` for a document. A static host
/// serves a document's folder with a trailing slash, which the app's paths never carry.
export const appPathname = (pathname: string): string => {
  const inside = pathname.startsWith(SITE_BASE)
    ? `/${pathname.slice(SITE_BASE.length)}`
    : pathname;
  const page = inside.endsWith('/index.html')
    ? inside.slice(0, -'index.html'.length)
    : inside;
  return page.length > 1 && page.endsWith('/') ? page.slice(0, -1) : page;
};
