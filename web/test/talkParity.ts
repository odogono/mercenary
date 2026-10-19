import { TALK_SCRIPTS } from '../src/talk/scripts.ts';
import { LegalRoute } from './legalCheckpoint.ts';

/// Plays a ported Benson Script and its Talk Script side by side (ADR 0080):
/// the Benson Script is the oracle, and a port shows the same lines.

export type Engine = 'benson' | 'talk';
export const ENGINES: readonly Engine[] = ['benson', 'talk'];

/// The named Talk Script alone, as `useTalkScripts` takes it.
export const talkScript = (name: string) =>
  TALK_SCRIPTS.filter(script => script.name === name);

/// A fresh route, with the named Talk Script in place of its Benson Scripts
/// when the engine is Talk.
export const openRoute = async (
  engine: Engine,
  name: string
): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  if (engine === 'talk') {
    route.session.useTalkScripts(talkScript(name));
  }
  return route;
};

/// Each Benson Message as it completes, blank lines included.
export class Lines {
  readonly lines: string[] = [];
  private recorded: object | undefined;

  constructor(readonly route: LegalRoute) {}

  advance(seconds: number): this {
    for (let quarter = 0; quarter < seconds * 4; quarter++) {
      this.route.advance(0.25);
      const message = this.route.session.snapshot.bensonMessage;
      if (
        message?.completedText !== undefined &&
        message.occurrence !== this.recorded
      ) {
        this.lines.push(message.completedText.trim());
        this.recorded = message.occurrence;
      }
    }
    return this;
  }

  /// Advances until the line has completed.
  until(line: string, limit = 120): this {
    for (let left = limit; !this.lines.includes(line); left -= 0.25) {
      if (left <= 0) {
        throw new Error(
          `no '${line}' in ${limit} s: ${this.lines.join(' / ')}`
        );
      }
      this.advance(0.25);
    }
    return this;
  }
}
