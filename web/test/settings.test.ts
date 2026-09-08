import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { controlLimits } from '../src/gameCore/index.ts';
import {
  DEFAULT_DEPARTURE_JOURNEY_SECONDS,
  DEFAULT_DEPARTURE_REDUCED_MOTION_JOURNEY_SECONDS,
  DEFAULT_DEPARTURE_SNAP_SECONDS,
  DEFAULT_MESSAGE_HOLD_SECONDS,
  DEFAULT_PRESENTATION_PRESET,
  DEFAULT_SCRIPT_INSTRUCTION_BUDGET,
  DEFAULT_SCRIPT_TIME_SCALE,
  DEFAULT_SKY_DAY_LENGTH_MINUTES,
  DEFAULT_SKY_LATITUDE_DEGREES,
  DEFAULT_SKY_OBLIQUITY_DEGREES,
  DEFAULT_SKY_STAR_COUNT,
  DEFAULT_SKY_STAR_SEED,
  DEFAULT_SKY_YEAR_DAYS,
  DEFAULT_STRUCTURE_REACH,
  DEFAULT_WIREFRAME_GLOW,
  DEFAULT_WIREFRAME_THICKNESS,
  SETTINGS_FILE_NAME,
  SettingsError,
  defaultSettings,
  flightLimits,
  flightModel,
  loadSettings,
  type FlightSettings
} from '../src/settings/index.ts';
import { parseTraceHeader, type TraceObject } from '../src/trace/index.ts';
import {
  loadPayload,
  readTraceText,
  repositoryRoot
} from './replay/artifacts.ts';
import { scriptSettingsValue } from './replay/bensonGate.ts';
import { expectIdentical } from './replay/compare.ts';
import { flightSettingsValue } from './replay/moverGate.ts';

/// What the settings port owes its callers.
///
/// Not a Replay Gate: the tuned values are feel choices rather than decoded facts (ADR 0014),
/// so there is no Reference Build behaviour to replay here. What there is instead is a merge
/// rule with a sharp edge — every field has a default, so a file may name only what it changes
/// — and the failure it must not have is a typo that leaves a tuning session quietly running
/// the defaults it was trying to change.

describe('settings that are not there', () => {
  test('load as the defaults', () => {
    expect(loadSettings(undefined)).toEqual(defaultSettings());
  });

  test('are the same defaults an empty document names none of', () => {
    expect(loadSettings('{}')).toEqual(defaultSettings());
  });

  test("the message block's default is a reading pause", () => {
    const { message } = defaultSettings();
    expect(message.holdSeconds).toBe(DEFAULT_MESSAGE_HOLD_SECONDS);
  });

  test("the scripts block's defaults are the chosen pace and one advance's budget", () => {
    const { scripts } = defaultSettings();
    expect(scripts.timeScale).toBe(DEFAULT_SCRIPT_TIME_SCALE);
    expect(scripts.instructionBudget).toBe(DEFAULT_SCRIPT_INSTRUCTION_BUDGET);
  });

  test('the presentation defaults to the authored Enhanced Targ sky', () => {
    expect(defaultSettings().presentation).toEqual({
      glowDistance: { fadeEnd: 16_384, fadeStart: 4096 },
      preset: DEFAULT_PRESENTATION_PRESET,
      roads: { glow: 0, thickness: 1 },
      sky: {
        dayLengthMinutes: DEFAULT_SKY_DAY_LENGTH_MINUTES,
        latitudeDegrees: DEFAULT_SKY_LATITUDE_DEGREES,
        obliquityDegrees: DEFAULT_SKY_OBLIQUITY_DEGREES,
        starCount: DEFAULT_SKY_STAR_COUNT,
        starSeed: DEFAULT_SKY_STAR_SEED,
        yearDays: DEFAULT_SKY_YEAR_DAYS
      },
      structureReach: DEFAULT_STRUCTURE_REACH,
      wireframe: {
        glow: DEFAULT_WIREFRAME_GLOW,
        thickness: DEFAULT_WIREFRAME_THICKNESS
      }
    });
  });
});

