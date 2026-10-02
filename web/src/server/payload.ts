import { join } from 'node:path';

/// The payload's only binary files, by exact path: the two typefaces and the Title Logos.
const BINARY_FILES = new Map([
  ['/payload/fonts/mercenary.woff2', 'font/woff2'],
  ['/payload/fonts/damocles.woff2', 'font/woff2'],
  ['/payload/targ-st/title.png', 'image/png'],
  ['/payload/damocles/title.png', 'image/png']
]);

/// Whether an `Accept-Encoding` header admits gzip. A `q=0` weight is a refusal, so it
/// does not count; every browser the Shell runs in sends gzip unweighted.
const acceptsGzip = (acceptEncoding: string | null): boolean =>
  acceptEncoding !== null &&
  acceptEncoding
    .split(',')
    .map(part => part.trim().toLowerCase().split(';'))
    .some(
      ([coding, ...params]) =>
        (coding === 'gzip' || coding === '*') &&
        !params.some(param => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(param))
    );

/// Serves the Data Payload. JSON documents are gzipped on the fly when the client accepts
/// it (#435): the checked-in files stay indented for review, and indentation is exactly
/// what compresses away, so the 40 MiB Damocles Catalogue crosses the wire as under 2 MiB.
/// Compression is per request rather than cached: it costs about 125 ms for the largest
/// document, and this server only ever answers one local browser.
export const payloadResponse = async (
  pathname: string,
  payload: string,
  acceptEncoding: string | null = null
): Promise<Response | undefined> => {
  if (!pathname.startsWith('/payload/')) {
    return undefined;
  }

  const binary = BINARY_FILES.get(pathname);
  if (binary !== undefined) {
    const file = Bun.file(join(payload, pathname.slice('/payload/'.length)));
    if (!(await file.exists())) {
      return new Response('not found', { status: 404 });
    }
    return new Response(file, { headers: { 'content-type': binary } });
  }

  const name = pathname.slice('/payload/'.length);
  // Lowercase hyphenated names, digits allowed, at most two directories deep.
  // Dion Catalogue geometry (#684) admits one additional exact path below; neither
  // form admits a dot or an encoded separator that could escape the payload root.
  if (
    !/^(?:[\da-z]+(?:-[\da-z]+)*\/){0,2}[\da-z]+(?:-[\da-z]+)*\.json$/.test(
      name
    ) &&
    !/^dion\/catalogue\/geometry\/(?:model|structure|detail|ground|island)-[\da-f]{6}\.json$/.test(
      name
    ) &&
    !/^dion\/tourcraft\/geometry\/(?:(?:model|structure|detail|ground|island)-[\da-f]{6}|sky-tail-0502c0)\.json$/.test(
      name
    ) &&
    !/^dion\/tourcraft\/presentation\/(?:craft|gameplay|programmes|support|system|taxi)\.json$/.test(
      name
    )
  ) {
    return new Response('not found', { status: 404 });
  }
  const file = Bun.file(join(payload, name));
  if (!(await file.exists())) {
    return new Response('not found', { status: 404 });
  }
  if (!acceptsGzip(acceptEncoding)) {
    return new Response(file, {
      headers: { 'content-type': 'application/json', vary: 'accept-encoding' }
    });
  }
  return new Response(Bun.gzipSync(await file.bytes()), {
    headers: {
      'content-encoding': 'gzip',
      'content-type': 'application/json',
      vary: 'accept-encoding'
    }
  });
};
