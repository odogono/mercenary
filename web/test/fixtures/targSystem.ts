import { readTargSystem } from '../../src/flyover/documents.ts';
import targSystemDocument from '../../systems/targ.json';

/// The authored Targ System, read through its validator as the Browser Shell reads it.
export const TARG_SYSTEM = readTargSystem(targSystemDocument);