describe('a document that names only what it changes', () => {
  test('takes the defaults for every block it omits', () => {
    const settings = loadSettings('{"message": {"holdSeconds": 9}}');
    expect(settings.message.holdSeconds).toBe(9);
    expect(settings.scripts).toEqual(defaultSettings().scripts);
    expect(settings.flight).toEqual(defaultSettings().flight);
    // The block really is there to be compared, rather than two absent values agreeing.
    expect(settings.flight.referenceFrameRate).toBeNumber();
  });

  test('takes the defaults for every field it omits within a block it names', () => {
    const settings = loadSettings('{"scripts": {"timeScale": 1.5}}');
    expect(settings.scripts.timeScale).toBe(1.5);
    expect(settings.scripts.instructionBudget).toBe(
      DEFAULT_SCRIPT_INSTRUCTION_BUDGET
    );
  });

  test('merges each named block independently of the others', () => {
    const settings = loadSettings(
      '{"message": {"holdSeconds": 4}, "scripts": {"instructionBudget": 64}}'
    );
    expect(settings.message.holdSeconds).toBe(4);
    expect(settings.scripts.instructionBudget).toBe(64);
    expect(settings.scripts.timeScale).toBe(DEFAULT_SCRIPT_TIME_SCALE);
  });

  test('reads a null field as absent, as an omitted one', () => {
    const settings = loadSettings('{"message": {"holdSeconds": null}}');
    expect(settings.message.holdSeconds).toBe(DEFAULT_MESSAGE_HOLD_SECONDS);
  });

  test('merges a named sky field without losing its authored neighbours', () => {
    const settings = loadSettings(
      '{"presentation":{"preset":"authentic","sky":{"starCount":12}}}'
    );
    expect(settings.presentation.preset).toBe('authentic');
    expect(settings.presentation.sky.starCount).toBe(12);
    expect(settings.presentation.sky.starSeed).toBe(DEFAULT_SKY_STAR_SEED);
  });
});

describe('the Presentation Preset and Targ sky settings', () => {
  test('accept both named presets', () => {
    expect(
      loadSettings('{"presentation":{"preset":"authentic"}}').presentation
        .preset
    ).toBe('authentic');
    expect(
      loadSettings('{"presentation":{"preset":"enhanced"}}').presentation.preset
    ).toBe('enhanced');
  });

  test('refuse a preset the Browser Shell does not know', () => {
    expect(() =>
      loadSettings('{"presentation":{"preset":"cinematic"}}')
    ).toThrow(SettingsError);
  });

  for (const document of [
    '{"presentation":false}',
    '{"presentation":{"preset":1}}',
    '{"presentation":{"sky":[]}}',
    '{"presentation":{"sky":{"dayLengthMinutes":"24"}}}'
  ]) {
    test(`refuses the invalid typed document ${document}`, () => {
      expect(() => loadSettings(document)).toThrow(SettingsError);
    });
  }

  for (const [field, value] of [
    ['dayLengthMinutes', 0],
    ['dayLengthMinutes', -1],
    ['yearDays', 0],
    ['latitudeDegrees', -90.01],
    ['latitudeDegrees', 90.01],
    ['obliquityDegrees', -0.01],
    ['obliquityDegrees', 90.01],
    ['starCount', -1],
    ['starCount', 10_001],
    ['starCount', 1.5],
    ['starSeed', -1],
    ['starSeed', 0x01_00_00_00_00],
    ['starSeed', 1.5]
  ] as const) {
    test(`refuses presentation.sky.${field} = ${value}`, () => {
      expect(() =>
        loadSettings(
          JSON.stringify({ presentation: { sky: { [field]: value } } })
        )
      ).toThrow(SettingsError);
    });
  }

  for (const [name, boundaries] of [
    [
      'lower',
      {
        dayLengthMinutes: Number.MIN_VALUE,
        latitudeDegrees: -90,
        obliquityDegrees: 0,
        starCount: 0,
        starSeed: 0,
        yearDays: Number.MIN_VALUE
      }
    ],
    [
      'upper',
      {
        dayLengthMinutes: Number.MAX_VALUE,
        latitudeDegrees: 90,
        obliquityDegrees: 90,
        starCount: 10_000,
        starSeed: 0xff_ff_ff_ff,
        yearDays: Number.MAX_VALUE
      }
    ]
  ] as const) {
    test(`accepts every inclusive ${name} sky boundary`, () => {
      expect(
        loadSettings(
          JSON.stringify({
            presentation: {
              sky: boundaries
            }
          })
        ).presentation.sky
      ).toEqual(boundaries);
    });
  }

  test('validates named sky values even when the preset is Authentic', () => {
    expect(() =>
      loadSettings(
        '{"presentation":{"preset":"authentic","sky":{"starCount":-1}}}'
      )
    ).toThrow(SettingsError);
  });
});

