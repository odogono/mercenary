/// Why a Data Payload could not be loaded.
///
/// The cases mirror the kit's `Payload.LoadError` one for one, because they are the same five
/// things that can be wrong with a payload and a port that invented its own set would drift.
/// The prose differs where the platform does — a browser has no directory to be missing, it
/// has a fetch that 404s — and the `unreadable` reason is this implementation's own, since the
/// Swift text is a Swift decoder's description and no port can reproduce it.
export type LoadFailure =
  | { readonly kind: 'missingDirectory'; readonly path: string }
  | { readonly kind: 'missingFile'; readonly name: string }
  | {
      readonly kind: 'unreadable';
      readonly name: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'unsupportedSchema';
      readonly name: string;
      readonly version: number;
    }
  | { readonly kind: 'unsupportedDecoder'; readonly version: number };

const EXPORT_HINT =
  'Export one with:\n' +
  '  research/c64-reference-build/lab payload export \\\n' +
  '    --dataset research/c64-reference-build/work/<geometry-dataset> --output payload';

export const describeFailure = (failure: LoadFailure): string => {
  switch (failure.kind) {
    case 'missingDirectory':
      return `No Data Payload at ${failure.path}. ${EXPORT_HINT}`;
    case 'missingFile':
      return `Data Payload is missing ${failure.name}.`;
    case 'unreadable':
      return `Could not read ${failure.name} from the Data Payload: ${failure.reason}`;
    case 'unsupportedSchema':
      return `Data Payload ${failure.name} declares unsupported schemaVersion ${failure.version}.`;
    case 'unsupportedDecoder':
      return (
        `Data Payload was extracted with geometry decoder ${failure.version}; ` +
        're-extract and export it.'
      );
  }
};

/// Thrown rather than returned, so a caller that ignores the possibility fails loudly.
export class PayloadError extends Error {
  readonly failure: LoadFailure;

  constructor(failure: LoadFailure) {
    super(describeFailure(failure));
    this.name = 'PayloadError';
    this.failure = failure;
  }
}

export const fail = (failure: LoadFailure): never => {
  throw new PayloadError(failure);
};
