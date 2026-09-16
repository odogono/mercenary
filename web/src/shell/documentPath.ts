export type SystemId = 'gamma' | 'targ';
export type BrowserDocument =
  'catalogue' | 'damocles' | 'first-offer' | 'flyover' | 'gameplay';

export type DocumentPath =
  | { readonly document: 'first-offer'; readonly kind: 'document' }
  | { readonly document: 'gameplay'; readonly kind: 'document' }
  | { readonly document: 'catalogue'; readonly kind: 'document' }
  | { readonly document: 'damocles'; readonly kind: 'document' }
  | {
      readonly document: 'flyover';
      readonly kind: 'document';
      readonly systemId: SystemId;
    }
  | {
      readonly kind: 'redirect';
      readonly pathname: string;
      readonly status: 302 | 308;
    }
  | { readonly kind: 'resource' };

const documents = new Map<string, DocumentPath>([
  ['/', { document: 'gameplay', kind: 'document' }],
  // A Title's path starts its game (ADR 0041). `/targ` is the same document as `/` until
  // Targ adopts the Title seam; `/damocles` is the Damocles Gameplay Session (ADR 0043).
  ['/targ', { document: 'gameplay', kind: 'document' }],
  ['/damocles', { document: 'damocles', kind: 'document' }],
  ['/damocles/first-offer', { document: 'first-offer', kind: 'document' }],
  ['/catalogue', { document: 'catalogue', kind: 'document' }],
  ['/targ/debug', { document: 'flyover', kind: 'document', systemId: 'targ' }],
  [
    '/damocles/debug',
    { document: 'flyover', kind: 'document', systemId: 'gamma' }
  ]
]);

const aliases = new Map<string, string>([
  ['/damocles/first-offer/', '/damocles/first-offer'],
  ['/first-offer.html', '/damocles/first-offer'],
  ['/index.html', '/'],
  ['/targ/', '/targ'],
  ['/damocles/', '/damocles'],
  ['/catalogue.html', '/catalogue'],
  ['/catalogue/', '/catalogue'],
  ['/debug', '/targ/debug'],
  ['/debug/', '/targ/debug'],
  ['/targ/debug/', '/targ/debug'],
  ['/damocles/debug/', '/damocles/debug']
]);

const resourceNamespaces = ['/src', '/payload', '/flyover', '/e2e', '/test'];

export const resolveDocumentPath = (pathname: string): DocumentPath => {
  const document = documents.get(pathname);
  if (document !== undefined) {
    return document;
  }
  const alias = aliases.get(pathname);
  if (alias !== undefined) {
    return { kind: 'redirect', pathname: alias, status: 308 };
  }
  if (
    resourceNamespaces.some(
      namespace =>
        pathname === namespace || pathname.startsWith(`${namespace}/`)
    )
  ) {
    return { kind: 'resource' };
  }
  const leaf = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (pathname.endsWith('/') || !leaf.includes('.') || leaf.endsWith('.html')) {
    return { kind: 'redirect', pathname: '/', status: 302 };
  }
  return { kind: 'resource' };
};

export const assertBrowserDocument = <T extends BrowserDocument>(
  pathname: string,
  expected: T
): Extract<
  DocumentPath,
  { readonly document: T; readonly kind: 'document' }
> => {
  const resolved = resolveDocumentPath(pathname);
  if (resolved.kind !== 'document' || resolved.document !== expected) {
    throw new Error(`${pathname} is not the ${expected} document`);
  }
  return resolved as Extract<
    DocumentPath,
    { readonly document: T; readonly kind: 'document' }
  >;
};
