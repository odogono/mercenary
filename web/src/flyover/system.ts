import type { Vector3 } from '../orientation/index.ts';
import type { SkySettings } from '../settings/index.ts';
import {
  createTargOrrery,
  targOrreryBodyPositionsAt,
  type TargOrreryBodyPositions
} from '../sky/index.ts';
import { TargPresentationClock } from '../sky/time.ts';
import {
  type FlyoverBackdropPresentation,
  type FlyoverBodyMeshPresentation,
  type FlyoverCameraPresentation,
  type FlyoverLighting,
  type FlyoverRange,
  type GammaPresentationDocument,
  type GammaSystemDocument,
  type IslandPresentation,
  type TargPresentationDocument,
  type TargSystemBodyId,
  type TargSystemDocument
} from './documents.ts';

export type FlyoverValueProvenance =
  'authored' | 'mechanically-derived' | 'recovered';

export interface FlyoverBody {
  readonly colour: string;
  readonly displayRadiusUnits: number;
  readonly id: string;
  readonly position: Vector3;
  readonly provenance: {
    readonly colour: 'authored' | 'recovered';
    readonly identity: 'authored' | 'recovered';
    readonly position: FlyoverValueProvenance;
    readonly radius: FlyoverValueProvenance;
    readonly ranges: 'authored';
  };
  readonly ranges: readonly FlyoverRange[];
}

interface FlyoverSystemBase {
  readonly backdrop: FlyoverBackdropPresentation;
  readonly bodiesAt: (elapsedSeconds: number) => readonly FlyoverBody[];
  readonly bodyMesh: FlyoverBodyMeshPresentation;
  readonly camera: FlyoverCameraPresentation;
  readonly cameraSpeed: {
    readonly maximumUnitsPerSecond: number;
    readonly minimumUnitsPerSecond: number;
  };
  readonly lighting: FlyoverLighting;
}

export interface TargFlyoverSystem extends FlyoverSystemBase {
  readonly clock: TargFlyoverClock;
  readonly islands: readonly IslandPresentation[];
  readonly provenance: {
    readonly backdrop: 'authored';
    readonly bodyMesh: 'authored';
    readonly camera: 'authored';
    readonly cameraSpeed: 'authored';
    readonly islands: 'authored';
    readonly lighting: 'authored';
    readonly surfaceColours: 'authored';
  };
  readonly surfaceColours: TargPresentationDocument['surfaceColours'];
  readonly systemId: 'targ';
}

export interface GammaFlyoverSystem extends FlyoverSystemBase {
  readonly provenance: {
    readonly backdrop: 'authored';
    readonly bodyMesh: 'authored';
    readonly camera: 'authored';
    readonly cameraSpeed: 'authored';
    readonly lighting: 'authored';
  };
  readonly systemId: 'gamma';
}

export type FlyoverSystem = TargFlyoverSystem | GammaFlyoverSystem;

const authoredPresentation = {
  colour: 'authored',
  ranges: 'authored'
} as const;

const targOrbitFor = (bodyId: string, orbits: TargOrreryBodyPositions) => {
  switch (bodyId) {
    case 'sun': {
      return orbits.sun;
    }
    case 'inner-moon': {
      return orbits.moons[0];
    }
    case 'outer-moon': {
      return orbits.moons[1];
    }
    default: {
      return undefined;
    }
  }
};

