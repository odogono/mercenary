import type { GameplaySession } from '../../src/session/index.ts';
import { type Trace, type TraceObject } from '../../src/trace/index.ts';
import { applySessionTraceCommand } from '../../src/trace/session.ts';
import {
  gameplaySessionGate,
  type GameplaySessionGateContext,
  type GameplaySessionTraceSet
} from './gameplaySessionGate.ts';

const sessionFor = (
  context: GameplaySessionGateContext,
  trace: Trace
): GameplaySession => {
  const scenario = trace.header['scenario'] as TraceObject;
  const timeScale = scenario['timeScale'];
  const session = context.createSession(
    typeof timeScale === 'number' ? { timeScale } : undefined
  );
  const script = scenario['script'] as number;
  if (!session.start(script)) {
    throw new Error(`script ${script} would not start`);
  }
  return session;
};

export const sessionGate = (gate: GameplaySessionTraceSet): Promise<void> =>
  gameplaySessionGate({
    ...gate,
    applyCommand: applySessionTraceCommand,
    createSession: sessionFor,
    emitter: 'session',
    prepareSteps: (session, trace) => {
      const scenario = trace.header['scenario'] as TraceObject;
      const walkTo = scenario['walkTo'];
      const take = scenario['take'] === true;
      if (typeof walkTo !== 'number') {
        return undefined;
      }
      let reached = false;
      return () => {
        if (reached) {
          return;
        }
        const { outcome } = session.reach(take ? 'take' : 'board', walkTo);
        if (outcome.kind !== 'nothingInReach') {
          reached = true;
        }
      };
    }
  });