describe('the Structure Reach setting', () => {
  test('defaults to the occupied Surface Cell', () => {
    expect(defaultSettings().presentation.structureReach).toBe('cell');
  });

  test('accepts both named reaches', () => {
    expect(
      loadSettings('{"presentation":{"structureReach":"cell"}}').presentation
        .structureReach
    ).toBe('cell');
    expect(
      loadSettings('{"presentation":{"structureReach":"all"}}').presentation
        .structureReach
    ).toBe('all');
  });

  test('refuses a reach the Browser Shell does not know', () => {
    expect(() =>
      loadSettings('{"presentation":{"structureReach":"ring"}}')
    ).toThrow(
      'presentation.structureReach should be "cell" or "all", and is "ring"'
    );
  });
});

describe('the Wireframe settings', () => {
  test('default to the Reference Build hairline with no glow', () => {
    expect(defaultSettings().presentation.wireframe).toEqual({
      glow: DEFAULT_WIREFRAME_GLOW,
      thickness: DEFAULT_WIREFRAME_THICKNESS
    });
  });

  test('take the values the document names', () => {
    expect(
      loadSettings(
        '{"presentation":{"wireframe":{"thickness":2.5,"glow":0.4}}}'
      ).presentation.wireframe
    ).toEqual({ glow: 0.4, thickness: 2.5 });
  });

  test('take their defaults for fields a named block omits', () => {
    expect(
      loadSettings('{"presentation":{"wireframe":{"glow":0.9}}}').presentation
        .wireframe
    ).toEqual({ glow: 0.9, thickness: DEFAULT_WIREFRAME_THICKNESS });
  });

  test('take their defaults when the block is not named at all', () => {
    expect(loadSettings('{"presentation":{}}').presentation.wireframe).toEqual(
      defaultSettings().presentation.wireframe
    );
  });

  for (const [field, value] of [
    ['thickness', 0],
    ['thickness', 0.99],
    ['thickness', 4.01],
    ['thickness', 'bold'],
    ['glow', -0.01],
    ['glow', 1.01],
    ['glow', true]
  ] as const) {
    test(`refuses presentation.wireframe.${field} = ${String(value)}`, () => {
      expect(() =>
        loadSettings(
          JSON.stringify({ presentation: { wireframe: { [field]: value } } })
        )
      ).toThrow(SettingsError);
    });
  }

  test('accepts every inclusive boundary', () => {
    expect(
      loadSettings('{"presentation":{"wireframe":{"thickness":4,"glow":1}}}')
        .presentation.wireframe
    ).toEqual({ glow: 1, thickness: 4 });
    expect(
      loadSettings('{"presentation":{"wireframe":{"thickness":1,"glow":0}}}')
        .presentation.wireframe
    ).toEqual({ glow: 0, thickness: 1 });
  });
});

