import {
  readTargSystem,
  type TargSystemDocument
} from '../flyover/documents.ts';

/// Where the authored Targ System is served from: beside the Flyover documents rather than in
/// the Data Payload, because nothing in it is recovered (ADR 0042, ADR 0086).
export const TARG_SYSTEM_PATH = '/systems/targ.json';

/// Fetch and validate the Targ System, naming the document in any refusal.
export const fetchTargSystem = async (
  base: string | URL = location.href
): Promise<TargSystemDocument> => {
  const url = new URL(TARG_SYSTEM_PATH, base);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${TARG_SYSTEM_PATH} answered HTTP ${response.status}`);
  }
  try {
    return readTargSystem(await response.json());
  } catch (error) {
    throw new Error(
      `${TARG_SYSTEM_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
