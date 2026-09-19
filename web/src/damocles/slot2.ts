import type { DamoclesMessageId } from './display.ts';

export const SLOT_2_SCRIPT = 'damocles.script.slot-2' as const;
export const SLOT_2_REVISION = 1;

export type ScriptId = typeof SLOT_2_SCRIPT;
export type Step =
  | 'announce-1'
  | 'announce-2'
  | 'announce-3'
  | 'call-delay'
  | 'clear-busy'
  | 'clear-line'
  | 'idle'
  | 'poll-wait'
  | 'reset-wait'
  | 'return'
  | 'return-from-delay';

export const SLOT_2_MESSAGES: Readonly<
  Partial<Record<Step, DamoclesMessageId>>
> = {
  'announce-1': 'script2-inline-1',
  'announce-2': 'script2-inline-2',
  'announce-3': 'script2-inline-3',
  'clear-line': 'system-string-50'
};