describe('a settings document that cannot be read', () => {
  /// The one case worth having an error for. A typo in a tuning file would otherwise leave the
  /// session running the defaults, looking like a knob that does nothing rather than a file
  /// that did not parse, so it is reported rather than shrugged off.
  test('is refused rather than silently replaced by the defaults', () => {
    expect(() => loadSettings('{"message": ')).toThrow(SettingsError);
  });

  test('names the file and the reason, as the kit does', () => {
    let thrown: unknown;
    try {
      loadSettings('not json at all');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SettingsError);
    const failure = thrown as SettingsError;
    expect(failure.message).toStartWith(
      `Could not read settings from ${SETTINGS_FILE_NAME}: `
    );
    expect(failure.fileName).toBe(SETTINGS_FILE_NAME);
    expect(failure.reason.length).toBeGreaterThan(0);
  });

  test('is refused when a block is not an object', () => {
    expect(() => loadSettings('{"flight": 7}')).toThrow(SettingsError);
  });

  test('is refused when a field is not the type it should be', () => {
    expect(() => loadSettings('{"message": {"holdSeconds": "soon"}}')).toThrow(
      SettingsError
    );
  });

  test('is refused when the document itself is not an object', () => {
    expect(() => loadSettings('[]')).toThrow(SettingsError);
  });
});

describe('the flight block', () => {
  test('reads an absent eye height as absent rather than as a number', () => {
    // The kit decodes this one field with no `?? default` at all, because its default is itself
    // absence: "no height named" is what tells the flight model to use the captured Reference
    // Build height, and a zero here would be a player at ground level.
    expect(defaultSettings().flight.groundAltitude).toBeUndefined();
    expect(
      loadSettings('{"flight": {"turnScale": 2}}').flight.groundAltitude
    ).toBeUndefined();
  });

  test('reads an eye height that is named', () => {
    expect(
      loadSettings('{"flight": {"groundAltitude": 96}}').flight.groundAltitude
    ).toBe(96);
  });

  test('merges field by field, as the other blocks do', () => {
    const settings = loadSettings('{"flight": {"throttleFloorNotch": 5}}');
    const defaults = defaultSettings().flight;
    expect(settings.flight.throttleFloorNotch).toBe(5);
    expect(settings.flight.referenceFrameRate).toBe(
      defaults.referenceFrameRate
    );
    expect(settings.flight.runMultiplier).toBe(defaults.runMultiplier);
    expect(settings.flight.speedScale).toBe(defaults.speedScale);
  });

  test('refuses a fractional notch, which is a key index rather than a scale', () => {
    expect(() =>
      loadSettings('{"flight": {"throttleFloorNotch": 2.5}}')
    ).toThrow(SettingsError);
  });

  /// The defaults are not restated here, they are the control loop's own.
  ///
  /// `ControlLimits` is where these knobs live, so its defaults are the ones a settings file
  /// falls back to. Two copies would let the value an absent file resolves to drift from the
  /// value the loop runs with when there is no file — the kind of difference that shows up as a
  /// mover gate diverging rather than as anything about settings.
  test("are the control loop's own defaults rather than a second copy of them", () => {
    const defaults = defaultSettings().flight;
    const limits = controlLimits();
    expect(defaults.groundAltitude).toBe(limits.groundAltitude);
    expect(defaults.pitchScale).toBe(limits.pitchScale);
    expect(defaults.referenceFrameRate).toBe(limits.referenceFrameRate);
    expect(defaults.runMultiplier).toBe(limits.runMultiplier);
    expect(defaults.speedScale).toBe(limits.speedScale);
    expect(defaults.throttleFloorNotch).toBe(limits.throttleFloorNotch);
    expect(defaults.turnScale).toBe(limits.turnScale);
  });

  test('cover every knob the control loop takes, bar the extent', () => {
    // The block and the limits are the same set of knobs, so a knob added to one and not the
    // other would otherwise pass unnoticed by the field-by-field comparison above.
    expect(Object.keys(defaultSettings().flight).sort()).toEqual(
      Object.keys(controlLimits())
        .filter(key => key !== 'groundExtent')
        .sort()
    );
  });
});

