import { join } from 'node:path';

const FONT_FILES = new Map([
  ['/payload/fonts/mercenary.woff2', 'fonts/mercenary.woff2'],
  ['/payload/fonts/damocles.woff2', 'fonts/damocles.woff2']
]);

export const payloadResponse = async (
  pathname: string,
  payload: string
): Promise<Response | undefined> => {
  if (!pathname.startsWith('/payload/')) {
    return undefined;
  }

  const font = FONT_FILES.get(pathname);
  if (font !== undefined) {
    const file = Bun.file(join(payload, font));
    if (!(await file.exists())) {
      return new Response('not found', { status: 404 });
    }
    return new Response(file, {
      headers: { 'content-type': 'font/woff2' }
    });
  }

  const name = pathname.slice('/payload/'.length);
  if (!/^[a-z]+(?:-[a-z]+)*\.json$/.test(name)) {
    return new Response('not found', { status: 404 });
  }
  const file = Bun.file(join(payload, name));
  if (!(await file.exists())) {
    return new Response('not found', { status: 404 });
  }
  return new Response(file, {
    headers: { 'content-type': 'application/json' }
  });
};
