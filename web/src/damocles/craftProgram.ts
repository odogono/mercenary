import type { Craft } from '../catalogue/data.ts';
import type { CraftConstants, CraftProgram } from '../craft/pass.ts';

export const craftProgram = (craft: Craft): CraftProgram => ({
  arithmetic: {
    arctan: craft.arithmetic.arctan.bytes,
    exp: craft.arithmetic.exp.words,
    octants: craft.arithmetic.octants,
    sine: craft.arithmetic.sine.longs
  },
  constants: Object.fromEntries(
    Object.entries(craft.constants).map(([name, value]) => [
      name,
      value.operand
    ])
  ) as CraftConstants,
  slots: craft.slots,
  throttleKeys: craft.throttleKeys.keys
});
