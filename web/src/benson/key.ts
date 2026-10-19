/// A key a Benson Script can test for. The Reference Build's prompts only ever offer a yes
/// key and time out otherwise.
export const BensonKey = {
  y: 'keyY'
} as const;

export type BensonKey = (typeof BensonKey)[keyof typeof BensonKey];

export const bensonKeyCode = (key: BensonKey): number => {
  switch (key) {
    case BensonKey.y:
      return 0x19;
  }
};

export const parseBensonKey = (name: string): BensonKey | undefined => {
  if (name === BensonKey.y) {
    return BensonKey.y;
  }
  return undefined;
};