describe('the limits the flight block produces', () => {
  test("carry the block's knobs through unchanged", () => {
    const flight: FlightSettings = {
      groundAltitude: 64,
      pitchScale: 2,
      referenceFrameRate: 25,
      runMultiplier: 4,
      speedScale: 5,
      throttleFloorNotch: 6,
      turnScale: 3
    };
    const limits = flightLimits(flight, 1024);
    expect(limits.groundAltitude).toBe(64);
    expect(limits.pitchScale).toBe(2);
    expect(limits.referenceFrameRate).toBe(25);
    expect(limits.runMultiplier).toBe(4);
    expect(limits.speedScale).toBe(5);
    expect(limits.throttleFloorNotch).toBe(6);
    expect(limits.turnScale).toBe(3);
  });

  test("take the world's extent from the caller, since no tuning file knows it", () => {
    // `groundExtent` is a decoded fact about the world rather than a feel choice, so it is a
    // parameter here and not a field of the block. A settings file that could name it could
    // contradict the payload it is played against.
    expect(flightLimits(defaultSettings().flight, 4096).groundExtent).toBe(
      4096
    );
  });

  test('leave the eye height absent when the block does', () => {
    expect(
      flightLimits(defaultSettings().flight, 4096).groundAltitude
    ).toBeUndefined();
  });
});

const bundle = await loadPayload();
const flightDocument = bundle.flight;
if (flightDocument === undefined) {
  throw new Error('the settings tests need flight.json to build a model from');
}

/// The eye height an on-foot trace starts at, read out of the trace rather than restated as a
/// literal here. The captured height belongs to the Reference Build, so the Oracle's record of it
/// is the authority; a literal would still pass if the capture were ever re-measured.
const walkHeader = parseTraceHeader(
  await readTraceText('game-core', 'surface-walk'),
  'game-core',
  'surface-walk'
);
const walkInitial = walkHeader['initial'] as TraceObject;
const recordedAltitude = (
  (walkInitial['player'] as TraceObject)['position'] as TraceObject
)['y'];
if (typeof recordedAltitude !== 'number') {
  throw new Error(
    'game-core/surface-walk records no initial altitude to walk at'
  );
}
const WALKING_EYE_ALTITUDE = recordedAltitude;

describe('the flight model the flight block produces', () => {
  const document = flightDocument;

  test("takes its rules from the payload's own flight document", () => {
    const model = flightModel(defaultSettings().flight, document, 4096);
    expect(model.rules).toEqual(document.rules);
  });

  test('resolves an unnamed eye height to the captured Reference Build height', () => {
    // 128, which is what the on-foot traces start at — asserted against the trace rather than
    // against a literal, so this stays tied to the recorded fact it comes from.
    const model = flightModel(defaultSettings().flight, document, 4096);
    expect(model.groundAltitude).toBe(WALKING_EYE_ALTITUDE);
  });

  test('resolves a named eye height to the number the document names', () => {
    const flight = loadSettings('{"flight": {"groundAltitude": 96}}').flight;
    expect(flightModel(flight, document, 4096).groundAltitude).toBe(96);
  });
});

