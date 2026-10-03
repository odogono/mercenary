import type { CraftBody } from '../craft/types.ts';

/// The Damocles Script trigger a landing on the Body at `offset` queues (`$054770`), `body +
/// $1F`; ERIS (`$2C`) and DAMOCLES, the comet (`$74`), have none.
export const landingTrigger = (offset: number): number | null =>
  offset === 0x2c || offset === 0x74 ? null : offset / 4 + 0x1f;

/// Whether a landing can reach the Body `bodyId`: one in the range scan's table but DIALIS,
/// offset 0, which `$052FDA` never arrives at.
export const landsOn = (
  catalogue: {
    readonly craft: { readonly bodies: readonly CraftBody[] } | null;
  },
  bodyId: string
): boolean => {
  const index = Number(/^body-(\d+)$/.exec(bodyId)?.[1] ?? -1);
  return index >= 1 && index < (catalogue.craft?.bodies.length ?? 0);
};
