/// The Talk Scripts' part of a Save (ADR 0080), owned here: the Save codec
/// carries it without knowing what is inside (#933).

/// The NorthTalk save, held apart from the Save's general string limit.
export const TALK_SAVE_CODE_UNIT_LIMIT = 262_144;

export interface TalkSaveSnapshot {
  /// The prompts holding Player Input, oldest first.
  readonly claims: readonly { readonly run: string; readonly script: string }[];
  /// The NorthTalk Group's save, in base64. It carries each Talk Script's own
  /// identity, which NorthTalk checks on restore.
  readonly group: string;
  /// The host clock, in seconds.
  readonly now: number;
}

/// A Save whose Talk Scripts can't be brought back in this build. Like an
/// outdated schema, it is refused rather than restored without its story.
export class TalkSaveRefused extends Error {
  constructor(reason: string) {
    super(
      `its story no longer loads in this version (${reason}); start a New Game`
    );
    this.name = 'TalkSaveRefused';
  }
}

const BASE64 = /^[\d+/A-Za-z]*={0,2}$/;

const fail = (message: string): never => {
  throw new Error(message);
};

const fields = (
  value: unknown,
  at: string,
  names: readonly string[]
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${at} must be an object`);
  }
  const out = value as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (!names.includes(key)) {
      fail(`${at} has unexpected field ${key}`);
    }
  }
  for (const key of names) {
    if (!(key in out)) {
      fail(`${at} is missing field ${key}`);
    }
  }
  return out;
};

const text = (value: unknown, at: string): string =>
  typeof value === 'string' ? value : fail(`${at} must be a string`);

/// Reads the Talk part of a decoded Save, throwing on anything it can't be.
export const parseTalkSave = (value: unknown, at: string): TalkSaveSnapshot => {
  const out = fields(value, at, ['claims', 'group', 'now']);
  const group = text(out['group'], `${at}.group`);
  if (group.length > TALK_SAVE_CODE_UNIT_LIMIT) {
    fail(`${at}.group exceeds the Talk Script save limit`);
  }
  if (group.length % 4 !== 0 || !BASE64.test(group)) {
    fail(`${at}.group must be base64`);
  }
  const now = out['now'];
  if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) {
    fail(`${at}.now must be a non-negative number`);
  }
  const claims = out['claims'];
  if (!Array.isArray(claims)) {
    return fail(`${at}.claims must be an array`);
  }
  return {
    claims: claims.map((entry: unknown, index) => {
      const claim = fields(entry, `${at}.claims[${index}]`, ['run', 'script']);
      return {
        run: text(claim['run'], `${at}.claims[${index}].run`),
        script: text(claim['script'], `${at}.claims[${index}].script`)
      };
    }),
    group,
    now: now as number
  };
};
