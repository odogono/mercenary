import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { readers } from '../src/payload/read.ts';

const document = {
  combat: {
    fire: {
      directionOffset: 48,
      effectSlot: 8,
      inputActiveValue: 0,
      lifecycleFrames: 16,
      oneActiveShot: true,
      walkingMoverProhibited: true
    },
    hostileCraft: {
      attackingSlot: 15,
      captureClearsAttackingShip: true,
      captureMover: 9,
      captureRemovesSlots: [14, 15],
      enabledByAttackingShip: true,
      inboundLifecycleFrames: 32,
      inboundSlot: 14,
      surfaceOnly: true
    },
    objectHits: {
      firstTargetMessage: 49,
      secondTargetScript: 27,
      targetSlots: [15, 0]
    },
    siteDestruction: {
      axisWindow: [112, 144],
      destroyedMask: 128,
      impactFrames: 16,
      projectileSlot: 8
    }
  },
  controls: {
    drop: {
      carriedExemptionSlot: 56,
      carriedMask: 128,
      copiesCurrentRoomAndPosition: true,
      emptyInventory: 'no-op',
      inventorySelection: 'last-in-first-out',
      keyCode: 18,
      requiresCarriedExemptionOrFlightState: true
    },
    takeOverrides: { antigravSlot: 27, sinkSlot: 47 }
  },
  counts: {
    interstellarShipFieldPoints: 21,
    objectHitTargets: 2,
    orbitalCallSites: 3
  },
  endingPresentation: {
    activeValue: 0,
    completedValue: 255,
    dispatch: 'nonzero-enters-terminal-presentation',
    interstellarShipField: {
      colours: {
        completedPhaseLoop: 114,
        entryDelayLoops: 96,
        events: [
          { lineColour: 1, loop: 0, phaseWrite: null, screenColour: 2 },
          { lineColour: 4, loop: 114, phaseWrite: 255, screenColour: 6 }
        ],
        repeatedDelayLoops: 3,
        repeatFinalEveryLoops: 3,
        storageQuirk: 'decoded'
      },
      continuationState: [
        { addresses: [48_894], name: 'terminalPhase' },
        {
          name: 'pointComponents',
          slots: 21,
          storage: {
            x: { exponentBase: 320, mantissaBase: 256 }
          }
        },
        {
          addresses: [44_114],
          name: 'accelerationSideByte',
          semanticContinuation: false
        }
      ],
      initialization: {
        stages: [
          {
            name: 'entry-priming',
            screenClear: 'once',
            writes: ['z-exponent=1']
          },
          {
            name: 'first-update',
            priorXYComponents: 'ignored',
            reason: 'primed-negative-depth',
            result: 'all-slots-respawn-and-project'
          }
        ]
      },
      loopOrder: [],
      motion: {
        accelerationSideByteEffect: 'decoded',
        accelerationSideStateAddress: 44_114,
        maturePhaseFirstMultiplier: 4.046_875,
        maturePhaseLaterMultiplier: 1.011_718_75,
        maturePhaseStopsAtExponent: 37,
        phaseBranch: 'sign',
        provenPhaseValues: [0, 1, 255],
        scriptedPhaseDepthDelta: -32
      },
      pointSlots: { count: 21, first: 0, identity: 'stable-index', last: 20 },
      projection: {
        horizontal: { centre: 80, range: [0, 160] },
        invalidity: ['negative-depth'],
        vertical: { centre: 68, range: [0, 136] }
      },
      respawn: {
        carryIn: 'set-by-invalidity-branch',
        generator: {
          carryIn: 'caller-provided',
          output: 'accumulator',
          recurrence: 'decoded',
          routineAddress: 44_527,
          state: { bytes: 2, stateAddress: 243, valueAddress: 232 }
        },
        lifetime: 'none',
        randomDraws: 7,
        replacesComponents: ['x', 'y', 'z'],
        trigger: 'invalid-depth-or-projection',
        x: {
          draws: [1, 2, 3],
          highMask: 63,
          highOffset: -32,
          range: [-2_097_152, 2_097_151]
        },
        y: {
          conversionLowSource: 'x-draw-1-residue',
          discardedLowDraw: 4,
          draws: [4, 5, 6],
          highMask: 63,
          highOffset: -32,
          range: [-2_097_152, 2_097_151]
        },
        z: { draw: 7, exponent: 56, range: [16_384, 32_704], step: 64 }
      },
      storage: {
        components: {
          x: { exponentBase: 320, mantissaBase: 256 },
          y: { exponentBase: 704, mantissaBase: 384 },
          z: { exponentBase: 896, mantissaBase: 832 }
        },
        screenPositions: {
          current: { xBase: 1664, yBase: 1728 },
          prior: { xBase: 1024, yBase: 1152 }
        },
        slotsPerArray: 21
      }
    },
    scriptedValue: 1
  },
  orbitalTransition: {
    axisMiddleByteWindow: [104, 120],
    callSites: [40_991, 41_190, 41_434],
    cell: [8, 8],
    minimumAltitudeByte: 252,
    successCarry: 'clear'
  },
  schemaVersion: 2
};

