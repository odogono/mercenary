import { rm } from 'node:fs/promises';

import { ledgerDirectory } from './ledger.ts';

/// One run, one ledger: the note is written from whatever chapter ledgers the directory holds, so
/// it starts empty, and a chapter run alone leaves no other chapter's older outcomes beside it.
export default async function globalSetup(): Promise<void> {
  await rm(ledgerDirectory(), { force: true, recursive: true });
}