/// The Targ System seen from the city: TARG at the origin, and every other Body where the
/// Orrery's turning horizon puts it, at its own authored distance and radius (ADR 0086).
export const composeTargSystem = (
  authority: TargSystemDocument,
  presentation: TargPresentationDocument,
  skySettings: SkySettings,
  clock = new TargFlyoverClock(skySettings.dayLengthMinutes)
): TargFlyoverSystem => {
  const orrery = createTargOrrery(authority, skySettings);
  const systemBodies = new Map(authority.bodies.map(body => [body.id, body]));
  return {
    backdrop: presentation.backdrop,
    bodiesAt: elapsedSeconds => {
      const orbits = targOrreryBodyPositionsAt(orrery, elapsedSeconds);
      return presentation.bodies.map(body => {
        const source = systemBodies.get(body.id as TargSystemBodyId);
        if (source === undefined || body.radius.kind !== 'targ-system') {
          throw new Error(`Cannot compose Targ Body ${body.id}`);
        }
        const orbit = targOrbitFor(body.id, orbits);
        return {
          colour: source.baseColour,
          displayRadiusUnits: source.radius,
          id: body.id,
          position:
            orbit === undefined ? { ...source.position } : orbit.position,
          provenance: {
            ...authoredPresentation,
            identity: 'authored',
            position: orbit === undefined ? 'authored' : 'mechanically-derived',
            radius: 'authored'
          },
          ranges: body.ranges
        } satisfies FlyoverBody;
      });
    },
    bodyMesh: presentation.bodyMesh,
    camera: presentation.camera,
    cameraSpeed: presentation.cameraSpeed,
    clock,
    islands: presentation.islands,
    lighting: presentation.lighting,
    provenance: {
      backdrop: 'authored',
      bodyMesh: 'authored',
      camera: 'authored',
      cameraSpeed: 'authored',
      islands: 'authored',
      lighting: 'authored',
      surfaceColours: 'authored'
    },
    surfaceColours: presentation.surfaceColours,
    systemId: 'targ'
  };
};

export const composeGammaSystem = (
  authority: GammaSystemDocument,
  presentation: GammaPresentationDocument
): GammaFlyoverSystem => {
  const stable = authority.bodies.filter(
    body => body.positionKind === undefined
  );
  const recovered = new Map(stable.map(body => [body.id, body]));
  const bodies = presentation.bodies.map(body => {
    const source = recovered.get(body.id);
    if (source === undefined || body.radius.kind !== 'recovered-extent') {
      throw new Error(`Cannot compose Gamma Body ${body.id}`);
    }
    return {
      colour: source.baseColour,
      // The Body's own recovered radius (#528), so the System is drawn at its recovered
      // sizes: DIALIS a star, the moons moons. This replaced a
      // fraction of the distance to the nearest neighbour, which was the only rule available
      // before the extent was decoded and got 48% of size comparisons backwards, drawing an
      // isolated moon larger than a planet in a tight group.
      displayRadiusUnits: source.radius,
      id: body.id,
      position: { ...source.position },
      provenance: {
        ...authoredPresentation,
        colour: 'recovered',
        identity: 'recovered',
        position: 'recovered',
        radius: 'recovered'
      },
      ranges: body.ranges
    } satisfies FlyoverBody;
  });
  return {
    backdrop: presentation.backdrop,
    bodiesAt: () => bodies,
    bodyMesh: presentation.bodyMesh,
    camera: presentation.camera,
    cameraSpeed: presentation.cameraSpeed,
    lighting: presentation.lighting,
    provenance: {
      backdrop: 'authored',
      bodyMesh: 'authored',
      camera: 'authored',
      cameraSpeed: 'authored',
      lighting: 'authored'
    },
    systemId: 'gamma'
  };
};

const monotonicSeconds = (): number => performance.now() / 1000;

/// A reload-local Orrery clock. Its only authority is monotonic browser time plus the existing
/// presentation-only Targ time adjustment; it never reads or writes Session State or storage.
export class TargFlyoverClock {
  private originSeconds: number;
  private readonly presentationClock: TargPresentationClock;

  constructor(
    dayLengthMinutes: number,
    private readonly now: () => number = monotonicSeconds
  ) {
    this.originSeconds = now();
    this.presentationClock = new TargPresentationClock(() => dayLengthMinutes);
  }

  private sinceOrigin(): number {
    return Math.max(0, this.now() - this.originSeconds);
  }

  elapsedSeconds(): number {
    return this.presentationClock.elapsed(this.sinceOrigin());
  }

  secondsOfDay(): number {
    return this.presentationClock.secondsOfDay(this.sinceOrigin());
  }

  setTime(secondsOfDay: number): void {
    this.presentationClock.set(this.sinceOrigin(), secondsOfDay);
  }

  reset(): void {
    this.originSeconds = this.now();
    this.presentationClock.reset();
  }
}
