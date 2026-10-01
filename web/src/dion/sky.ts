import { int, ints, list, record } from './read.ts';

export interface DionSky {
  readonly clipRow: number;
  readonly colours: readonly number[];
  readonly latitude: number;
  readonly phase: number;
  readonly rate: number;
  readonly stars: readonly (readonly [number, number])[];
  readonly stepX: number;
  readonly sunAngle: number;
}
export const readDionSky = (value: unknown): DionSky => {
  const sky = record(value, 'sky');
  const stars = list(sky['stars'], 'sky.stars').map((value, index) => {
    const pair = ints(value, `sky.stars[${index}]`, 2, 0, 65_535);
    return [pair[0]!, pair[1]!] as const;
  });
  if (stars.length !== 1868) {
    throw new Error('sky.stars should hold 1868 records');
  }
  return {
    clipRow: int(sky['clipRow'], 'sky.clipRow', 68, 68),
    colours: ints(sky['colours'], 'sky.colours', 16, 0, 0x7_77),
    latitude: int(sky['latitude'], 'sky.latitude', 0, 1023),
    phase: int(sky['phase'], 'sky.phase', 0, 0xff_ff_ff_ff),
    rate: int(sky['rate'], 'sky.rate', 0x3_b0, 0x3_b0),
    stars,
    stepX: int(sky['stepX'], 'sky.stepX', 0, 1023),
    sunAngle: int(sky['sunAngle'], 'sky.sunAngle', 0, 1023)
  };
};
export const dionDay = (
  sky: Pick<DionSky, 'latitude' | 'phase' | 'stepX' | 'sunAngle'>
): boolean => {
  const longitude = (sky.stepX + (sky.phase >>> 16)) & 1023;
  return (
    ((((sky.sunAngle - longitude + 256) & 512) + sky.latitude) & 512) !== 0
  );
};
export const dionStars = (
  sky: DionSky,
  heading: number,
  pitch: number
): readonly (readonly [number, number, number])[] => {
  const scroll = Math.floor((2 * (heading & 1023) * 0xe1_0e) / 65_536);
  const word = (4 * ((pitch & 1023) - 0x1_28)) & 65_535;
  const signed = word >= 32_768 ? word - 65_536 : word;
  const vertical = Math.floor((signed * 0x6c_cc) / 65_536);
  return sky.stars.flatMap(([column, packed]) => {
    const x = column - scroll;
    const y = (packed & 511) - vertical;
    return x >= 0 && x < 320 && y >= 0 && y < sky.clipRow
      ? [[x, y, sky.colours[(packed >> 10) & 15]!] as const]
      : [];
  });
};
