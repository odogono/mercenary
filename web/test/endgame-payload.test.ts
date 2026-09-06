import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { readers } from '../src/payload/read.ts';

/// A stand-in city table: the reader only owes us its width, and the census
/// itself is guarded on the lab side where the real table is read.
const siteTable = Array.from({ length: 256 }, (_, cell) =>
  cell === 0 ? 32 : cell === 3 ? 18 : cell === 2 ? 67 : 2
);

const document = {
  combat: {
    fire: {
      directionOffset: 48,
      effectSlot: 8,
      exponentUnitsPerOctave: 4,
      inputActiveValue: 0,
      lifecycleFrames: 16,
      oneActiveShot: true,
      sound: 8,
      speedPerFrame: 4096,
      walkingMoverProhibited: true
    },
    hostileCraft: {
      approachAimShift: 5,
      approachDelayLifecycle: 173,
      attackingSlot: 15,
      captureClearsAttackingShip: true,
      captureMover: 9,
      captureRemovesSlots: [14, 15],
      enabledByAttackingShip: true,
      firingRange: 48,
      hitCubeSize: 4,
      hitSound: 12,
      inboundAimShift: 4,
      inboundLifecycleFrames: 32,
      inboundSlot: 14,
      inboundSound: 8,
      parkedLifecycle: 127,
      rangeUnit: 256,
      shipDestroyedMessage: 48,
      surfaceOnly: true
    },
    objectHits: {
      clearsAttackState: true,
      cubeSize: 4,
      cubeUnit: 256,
      firstTargetMessage: 49,
      removesTarget: true,
      secondTargetScript: 27,
      sound: 16,
      surfaceTargetsOnly: true,
      targetSlots: [15, 0]
    },
    siteDestruction: {
      alreadyDestroyedIsInert: true,
      altitudeMidByteLimit: 8,
      axisWindow: [112, 144],
      cellDepthAxisIsHighNibble: true,
      destroyedMask: 128,
      factionObjective: {
        comparison: 'mechanoid-minus-palyar',
        mechanoidScript: 26,
        negativeOnesComplement: true,
        palyarScript: 10,
        threshold: 105
      },
      impactFrames: 16,
      impactSound: 4,
      initialCounts: { mechanoid: 115, neutral: 27, palyar: 114 },
      initialTable: siteTable,
      lowIdMask: 31,
      mechanoidMask: 64,
      neutralMask: 32,
      projectileSlot: 8,
      reactionDispatchBase: 32,
      reactions: [
        { cells: [1], lowId: 2, script: 34 },
        { cells: [2], lowId: 3, script: 35 },
        { cells: [3], lowId: 18, script: 50 }
      ],
      reactionWipeMask: 224,
      requiresPlayerCell: true,
      restorationKeepMask: 127,
      restorationSlot: 24
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
    powerampSlot: 28,
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
        horizontal: { centre: 80, range: [0, 160] as [number, number] },
        invalidity: ['negative-depth'],
        vertical: { centre: 68, range: [0, 136] as [number, number] }
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
          range: [-2_097_152, 2_097_151] as [number, number]
        },
        y: {
          conversionLowSource: 'x-draw-1-residue',
          discardedLowDraw: 4,
          draws: [4, 5, 6],
          highMask: 63,
          highOffset: -32,
          range: [-2_097_152, 2_097_151] as [number, number]
        },
        z: {
          draw: 7,
          exponent: 56,
          range: [16_384, 32_704] as [number, number],
          step: 64
        }
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
    scriptedValue: 1,
    slot7PitchHighByte: 1
  },
  orbitalTransition: {
    axisMiddleByteWindow: [104, 120] as [number, number],
    callSites: [40_991, 41_190, 41_434],
    cell: [8, 8] as [number, number],
    entry: {
      altitudeHighByte: 64,
      flagValue: 255,
      restAltitudeLowByte: 63,
      wrappedAltitudeMiddleByte: 255
    },
    exitMover: 9,
    minimumAltitudeByte: 252,
    successCarry: 'clear'
  },
  schemaVersion: 13,
  shipDelivery: {
    acceptedMask: 128,
    cadence: 'every-frame',
    callSite: 34_143,
    descendingValue: 127,
    descent: {
      axis: 'y',
      extraSubtraction: 1,
      lowByteHeldAt: 0,
      shift: 7,
      widthBits: 16
    },
    inactiveValue: 0,
    initialisation: { room: 0, x: 563_456, y: 8_323_072, z: 559_872 },
    landing: {
      cell: [8, 8],
      clearsState: true,
      framesToLand: 779,
      predicate: 'sixteen-bit-zero'
    },
    slot: 7
  },
  surfaceFlyby: {
    axis: 'z' as const,
    cadence: 'every-outdoor-frame',
    slot: 0,
    stepPerFrame: 256,
    surfaceOnly: true,
    wrapAt: 1_048_576
  }
};

