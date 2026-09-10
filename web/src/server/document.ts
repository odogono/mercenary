import { join } from 'node:path';

import { resolveDocumentPath } from '../shell/documentPath.ts';

export const unsupportedMethodResponse = (
  method: string
): Response | undefined =>
  method === 'GET' || method === 'HEAD'
    ? undefined
    : new Response('method not allowed', {
        headers: { allow: 'GET, HEAD' },
        status: 405
      });

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
  const name =
    route.document === 'gameplay'
      ? 'index.html'
      : route.document === 'catalogue'
        ? 'catalogue.html'
        : 'flyover.html';
  const file = Bun.file(join(webRoot, name));
  const headers = { 'content-type': 'text/html; charset=utf-8' };
  return request.method === 'HEAD'
    ? new Response(null, { headers })
    : new Response(file, { headers });
};
