import {
  parseDamoclesDocuments,
  type DamoclesDocuments
} from '../src/damocles/documentBank.ts';

/// The tracked documents the Head Commands read, parsed for the suites that build
/// `DamoclesContent` by hand (#598).
export const damoclesDocuments = async (): Promise<DamoclesDocuments> =>
  parseDamoclesDocuments(
    await Bun.file('../payload/damocles/documents.json').json()
  );
