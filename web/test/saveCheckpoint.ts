import type { ObservationValue } from '../src/session/observations.ts';

/// A Save carries no Benson Script continuation, so the oracle's running
/// script, if any, is not restored: compare what else the session observes.
export const withoutScript = (
  observations: Readonly<Record<string, ObservationValue>>
): Record<string, ObservationValue> => {
  const { scriptPc: _pc, scriptStack: _stack, ...rest } = observations;
  return rest;
};