const payloadDocuments = (
  endgame: unknown = document
): Readonly<Record<string, unknown>> => ({
  'endgame.json': endgame,
  'manifest.json': {
    counts: {},
    decoderVersion: 9,
    schemaVersion: 8,
    sourceCoreDigest: 'core',
    sourceDatasetId: 'dataset'
  },
  'object-effects.json': {
    counts: { effects: 1, sightsPixels: 16 },
    schemaVersion: 1,
    sights: {
      bitmapRows: [0xff_00_ff, ...Array<number>(20).fill(0)],
      colours: { room: 1, surface: 15 },
      height: 21,
      origin: [136, 66],
      pixelScale: [2, 2],
      slot: 40,
      width: 24
    }
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
  'sound.json': {
    bensonDisplay: {
      characterMask: 63,
      control: 65,
      controlRegister: 18,
      frequencyHighBias: 48,
      frequencyHighRegister: 15,
      spaceCode: 32,
      spaceFrequencyHigh: 208,
      stopFrequencyHigh: 0,
      voice: 3
    },
    counts: {
      initialRegisters: 25,
      liftProfiles: 2,
      oneShotPrograms: 13,
      voices: 3
    },
    craft: {
      frequencyHighRegister: 8,
      programSelector: 36,
      speedHighShift: 4,
      sustainReleaseOr: 8,
      sustainReleaseRegister: 13,
      throttleFloor: 4,
      throttleSubtract: 12,
      undergroundSuppresses: true,
      walkingCraftId: 10
    },
    initialRegisters: [...Array(24).fill(0), 15],
    liftProfiles: ['af3e', 'af3a'].map(entry => ({
      entry,
      registers: Array(14).fill(0),
      startControl: 21
    })),
    oneShots: Array.from({ length: 13 }, (_, index) => ({
      attackDecay: 0,
      control: 65,
      frequencyHigh: 0,
      selector: index * 4,
      sustainRelease: 0
    })),
    schemaVersion: 1,
    sid: {
      clockHz: 985_248,
      model: '6581',
      registerCount: 25,
      supportedControls: [0, 4, 16, 21, 65, 128, 129],
      voiceStride: 7
    },
    stopRules: {
      bensonDisplayFrequencyHighRegister: 15,
      liftControlRegister: 11,
      oneShotControlRegister: 4,
      secondVoiceControlRegister: 11,
      stoppedValue: 0
    }
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

  // The Interstellar Ship Field's decode is what the terminal presentation
  // steps from, so the reader owes it a shape the simulation can read directly
  // rather than a bag of unknowns each caller re-inspects.
  test('hands the Interstellar Ship Field over as a read shape', () => {
    const field = readers.endgame({ name: 'endgame.json' }, document)
      .endingPresentation.interstellarShipField;

    // The phase write lives in the colour sequence, on its last event.
    const last = field.colours.events.at(-1);
    expect(last?.phaseWrite).toBe(255);
    expect(last?.loop).toBe(field.colours.completedPhaseLoop);
    expect(field.colours.events[0]?.phaseWrite).toBeNull();

    // Motion: the scripted delta, and the two mature multipliers with the
    // exponent they stop climbing at.
    expect(field.motion.scriptedPhaseDepthDelta).toBe(-32);
    expect(field.motion.maturePhaseFirstMultiplier).toBe(4.046_875);
    expect(field.motion.maturePhaseLaterMultiplier).toBe(1.011_718_75);
    expect(field.motion.maturePhaseStopsAtExponent).toBe(37);
    expect(field.motion.provenPhaseValues).toEqual([0, 1, 255]);

    // Projection centres and the bounds a point respawns for failing.
    expect(field.projection.horizontal.centre).toBe(80);
    expect(field.projection.horizontal.range).toEqual([0, 160]);
    expect(field.projection.vertical.centre).toBe(68);
    expect(field.projection.vertical.range).toEqual([0, 136]);

    // Respawn: seven draws, and the quirk that couples Y to X's first draw.
    expect(field.respawn.randomDraws).toBe(7);
    expect(field.respawn.x.draws).toEqual([1, 2, 3]);
    expect(field.respawn.y.draws).toEqual([4, 5, 6]);
    expect(field.respawn.y.discardedLowDraw).toBe(4);
    expect(field.respawn.y.conversionLowSource).toBe('x-draw-1-residue');
    expect(field.respawn.z.draw).toBe(7);
    expect(field.respawn.z.exponent).toBe(56);
    expect(field.respawn.z.step).toBe(64);
    expect(field.respawn.generator.state.bytes).toBe(2);

    // The slots are stable, and every array is one per slot.
    expect(field.pointSlots.count).toBe(21);
    expect(field.storage.slotsPerArray).toBe(field.pointSlots.count);
    expect(field.storage.components.z.exponentBase).toBeGreaterThan(0);
    expect(field.initialization.stages[0]?.writes).toContain('z-exponent=1');
  });

  test('names a malformed colour event at its own path', () => {
    const malformed = structuredClone(document);
    const colours = malformed.endingPresentation.interstellarShipField.colours;
    colours.events = colours.events.map((event, index) =>
      index === 1 ? { ...event, loop: 'later' as never } : event
    );

    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'endingPresentation.interstellarShipField.colours.events[1].loop'
    );
  });

  test('names a malformed projection bound at its own path', () => {
    const malformed = structuredClone(document);
    malformed.endingPresentation.interstellarShipField.projection.vertical.centre =
      '68' as never;

    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'endingPresentation.interstellarShipField.projection.vertical.centre'
    );
  });

  test('refuses a city table that does not cover every surface cell', () => {
    const short = structuredClone(document);
    short.combat.siteDestruction.initialTable = siteTable.slice(0, 255);

    expect(() => readers.endgame({ name: 'endgame.json' }, short)).toThrow(
      'combat.siteDestruction.initialTable should be 256 entries'
    );
  });

  test('names the reaction row a malformed script sits in', () => {
    const malformed = structuredClone(document);
    malformed.combat.siteDestruction.reactions[1]!.script =
      'thirty-five' as never;

    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'combat.siteDestruction.reactions[1].script'
    );
  });

  test('names a malformed faction threshold at its own path', () => {
    const malformed = structuredClone(document);
    malformed.combat.siteDestruction.factionObjective.threshold =
      'one hundred and five' as never;

    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'combat.siteDestruction.factionObjective.threshold'
    );
  });

  test('is required and independently versioned by bundle loading', async () => {
    const { ['endgame.json']: _, ...missing } = payloadDocuments();
    await expect(load(readDocuments(missing))).rejects.toThrow('endgame.json');
    await expect(
      load(readDocuments(payloadDocuments({ ...document, schemaVersion: 11 })))
    ).rejects.toThrow('unsupported schemaVersion 11');
    await expect(
      load(readDocuments(payloadDocuments({ ...document, schemaVersion: 14 })))
    ).rejects.toThrow('unsupported schemaVersion 14');
    expect((await load(readDocuments(payloadDocuments()))).endgame).toEqual(
      document
    );
  });
});

describe('where a hired Interstellar Ship is sent', () => {
  test('reads the decoded descent', () => {
    const delivery = readers.endgame(
      { name: 'endgame.json' },
      document
    ).shipDelivery;

    expect(delivery.slot).toBe(7);
    expect(delivery.landing.cell).toEqual([8, 8]);
    expect(delivery.descent.shift).toBe(7);
    expect(delivery.descendingValue).toBe(127);
    expect(delivery.acceptedMask).toBe(128);
  });

  test('is required, and says which field is missing', () => {
    const { shipDelivery: _, ...without } = document;
    expect(() => readers.endgame({ name: 'endgame.json' }, without)).toThrow(
      'shipDelivery'
    );

    const malformed = structuredClone(document);
    malformed.shipDelivery.descent.shift = 'seven' as never;
    expect(() => readers.endgame({ name: 'endgame.json' }, malformed)).toThrow(
      'shipDelivery.descent.shift'
    );
  });
});
