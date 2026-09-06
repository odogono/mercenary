const SECONDS_PER_DAY = 86_400;

export const TARG_EPOCH_HOUR = 9;

export type TargTimeSeparator = ':' | '-';

const wrappedSeconds = (seconds: number): number =>
  ((seconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;

/// Read the canonical Targ clock syntax accepted by the Shell Console.
export const parseTargTime = (value: string): number => {
  const match = /^(\d{1,2})([:-])(\d{2})(?:\2(\d{2}))?$/.exec(value);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[3]);
  const second = Number(match?.[4] ?? 0);
  if (match === null || hour > 23 || minute > 59 || second > 59) {
    throw new Error(
      `a time must be H:MM or H:MM:SS from 0:00:00 through 23:59:59, and is '${value}'`
    );
  }
  return hour * 3600 + minute * 60 + second;
};

/// Write one Targ-local clock reading for either Browser Shell surface.
export const formatTargTime = (
  secondsOfDay: number,
  separator: TargTimeSeparator = ':'
): string => {
  // Clock conversion crosses binary fractions. Remove sub-nanosecond residue so a time just set
  // to 00:00:01 does not read back as 00:00:00.
  const seconds =
    Math.floor(wrappedSeconds(secondsOfDay) + 1e-9) % SECONDS_PER_DAY;
  const digits = (part: number): string =>
    String(Math.trunc(part)).padStart(2, '0');
  return [
    digits(seconds / 3600),
    digits((seconds % 3600) / 60),
    digits(seconds % 60)
  ].join(separator);
};

const secondsOfDayAt = (elapsed: number, dayLengthMinutes: number): number =>
  wrappedSeconds(
    (elapsed / (dayLengthMinutes * 60)) * SECONDS_PER_DAY +
      TARG_EPOCH_HOUR * 3600
  );

const elapsedAtTime = (
  elapsed: number,
  secondsOfDay: number,
  dayLengthMinutes: number
): number => {
  const dayLength = dayLengthMinutes * 60;
  const day = Math.floor(elapsed / dayLength);
  const secondsFromEpoch = wrappedSeconds(
    secondsOfDay - TARG_EPOCH_HOUR * 3600
  );
  return day * dayLength + (secondsFromEpoch / SECONDS_PER_DAY) * dayLength;
};

/// A Browser Shell adjustment to the Orrery clock, kept outside Session State.
export class TargPresentationClock {
  private offset = 0;

  constructor(private readonly dayLengthMinutes: () => number) {}

  elapsed(sessionElapsed: number): number {
    return sessionElapsed + this.offset;
  }

  secondsOfDay(sessionElapsed: number): number {
    return secondsOfDayAt(
      this.elapsed(sessionElapsed),
      this.dayLengthMinutes()
    );
  }

  set(sessionElapsed: number, secondsOfDay: number): void {
    const current = this.elapsed(sessionElapsed);
    this.offset +=
      elapsedAtTime(current, secondsOfDay, this.dayLengthMinutes()) - current;
  }

  reset(): void {
    this.offset = 0;
  }
}
