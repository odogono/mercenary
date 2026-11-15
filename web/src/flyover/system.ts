import type { Vector3 } from '../orientation/index.ts';
import type { SkySettings } from '../settings/index.ts';
import {
  createTargOrrery,
  targOrreryBodyPositionsAt,
  type TargOrrery,
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
import type { RangeAltitudes } from './rangeHandoff.ts';

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
  /// Present exactly when the Body supports the surface (ADR 0094).
  readonly rangeAltitudes?: RangeAltitudes;
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
  /// The Orrery at the clock's day length, which the surface frame's sky is drawn from too.
  readonly orrery: () => TargOrrery;
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
  readonly surfaceFrame: TargSurfaceFrame;
  readonly systemId: 'targ';
}

/// How the Flyover reads Targ's surface: the horizon frame's latitude, which is the latitude
/// the game's Targ sky is drawn from, and the one Island whose patch carries the city.
export interface TargSurfaceFrame {
  readonly frameLatitude: number;
  readonly island: IslandPresentation;
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

const targSurfaceFrame = (
  islands: readonly IslandPresentation[],
  skySettings: SkySettings
): TargSurfaceFrame => {
  const patched = islands.filter(island => island.surfacePatch !== undefined);
  if (patched.length !== 1) {
    throw new Error(
      'The Targ Flyover needs exactly one Island with a surface patch'
    );
  }
  const island = patched[0]!;
  // The city stands where the game's sky is drawn from, on the prime meridian, so the Flyover's
  // surface sky and the game's agree at the same clock (ADR 0094).
  if (
    island.centreDegrees.longitude !== 0 ||
    island.centreDegrees.latitude !== skySettings.latitudeDegrees
  ) {
    throw new Error(
      `${island.id} should be centred at 0°E ${skySettings.latitudeDegrees}°N, where the Targ sky is drawn from`
    );
  }
  return {
    frameLatitude: (skySettings.latitudeDegrees * Math.PI) / 180,
    island
  };
};

/// The Targ System seen from the city: TARG at the origin, and every other Body where the
/// Orrery's turning horizon puts it, at its own authored distance and radius (ADR 0086).
export const composeTargSystem = (
  authority: TargSystemDocument,
  presentation: TargPresentationDocument,
  skySettings: SkySettings,
  clock = new TargFlyoverClock(skySettings.dayLengthMinutes)
): TargFlyoverSystem => {
  let orrery = createTargOrrery(authority, skySettings);
  const orreryNow = (): TargOrrery => {
    const dayLengthMinutes = clock.dayLengthMinutes();
    if (orrery.settings.dayLengthMinutes !== dayLengthMinutes) {
      orrery = createTargOrrery(authority, {
        ...skySettings,
        dayLengthMinutes
      });
    }
    return orrery;
  };
  const systemBodies = new Map(authority.bodies.map(body => [body.id, body]));
  const surfaceFrame = targSurfaceFrame(presentation.islands, skySettings);
  return {
    backdrop: presentation.backdrop,
    bodiesAt: elapsedSeconds => {
      const orbits = targOrreryBodyPositionsAt(orreryNow(), elapsedSeconds);
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
          ...(body.rangeAltitudes === undefined
            ? {}
            : { rangeAltitudes: body.rangeAltitudes }),
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
    orrery: orreryNow,
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
    surfaceFrame,
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
/// The System Menu pauses it and may change the day length until reload (#188).
export class TargFlyoverClock {
  private originSeconds: number;
  private pausedAt: number | undefined;
  private dayLength: number;
  private readonly presentationClock: TargPresentationClock;

  constructor(
    /// The day length the sky settings tune, in minutes.
    readonly tunedDayLengthMinutes: number,
    private readonly now: () => number = monotonicSeconds
  ) {
    this.originSeconds = now();
    this.dayLength = tunedDayLengthMinutes;
    this.presentationClock = new TargPresentationClock(() => this.dayLength);
  }

  private sinceOrigin(): number {
    return Math.max(0, (this.pausedAt ?? this.now()) - this.originSeconds);
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

  dayLengthMinutes(): number {
    return this.dayLength;
  }

  /// A new day length that keeps the time of day it was set at.
  setDayLength(minutes: number): void {
    if (!(Number.isFinite(minutes) && minutes > 0)) {
      throw new Error(
        'a Targ day length should be a positive number of minutes'
      );
    }
    const secondsOfDay = this.secondsOfDay();
    this.dayLength = minutes;
    this.setTime(secondsOfDay);
  }

  paused(): boolean {
    return this.pausedAt !== undefined;
  }

  pause(): void {
    this.pausedAt ??= this.now();
  }

  resume(): void {
    if (this.pausedAt !== undefined) {
      this.originSeconds += this.now() - this.pausedAt;
      this.pausedAt = undefined;
    }
  }

  /// Back to the epoch's time of day, at the same day length, still paused if it was.
  reset(): void {
    this.originSeconds = this.now();
    if (this.pausedAt !== undefined) {
      this.pausedAt = this.originSeconds;
    }
    this.presentationClock.reset();
  }
}