/// The tuning every mover gate runs against, checked against what was recorded with it.
///
/// A trace header carries only its own emitter's settings, so a `flight` or `game-core` header
/// carries the flight block and nothing else. That block is the Trace Oracle's record of the
/// tuning the recorded motion came out of, which makes this the one assertion here that reaches
/// past this module: if the port resolved the tracked `settings.json` to different numbers than
/// the Oracle did, every mover gate would diverge and the reason would look like a misported
/// control loop rather than a settings file read two different ways.
describe('the tracked settings, against the traces recorded with them', () => {
  const catalogue = JSON.parse(
    readFileSync(join(repositoryRoot, 'trace-scenarios.json'), 'utf8')
  ) as {
    readonly scenarios: readonly {
      readonly emitter: string;
      readonly id: string;
    }[];
  };

  const movers = catalogue.scenarios.filter(
    scenario =>
      scenario.emitter === 'flight' || scenario.emitter === 'game-core'
  );

  const benson = catalogue.scenarios.filter(
    scenario => scenario.emitter === 'benson'
  );

  const tracked = loadSettings(
    readFileSync(join(repositoryRoot, SETTINGS_FILE_NAME), 'utf8')
  );

  test('the catalogue names the eleven mover traces this covers', () => {
    // Guards the way this test would otherwise fail silently: an empty list agrees with
    // everything, so a renamed emitter would turn the loop below into no assertion at all.
    // Eleven rather than twelve since craft-7-slot7 retired in #133.
    expect(movers.length).toBe(11);
  });

  test('the tracked file names a knob that is not the default', () => {
    // Without this, the comparison below would pass just as well against the defaults, and
    // would stop being evidence that the file was read at all.
    expect(tracked.flight.throttleFloorNotch).not.toBe(
      defaultSettings().flight.throttleFloorNotch
    );
  });

  test('the tracked file explicitly records the Enhanced sky defaults', () => {
    const source = JSON.parse(
      readFileSync(join(repositoryRoot, SETTINGS_FILE_NAME), 'utf8')
    ) as { readonly presentation?: { readonly structureReach?: unknown } };
    expect(source.presentation).toBeDefined();
    expect(source.presentation?.structureReach).toBe('cell');
    expect(tracked.presentation).toEqual(defaultSettings().presentation);
  });

  for (const scenario of movers) {
    test(`${scenario.emitter}/${scenario.id} was recorded with this tuning`, async () => {
      const header = parseTraceHeader(
        await readTraceText(scenario.emitter, scenario.id),
        scenario.emitter,
        scenario.id
      );
      const settings = header['settings'] as TraceObject;
      expectIdentical(
        settings['flight'],
        flightSettingsValue(tracked.flight),
        `${scenario.emitter}/${scenario.id} settings.flight`
      );
      // Only its own emitter's block, so a header gaining another one is noticed here.
      expect(Object.keys(settings)).toEqual(['flight']);
    });
  }

  test('the catalogue names the four benson traces this covers', () => {
    expect(benson.length).toBe(4);
  });

  for (const scenario of benson) {
    test(`${scenario.emitter}/${scenario.id} was recorded with this tuning`, async () => {
      const header = parseTraceHeader(
        await readTraceText(scenario.emitter, scenario.id),
        scenario.emitter,
        scenario.id
      );
      const settings = header['settings'] as TraceObject;
      expectIdentical(
        settings,
        scriptSettingsValue(tracked),
        `${scenario.emitter}/${scenario.id} settings`
      );
      expect(Object.keys(settings).sort()).toEqual(['message', 'scripts']);
    });
  }
});

describe('the Departure settings', () => {
  test('default to the recipe the prototype settled', () => {
    const { departure } = defaultSettings();
    expect(departure.journeySeconds).toBe(DEFAULT_DEPARTURE_JOURNEY_SECONDS);
    expect(departure.reducedMotionJourneySeconds).toBe(
      DEFAULT_DEPARTURE_REDUCED_MOTION_JOURNEY_SECONDS
    );
    expect(departure.snapSeconds).toBe(DEFAULT_DEPARTURE_SNAP_SECONDS);
  });

  test('take the durations the document names and default the rest', () => {
    const settings = loadSettings('{"departure": {"journeySeconds": 2}}');
    expect(settings.departure.journeySeconds).toBe(2);
    expect(settings.departure.snapSeconds).toBe(DEFAULT_DEPARTURE_SNAP_SECONDS);
  });

  test('refuse a journey that takes no time', () => {
    expect(() => loadSettings('{"departure": {"journeySeconds": 0}}')).toThrow(
      SettingsError
    );
  });
});
