import type { DionContent } from './content.ts';
import type { Vec3 } from './frame.ts';

// Integer service rules recovered in R1/R4/#642. The passenger's cell is held
// for a complete frame; crossing it permits the zero-nibble burst of 16 calls.
export interface DionTaxi {
  readonly call: boolean;
  readonly cell: number;
  readonly counter: number;
  readonly destination: number;
  readonly heading: number;
  readonly heightIndex: number;
  readonly passenger: boolean;
  readonly position: Vec3;
  readonly progress: number;
  readonly routeIndex: number;
  readonly start: boolean;
}

const cellOf = (content: DionContent, position: Vec3): number => {
  const [gx, gz] = content.world.opening.groupOrigin;
  return (
    ((Math.floor(position[2] / 65_536) - gz) & 15) * 16 +
    ((Math.floor(position[0] / 65_536) - gx) & 15)
  );
};

export const createTaxi = (content: DionContent): DionTaxi => {
  const resident = content.world.residents.find(item => item.slot === 16)!;
  return {
    call: false,
    cell: resident.cell,
    counter: 0,
    destination: 0,
    heading: resident.yaw * 4,
    heightIndex: 0,
    passenger: false,
    position: resident.position,
    progress: content.service.opening.taxiProgress,
    routeIndex: content.service.opening.taxiRouteIndex,
    start: false
  };
};

const nextPoint = (content: DionContent, taxi: DionTaxi): DionTaxi => {
  const routeIndex = (taxi.routeIndex + 1) % content.service.route.length;
  const point = content.service.route[routeIndex]!;
  const next =
    content.service.route[(routeIndex + 1) % content.service.route.length]!;
  const dx = next.x - point.x;
  const dz = next.z - point.z;
  const heading = dx === 0 ? (dz > 0 ? 512 : 0) : dx > 0 ? 768 : 256;
  const [gx, gz] = content.world.opening.groupOrigin;
  return {
    ...taxi,
    cell: point.z * 16 + point.x,
    heading,
    position: [
      (gx + point.x) * 65_536 +
        (dx === 0 ? (dz < 0 ? 32_896 : 32_640) : 32_768),
      taxi.position[1],
      (gz + point.z) * 65_536 + (dz === 0 ? (dx < 0 ? 32_640 : 32_896) : 32_768)
    ],
    progress: 0,
    routeIndex
  };
};

/// `$5A1F0`: install the first service point when a surface Body is bound.
/// The cell remains cleared until the following service movement binds it.
export const initializeBodyTaxi = (content: DionContent): DionTaxi => ({
  ...nextPoint(content, {
    ...createTaxi(content),
    position: [0, 25, 0],
    routeIndex: content.service.route.length - 1
  }),
  cell: 0,
  counter: 35
});

// The same cell may occur twice with different controls. Before the mid-segment
// crossing use the current point; after crossing use this segment's next point.
/// D1 remains the frozen research/prototype witness. The expanded runtime uses
/// the later recovered empty-service and NOT.W movement rules.
export type DionTaxiProfile = 'd1' | 'tourcraft';
export const taxiControl = (
  content: DionContent,
  taxi: DionTaxi,
  profile: DionTaxiProfile = 'tourcraft'
): number => {
  if (profile === 'tourcraft' && !taxi.passenger) {
    return 0;
  }
  const current = content.service.route[taxi.routeIndex]!;
  const next =
    content.service.route[
      (taxi.routeIndex + 1) % content.service.route.length
    ]!;
  return (taxi.cell === current.z * 16 + current.x ? current : next).control;
};

export interface DionServiceStep {
  readonly arrived: boolean;
  readonly liftOff: boolean;
  readonly setDown: boolean;
  readonly taxi: DionTaxi;
}

export const stepTaxi = (
  content: DionContent,
  previous: DionTaxi,
  playerCell: number,
  profile: DionTaxiProfile = 'tourcraft'
): DionServiceStep => {
  let taxi = previous;
  let arrived = false;
  let liftOff = false;
  let setDown = false;
  const nibble = taxiControl(content, taxi, profile) & 7;
  const limit = nibble === 0 ? 16 : nibble + 1;
  for (let pass = 0; pass < limit; pass += 1) {
    if (
      profile === 'tourcraft' &&
      !taxi.passenger &&
      !taxi.call &&
      taxi.counter !== 0
    ) {
      taxi = {
        ...taxi,
        counter: 0,
        heightIndex: 0,
        position: [taxi.position[0], 25, taxi.position[2]]
      };
    }
    if (taxi.counter === 2) {
      if (taxi.passenger && taxi.start) {
        taxi = { ...taxi, counter: 1, heightIndex: -1 };
      } else if (taxi.passenger || taxi.call) {
        break;
      } else {
        taxi = {
          ...taxi,
          counter: 0,
          position: [taxi.position[0], 25, taxi.position[2]]
        };
      }
    } else if (taxi.counter === 1) {
      liftOff = taxi.heightIndex === -1;
      const index = taxi.heightIndex + 1;
      const y = content.service.liftOff[index];
      taxi =
        y === undefined
          ? { ...taxi, counter: 0, heightIndex: 0 }
          : {
              ...taxi,
              heightIndex: index,
              position: [taxi.position[0], y, taxi.position[2]]
            };
    } else if (taxi.counter === 35) {
      const y = content.service.descent[taxi.heightIndex];
      setDown ||= taxi.heightIndex === 0;
      taxi =
        y === undefined
          ? { ...taxi, counter: 34 }
          : {
              ...taxi,
              heightIndex: taxi.heightIndex + 1,
              position: [taxi.position[0], y, taxi.position[2]]
            };
    } else if (taxi.counter === 34) {
      taxi = { ...taxi, counter: 2, heightIndex: 0 };
    } else {
      const speed = -content.service.taxiRate;
      const direction = (taxi.heading >> 8) & 3;
      // The ST uses NOT.W, not NEG.W, on the positive movement word.
      const negative = profile === 'tourcraft' ? ~speed : -speed;
      const dx = direction === 1 ? negative : direction === 3 ? speed : 0;
      const dz = direction === 0 ? negative : direction === 2 ? speed : 0;
      const position: Vec3 = [
        taxi.position[0] + dx,
        taxi.position[1],
        taxi.position[2] + dz
      ];
      taxi = {
        ...taxi,
        cell: cellOf(content, position),
        position,
        progress: taxi.progress + speed
      };
      if (taxi.progress >= 65_536) {
        taxi = nextPoint(content, taxi);
        if (
          (taxi.passenger && taxi.start && taxi.cell === taxi.destination) ||
          (!taxi.passenger && taxi.call && taxi.cell === playerCell)
        ) {
          arrived = taxi.passenger;
          taxi = {
            ...taxi,
            counter: 35,
            destination: 0,
            heightIndex: 0,
            start: false
          };
          break;
        }
      }
    }
    if (nibble === 0 && taxi.cell === playerCell) {
      break;
    }
  }
  return { arrived, liftOff, setDown, taxi };
};