const payloadDocuments = (
  endgame: unknown = document
): Readonly<Record<string, unknown>> => ({
  'endgame.json': endgame,
  'manifest.json': {
    counts: {},
    decoderVersion: 7,
    schemaVersion: 8,
    sourceCoreDigest: 'core',
    sourceDatasetId: 'dataset'
  },
  'objects.json': { instances: [], models: [], schemaVersion: 8 },
  'rooms.json': {
    doorwayRules: {
      alongWallBias: 0,
      colonyCraftArrival: { x: 0, y: 0, z: 0 },
      colonyCraftSlot: 0,
      cooldownFrames: 0,
      darkMessage: 0,
      depthHalfWindow: 0,
      farMargin: 0,
      headingRounding: 0,
      keySlotBias: 0,
      lineColour: 0,
      lockBoundary: 0,
      lockedMessage: 0,
      nearMargin: 0,
      photonEmitterSlot: 0,
      randomRoom: 0,
      skeletonKeySlot: 0,
      stepInterlock: 0,
      transitionColours: [],
      wallThudSound: 0,
      worldFlipCooldownFrames: 0,
      worldFlipInputRemap: [],
      worldFlipRoom: 0
    },
    rooms: [],
    schemaVersion: 8
  },
  'surface.json': { cells: [], schemaVersion: 8 },
  'world.json': {
    bounds: { max: [0, 0, 0], min: [0, 0, 0] },
    grid: { cellSize: 65_536, cellsPerAxis: 16 },
    highAltitudeMap: [],
    roadAltitudeLookup: [],
    roadCells: [],
    schemaVersion: 8
  }
});

const readDocuments =
  (documents: Readonly<Record<string, unknown>>) =>
  async (name: string): Promise<string | undefined> =>
    name in documents ? JSON.stringify(documents[name]) : undefined;

describe('the endgame Data Payload document', () => {
  test('strictly decodes the complete guarded document', () => {
    expect(readers.endgame({ name: 'endgame.json' }, document)).toEqual(
      document
    );
  });

  test('rejects malformed native control identities at their field path', () => {
    const malformed = {
      ...document,
      controls: {
        ...document.controls,
        takeOverrides: { ...document.controls.takeOverrides, sinkSlot: '47' }
      }
    };

    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'controls.takeOverrides.sinkSlot'
    );
  });

  test('rejects malformed deeply nested decoded fields at their field path', () => {
    const malformed = structuredClone(document);
    malformed.endingPresentation.interstellarShipField.respawn.generator.state.bytes =
      'two' as never;

    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'endingPresentation.interstellarShipField.respawn.generator.state.bytes'
    );
  });

  test('is required and independently versioned by bundle loading', async () => {
    const { ['endgame.json']: _, ...missing } = payloadDocuments();
    await expect(load(readDocuments(missing))).rejects.toThrow('endgame.json');
    await expect(
      load(readDocuments(payloadDocuments({ ...document, schemaVersion: 3 })))
    ).rejects.toThrow('unsupported schemaVersion 3');
    expect((await load(readDocuments(payloadDocuments()))).endgame).toEqual(
      document
    );
  });
});
