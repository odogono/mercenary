import { join } from 'node:path';

import {
  resolveDocumentPath,
  type BrowserDocument
} from '../shell/documentPath.ts';

export const unsupportedMethodResponse = (
  method: string
): Response | undefined =>
  method === 'GET' || method === 'HEAD'
    ? undefined
    : new Response('method not allowed', {
        headers: { allow: 'GET, HEAD' },
        status: 405
      });

const DOCUMENT_FILES: Record<BrowserDocument, string> = {
  atlas: 'atlas.html',
  catalogue: 'catalogue.html',
  damocles: 'damocles.html',
  dion: 'dion.html',
  'first-offer': 'first-offer.html',
  flyover: 'flyover.html',
  gameplay: 'index.html',
  sounds: 'sounds.html'
};

export const documentResponse = async (
  request: Request,
  webRoot: string
): Promise<Response | undefined> => {
  const url = new URL(request.url);
  const route = resolveDocumentPath(url.pathname);
  if (route.kind === 'resource') {
    return undefined;
  }
  if (route.kind === 'redirect') {
    url.pathname = route.pathname;
    if (route.status === 302) {
      url.search = '';
    }
    return Response.redirect(url, route.status);
  }
  const name = DOCUMENT_FILES[route.document];
  const file = Bun.file(join(webRoot, name));
  const headers = { 'content-type': 'text/html; charset=utf-8' };
  return request.method === 'HEAD'
    ? new Response(null, { headers })
    : new Response(file, { headers });
};
