/// The Data Payload's documents, as the port reads them.
///
/// One interface per document, mirroring the kit's nested `Payload.*Document` types. Field
/// names are the payload's own, because the payload is the contract: renaming one here to read
/// better in TypeScript would put a translation step between the file and the code that must
/// agree with it.
///
/// Every document carries its own `schemaVersion` and they move independently — the geometry
/// documents share one, and text, Benson, interaction, flight and underground each version
/// separately, because their formats change on their own schedules.

export interface Manifest {
  readonly counts: Readonly<Record<string, number>>;
  readonly decoderVersion: number;
  readonly schemaVersion: number;
  readonly sourceCoreDigest: string;
  readonly sourceDatasetId: string;
}

export interface Grid {
  readonly cellSize: number;
  readonly cellsPerAxis: number;
}

export interface Bounds {
  readonly max: readonly number[];
  readonly min: readonly number[];
}

export interface RoadSegment {
  readonly from: readonly number[];
  readonly slot: number;
  readonly to: readonly number[];
}

export interface RoadCell {
  readonly cell: number;
  readonly segments: readonly RoadSegment[];
}

export interface WorldDocument {
  readonly bounds: Bounds;
  readonly grid: Grid;
  readonly highAltitudeMap: readonly RoadSegment[];
  readonly roadAltitudeLookup: readonly number[];
  readonly roadCells: readonly RoadCell[];
  readonly schemaVersion: number;
}

export type SurfaceVertexKind = 'world-point' | 'rotated-input';

export interface SurfaceVertexDocument {
  readonly kind: SurfaceVertexKind;
  readonly position?: readonly number[];
  readonly rotationInput?: readonly number[];
}

export interface RotationDocument {
  readonly center: readonly number[];
  readonly descriptor: number;
}

export interface SurfaceCell {
  readonly cell: number;
  readonly edges: readonly (readonly number[])[];
  readonly grid: readonly number[];
  readonly rotation?: RotationDocument;
  readonly structure?: string;
  readonly vertices: readonly SurfaceVertexDocument[];
}

export interface SurfaceDocument {
  readonly cells: readonly SurfaceCell[];
  readonly schemaVersion: number;
}

export interface Model {
  readonly edges: readonly (readonly number[])[];
  readonly id: string;
  readonly vertices: readonly (readonly number[])[];
}

export interface Visibility {
  readonly detailCubePerAxis: number;
  readonly farRepresentation: string;
}

export interface Instance {
  readonly id: string;
  readonly model: string;
  readonly orientation?: readonly number[];
  readonly placement: string;
  readonly position: readonly number[];
  readonly room: number;
  readonly rotatable: boolean;
  readonly slot: number;
  readonly stateFlags: number;
  readonly visibility: Visibility;
}

export interface ObjectsDocument {
  readonly instances: readonly Instance[];
  readonly models: readonly Model[];
  readonly schemaVersion: number;
}

export interface Palette {
  readonly background: number;
  readonly foreground: number;
}

/// Where a Doorway leads. Leaving the underground is its own case rather than a room id,
/// because the Colony Craft is not a Room.
export type Destination =
  { readonly room: number } | { readonly colonyCraft: true };

export interface Lock {
  readonly class: number;
  readonly requiresObject: number;
}

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface Doorway {
  readonly arrival?: Point;
  readonly arrivalCommandIndex: number;
  readonly arrivalWithinDestination: boolean;
  readonly destination: Destination;
  readonly index: number;
  readonly lock?: Lock;
  readonly plane: string;
  readonly position: Point;
  readonly shape: number;
}

/// What happens on arriving in a Room: a Benson Script starts, or a message shows.
export type Entry = { readonly script: number } | { readonly message: number };

export type Selector = 'random' | 'previousRoom';

export interface Alternate {
  readonly arrival?: Point;
  readonly arrivalCommandIndex: number;
  readonly arrivalWithinDestination: boolean;
  readonly destination: Destination;
  readonly room: number;
}

export interface SpecialSetup {
  readonly alternates: readonly Alternate[];
  readonly selector: Selector;
}

export interface RoomDocument {
  readonly bounds: Bounds;
  readonly dark: boolean;
  readonly doorways: readonly Doorway[];
  readonly edges: readonly (readonly number[])[];
  readonly entry?: Entry;
  readonly palette: Palette;
  readonly room: number;
  readonly specialSetup?: SpecialSetup;
  readonly vertices: readonly (readonly number[])[];
}

export interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/// How a Doorway is taken and how a Room contains the player. Every value is an immediate the
/// decoder read out of the Reference Build, so nothing that consumes them needs a constant.
export interface DoorwayRules {
  readonly alongWallBias: number;
  readonly colonyCraftArrival: Position3;
  readonly colonyCraftSlot: number;
  readonly cooldownFrames: number;
  readonly darkMessage: number;
  readonly depthHalfWindow: number;
  readonly farMargin: number;
  readonly headingRounding: number;
  readonly keySlotBias: number;
  readonly lineColour: number;
  readonly lockBoundary: number;
  readonly lockedMessage: number;
  readonly nearMargin: number;
  readonly photonEmitterSlot: number;
  readonly randomRoom: number;
  readonly skeletonKeySlot: number;
  readonly stepInterlock: number;
  readonly transitionColours: readonly number[];
  readonly wallThudSound: number;
  readonly worldFlipCooldownFrames: number;
  readonly worldFlipInputRemap: readonly number[];
  readonly worldFlipRoom: number;
}

export interface RoomsDocument {
  readonly doorwayRules: DoorwayRules;
  readonly rooms: readonly RoomDocument[];
  readonly schemaVersion: number;
}

export interface Word {
  readonly index: number;
  readonly suffix: boolean;
  readonly text: string;
  readonly unused: boolean;
}

/// One element of a message. `kind` distinguishes a dictionary word from an inline literal, an
/// extra space, and the two runtime-filled slots.
export interface Token {
  readonly kind: string;
  readonly slot?: number;
  readonly text?: string;
  readonly word?: number;
}

export interface Message {
  readonly index: number;
  /// Pre-composed, with `{word0}` / `{number0}` placeholders left in.
  readonly text: string;
  readonly tokens: readonly Token[];
}

export interface TextDocument {
  readonly counts: Readonly<Record<string, number>>;
  readonly messages: readonly Message[];
  readonly schemaVersion: number;
  readonly unresolvedCodes: readonly string[];
  readonly words: readonly Word[];
}

/// Where control goes when a conditional's branch is taken.
export interface BensonBranch {
  readonly kind: string;
  readonly target: number;
}

/// One instruction in the payload's flat list. Fields present depend on `op`.
export interface BensonInstruction {
  readonly a?: number;
  readonly b?: number;
  readonly base?: number;
  readonly branchOn?: boolean;
  readonly byte?: number;
  readonly craft?: number;
  readonly decimal?: number;
  readonly from?: number;
  readonly index?: number;
  readonly into?: number;
  readonly key?: string;
  readonly mask?: number;
  readonly mode?: string;
  readonly onTaken?: BensonBranch;
  readonly op: string;
  readonly register?: number;
  readonly slot?: number;
  readonly source?: string;
  readonly symbol?: string;
  readonly target?: number;
  readonly ticks?: number;
  readonly to?: number;
  readonly tokens?: readonly Token[];
  readonly value?: number;
}

export interface BensonScript {
  readonly entry: number;
  readonly id: number;
}

/// The Reference Build's game-logic programs, re-encoded by the export tool (ADR 0015).
export interface BensonDocument {
  readonly counts: Readonly<Record<string, number>>;
  /// Decimal registers play starts with, keyed by slot as JSON strings.
  readonly decimalSeeds: Readonly<Record<string, number>>;
  readonly framesPerTick: number;
  readonly instructions: readonly BensonInstruction[];
  readonly schemaVersion: number;
  readonly scripts: readonly BensonScript[];
}

/// The control routines a block may dispatch through. The export refuses any address it cannot
/// name, so this set is closed.
export type Handler = 'standard' | 'sinking' | 'slot7' | 'tumble' | 'descent';

export interface Tumble {
  readonly altitudeDrop: number;
  readonly pitchStep: number;
  readonly rollStep: number;
  readonly yawStep: number;
}

/// One Craft Parameter Block: everything that makes a craft handle as it does.
export interface Block {
  readonly ceiling: number;
  readonly handler: Handler;
  readonly index: number;
  readonly liftFactor: number;
  /// Set only on the three blocks the engine installs itself.
  readonly mode?: string;
  /// Angle units added to pitch per input frame; there is no pitch velocity.
  readonly pitchStep: number;
  readonly rollCoupling: number;
  readonly speedDamping: number;
  readonly throttleGain: number;
  readonly tumble?: Tumble;
  readonly yawAuthority: number;
  readonly yawDamping: number;
}

export interface Poweramp {
  readonly ceiling: number;
  readonly craft: number;
  readonly throttleScale: number;
}

export interface FlightRules {
  readonly angleUnitsPerTurn: number;
  readonly ceilingClimbScale: number;
  readonly ceilingUnit: number;
  readonly crashDescentRate: number;
  readonly crashPitch: number;
  readonly groundAltitude: number;
  readonly groundBand: number;
  readonly levelPitch: number;
  readonly poweramp: Poweramp;
  readonly takeoffSpeed: number;
  readonly throttleLimit: number;
  readonly throttleNotches: readonly number[];
  readonly walkingBlock: number;
}

/// The on-foot mover, which is not a Craft Parameter Block at all (ADR 0016).
export interface Walk {
  readonly step: number;
  readonly turnStep: number;
}

export interface FlightDocument {
  readonly blocks: readonly Block[];
  readonly counts: Readonly<Record<string, number>>;
  readonly rules: FlightRules;
  readonly schemaVersion: number;
  readonly walk: Walk;
}

export interface InteractionDocument {
  readonly boardKey: number;
  readonly boardRange: number;
  readonly carriedMask: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly craftSlotBound: number;
  readonly descriptionMask: number;
  readonly fixedMask: number;
  readonly heavyMask: number;
  readonly inventoryLimit: number;
  readonly rangeUnit: number;
  readonly removedFromWorld: number;
  readonly schemaVersion: number;
  readonly takeKey: number;
  readonly takeRange: number;
  readonly tooHeavyMessage: number;
}

export interface EndgameDropRules {
  readonly carriedExemptionSlot: number;
  readonly carriedMask: number;
  readonly copiesCurrentRoomAndPosition: boolean;
  readonly emptyInventory: string;
  readonly inventorySelection: string;
  readonly keyCode: number;
  readonly requiresCarriedExemptionOrFlightState: boolean;
}

export interface EndgameTakeOverrides {
  readonly antigravSlot: number;
  readonly sinkSlot: number;
}

/// The Sites a shot can destroy, and the rules the commit path follows.
export interface EndgameSiteDestruction {
  readonly alreadyDestroyedIsInert: boolean;
  /// How high a shot may be, in its middle byte, and still strike a Site.
  readonly altitudeMidByteLimit: number;
  readonly axisWindow: readonly number[];
  /// Which axis contributes the high nibble of a cell index.
  readonly cellDepthAxisIsHighNibble: boolean;
  readonly destroyedMask: number;
  readonly factionObjective: {
    readonly comparison: string;
    readonly mechanoidScript: number;
    readonly negativeOnesComplement: boolean;
    readonly palyarScript: number;
    readonly threshold: number;
  };
  readonly impactFrames: number;
  readonly impactSound: number;
  readonly initialCounts: {
    readonly mechanoid: number;
    readonly neutral: number;
    readonly palyar: number;
  };
  readonly initialTable: readonly number[];
  readonly lowIdMask: number;
  readonly mechanoidMask: number;
  readonly neutralMask: number;
  readonly projectileSlot: number;
  readonly reactionDispatchBase: number;
  readonly reactions: readonly {
    readonly cells: readonly number[];
    readonly lowId: number;
    readonly script: number;
  }[];
  readonly reactionWipeMask: number;
  /// Whether a Faction Reaction needs the player over the Site they struck.
  readonly requiresPlayerCell: boolean;
  readonly restorationKeepMask: number;
  readonly restorationSlot: number;
}

/// What firing costs and how far a shot gets.
export interface EndgameFire {
  readonly directionOffset: number;
  readonly effectSlot: number;
  /// Exponent units to a power of two, which is what makes the direction
  /// offset a scale rather than a rotation.
  readonly exponentUnitsPerOctave: number;
  readonly inputActiveValue: number;
  readonly lifecycleFrames: number;
  readonly oneActiveShot: boolean;
  /// The sound firing asks for, which presentation answers.
  readonly sound: number;
  /// World units a shot of full magnitude covers per frame on one axis.
  readonly speedPerFrame: number;
  readonly walkingMoverProhibited: boolean;
}

/// What a shot does when it reaches one of the two objects it can hit.
export interface EndgameObjectHits {
  readonly clearsAttackState: boolean;
  readonly cubeSize: number;
  /// What one unit of `cubeSize` is worth in world units: the test compares the
  /// bytes above the least significant one.
  readonly cubeUnit: number;
  readonly firstTargetMessage: number;
  readonly removesTarget: boolean;
  readonly secondTargetScript: number;
  readonly sound: number;
  readonly surfaceTargetsOnly: boolean;
  readonly targetSlots: readonly number[];
}

/// How a hostile craft closes on the player, when it shoots, and what a hit
/// costs whoever it lands on.
export interface EndgameHostileCraft {
  /// How far the attacker turns toward the player each time it re-aims, as a
  /// right shift of the distance between them.
  readonly approachAimShift: number;
  /// The lifecycle an attacker is given between one re-aim and the next. It is
  /// negative as a byte, which is what holds the encounter off while it closes.
  readonly approachDelayLifecycle: number;
  readonly attackingSlot: number;
  readonly captureClearsAttackingShip: boolean;
  readonly captureMover: number;
  readonly captureRemovesSlots: readonly number[];
  readonly enabledByAttackingShip: boolean;
  /// How near the player must be before the attacker shoots, in `rangeUnit`s.
  readonly firingRange: number;
  readonly hitCubeSize: number;
  readonly hitSound: number;
  readonly inboundAimShift: number;
  readonly inboundLifecycleFrames: number;
  readonly inboundSlot: number;
  readonly inboundSound: number;
  /// The lifecycle the effect advance leaves alone. An attacker's approach ends
  /// when its own count reaches this, which is what makes the delay finite.
  readonly parkedLifecycle: number;
  readonly rangeUnit: number;
  /// Shown only when the hit takes a craft; on foot there is nothing to lose.
  readonly shipDestroyedMessage: number;
  readonly surfaceOnly: boolean;
}

export interface EndgameCombat {
  readonly fire: EndgameFire;
  readonly hostileCraft: EndgameHostileCraft;
  readonly objectHits: EndgameObjectHits;
  readonly siteDestruction: EndgameSiteDestruction;
}

/// One step of the field's colour sequence: the pair it applies, the loop it
/// applies on, and the Ending Phase it writes as it does. Only the last event
/// carries a `phaseWrite`, which is how the terminal presentation matures.
export interface EndgameFieldColourEvent {
  readonly lineColour: number;
  readonly loop: number;
  readonly phaseWrite: number | null;
  readonly screenColour: number;
}

export interface EndgameFieldColours {
  readonly completedPhaseLoop: number;
  /// Loops the first pair is held for. The rest follow every
  /// `repeatedDelayLoops`, and the last is reapplied for as long as the loop runs.
  readonly entryDelayLoops: number;
  readonly events: readonly EndgameFieldColourEvent[];
  readonly repeatedDelayLoops: number;
  readonly repeatFinalEveryLoops: number;
  readonly storageQuirk: string;
}

/// Where one axis's mantissa and exponent arrays begin. Native addresses, kept
/// because the continuation boundary is described in terms of them.
export interface EndgameFieldAxisStorage {
  readonly exponentBase: number;
  readonly mantissaBase: number;
}

export interface EndgameFieldScreenStorage {
  readonly xBase: number;
  readonly yBase: number;
}

export interface EndgameFieldStorage {
  readonly components: {
    readonly x: EndgameFieldAxisStorage;
    readonly y: EndgameFieldAxisStorage;
    readonly z: EndgameFieldAxisStorage;
  };
  readonly screenPositions: {
    readonly current: EndgameFieldScreenStorage;
    readonly prior: EndgameFieldScreenStorage;
  };
  readonly slotsPerArray: number;
}

export interface EndgameFieldInitializationStage {
  readonly name: string;
  readonly priorXYComponents?: string;
  readonly reason?: string;
  readonly result?: string;
  readonly screenClear?: string;
  readonly writes?: readonly string[];
}

export interface EndgameFieldMotion {
  readonly accelerationSideByteEffect: string;
  readonly accelerationSideStateAddress: number;
  readonly maturePhaseFirstMultiplier: number;
  readonly maturePhaseLaterMultiplier: number;
  readonly maturePhaseStopsAtExponent: number;
  /// What selects the behaviour: the sign of the Ending Phase, which is why 255
  /// reads as negative and moves the field differently from 1.
  readonly phaseBranch: string;
  readonly provenPhaseValues: readonly number[];
  readonly scriptedPhaseDepthDelta: number;
}

export interface EndgameFieldProjectionAxis {
  readonly centre: number;
  readonly range: readonly [number, number];
}

export interface EndgameFieldProjection {
  readonly horizontal: EndgameFieldProjectionAxis;
  readonly invalidity: readonly string[];
  readonly vertical: EndgameFieldProjectionAxis;
}

export interface EndgameFieldRespawnAxis {
  readonly draws: readonly number[];
  readonly highMask: number;
  readonly highOffset: number;
  readonly range: readonly [number, number];
}

/// Y draws its own three values, but throws the first away and reuses the
/// residue X's first draw left behind — so the two axes are not independent.
export interface EndgameFieldRespawnVertical extends EndgameFieldRespawnAxis {
  readonly conversionLowSource: string;
  readonly discardedLowDraw: number;
}

export interface EndgameFieldRespawnDepth {
  readonly draw: number;
  readonly exponent: number;
  readonly range: readonly [number, number];
  readonly step: number;
}

export interface EndgameFieldGenerator {
  readonly carryIn: string;
  readonly output: string;
  readonly recurrence: string;
  readonly routineAddress: number;
  readonly state: {
    readonly bytes: number;
    readonly stateAddress: number;
    readonly valueAddress: number;
  };
}

export interface EndgameFieldRespawn {
  readonly carryIn: string;
  /// The shared generator the draws come from. It is never seeded or reset by
  /// the handler, so a respawn continues whatever random history preceded it.
  readonly generator: EndgameFieldGenerator;
  readonly lifetime: string;
  readonly randomDraws: number;
  readonly replacesComponents: readonly string[];
  readonly trigger: string;
  readonly x: EndgameFieldRespawnAxis;
  readonly y: EndgameFieldRespawnVertical;
  readonly z: EndgameFieldRespawnDepth;
}

/// A nested tree of native addresses. The continuation boundary describes some
/// of its members this way, and every leaf is an integer.
export interface EndgameFieldAddressTree {
  readonly [key: string]: number | EndgameFieldAddressTree;
}

/// One member of the boundary a Save must carry for the terminal presentation
/// to continue deterministically. `semanticContinuation: false` marks a byte the
/// decode found inert — recorded, but not part of the continuation.
export interface EndgameFieldContinuationState {
  readonly addresses?: readonly number[];
  readonly name: string;
  readonly semanticContinuation?: boolean;
  readonly slots?: number;
  readonly storage?: EndgameFieldAddressTree;
}

export interface EndgameInterstellarShipField {
  readonly colours: EndgameFieldColours;
  readonly continuationState: readonly EndgameFieldContinuationState[];
  readonly initialization: {
    readonly stages: readonly EndgameFieldInitializationStage[];
  };
  /// What the native loop does, in order, once per loop. The simulation follows
  /// this rather than an order of its own choosing.
  readonly loopOrder: readonly string[];
  readonly motion: EndgameFieldMotion;
  readonly pointSlots: {
    readonly count: number;
    readonly first: number;
    readonly identity: string;
    readonly last: number;
  };
  readonly projection: EndgameFieldProjection;
  readonly respawn: EndgameFieldRespawn;
  readonly storage: EndgameFieldStorage;
}

/// Where a hired Interstellar Ship goes, how it gets there, and when it has
/// arrived. Native constants only: what makes a ship *become* hired is a Benson
/// Script's business, and stays there.
export interface EndgameShipDelivery {
  readonly acceptedMask: number;
  readonly cadence: string;
  readonly callSite: number;
  readonly descendingValue: number;
  readonly descent: {
    readonly axis: string;
    readonly extraSubtraction: number;
    readonly lowByteHeldAt: number;
    readonly shift: number;
    readonly widthBits: number;
  };
  readonly inactiveValue: number;
  readonly initialisation: {
    readonly room: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly landing: {
    readonly cell: readonly number[];
    readonly clearsState: boolean;
    readonly framesToLand: number;
    readonly predicate: string;
  };
  readonly slot: number;
}

/// The one craft the outdoor frame loop moves independently of the player.
export interface EndgameSurfaceFlyby {
  readonly axis: 'z';
  readonly cadence: string;
  readonly slot: number;
  readonly stepPerFrame: number;
  readonly surfaceOnly: boolean;
  readonly wrapAt: number;
}

export interface EndgameDocument {
  readonly combat: EndgameCombat;
  readonly controls: {
    readonly drop: EndgameDropRules;
    /// The object whose being carried turns on the flight rules' one
    /// craft-conditioned override. The rates themselves are flight rules.
    readonly powerampSlot: number;
    readonly takeOverrides: EndgameTakeOverrides;
  };
  readonly counts: Readonly<Record<string, number>>;
  readonly endingPresentation: {
    readonly activeValue: number;
    readonly completedValue: number;
    readonly dispatch: string;
    readonly interstellarShipField: EndgameInterstellarShipField;
    readonly scriptedValue: number;
    /// The phase-0 arm's one write: the byte the handler stores into the
    /// pitch high byte before returning, pinning the ship nose-up.
    readonly slot7PitchHighByte: number;
  };
  readonly orbitalTransition: {
    /// The lower and upper middle-byte bounds of the box, on both axes.
    readonly axisMiddleByteWindow: readonly [number, number];
    readonly callSites: readonly number[];
    /// The Colony Craft's own surface cell, as an X and Z high byte.
    readonly cell: readonly [number, number];
    /// What flying into the box at exactly `entry.altitudeHighByte` does:
    /// one immediate feeds the wrapped altitude middle byte and the `$FA`
    /// flag, and the grounding tail rests the altitude low byte.
    readonly entry: {
      readonly altitudeHighByte: number;
      readonly flagValue: number;
      readonly restAltitudeLowByte: number;
      readonly wrappedAltitudeMiddleByte: number;
    };
    /// The mover installed on walking out of the box — the crash tumble,
    /// the same block the room-171 Doorway installs.
    readonly exitMover: number;
    readonly minimumAltitudeByte: number;
    readonly successCarry: string;
  };
  readonly schemaVersion: number;
  readonly shipDelivery: EndgameShipDelivery;
  readonly surfaceFlyby: EndgameSurfaceFlyby;
}

export interface UndergroundEntrance {
  readonly cell: readonly number[];
  readonly room: number;
  readonly site: number;
}

export interface UndergroundPad {
  readonly shift: number;
  readonly x: number;
  readonly z: number;
}

export interface UndergroundLift {
  readonly access: {
    readonly passSlot: number;
    readonly refusalMessage: number;
    readonly restrictedRoom: number;
  };
  readonly altitudeWrap: number;
  readonly altitudeWrapSubtract: number;
  readonly ascending: {
    readonly position: number;
    readonly sceneAt: number;
    readonly stage: number;
    readonly stopAt: number;
  };
  readonly cameraOffsets: {
    readonly ascending: number;
    readonly descending: number;
  };
  readonly descending: {
    readonly floor: number;
    readonly position: number;
    readonly sceneAt: number;
    readonly stage: number;
  };
  readonly framesPerSecond: number;
  readonly motionRates: readonly number[];
  readonly pitchHighBytes: readonly number[];
  readonly positionWrap: number;
  readonly screen: {
    readonly descendingInitialLineColour: number;
    readonly descendingInitialScreenColour: number;
    readonly indoorLineColours: readonly number[];
    readonly outdoorLineColours: readonly number[];
    readonly rasterBase: number;
    readonly rasterLimit: number;
  };
  readonly submergeAt: number;
  readonly submergeMiddle: number;
  readonly surfaceAt: number;
  readonly surfaceMiddle: number;
  readonly timing: readonly {
    readonly down: { readonly sceneAt: number; readonly stopAt: number };
    readonly room: number;
    readonly up: { readonly sceneAt: number; readonly stopAt: number };
  }[];
}

export interface UndergroundDocument {
  readonly counts: Readonly<Record<string, number>>;
  readonly entrances: readonly UndergroundEntrance[];
  readonly lift: UndergroundLift;
  readonly pad: UndergroundPad;
  readonly schemaVersion: number;
}

export interface SoundProgram {
  readonly attackDecay: number;
  readonly control: number;
  readonly frequencyHigh: number;
  readonly selector: number;
  readonly sustainRelease: number;
}

export interface SoundLiftProfile {
  readonly entry: 'af3e' | 'af3a';
  readonly registers: readonly number[];
  readonly startControl: number;
}

export interface SoundDocument {
  readonly bensonDisplay: {
    readonly characterMask: number;
    readonly control: number;
    readonly controlRegister: number;
    readonly frequencyHighBias: number;
    readonly frequencyHighRegister: number;
    readonly spaceCode: number;
    readonly spaceFrequencyHigh: number;
    readonly stopFrequencyHigh: number;
    readonly voice: number;
  };
  readonly counts: Readonly<Record<string, number>>;
  readonly craft: {
    readonly frequencyHighRegister: number;
    readonly programSelector: number;
    readonly speedHighShift: number;
    readonly sustainReleaseOr: number;
    readonly sustainReleaseRegister: number;
    readonly throttleFloor: number;
    readonly throttleSubtract: number;
    readonly undergroundSuppresses: boolean;
    readonly walkingCraftId: number;
  };
  readonly initialRegisters: readonly number[];
  readonly liftJourney: {
    readonly controlRegister: number;
    readonly dingSelector: number;
    readonly pitchHighRegister: number;
    readonly programSelector: number;
    readonly stoppedValue: number;
  };
  readonly liftProfiles: readonly SoundLiftProfile[];
  readonly oneShots: readonly SoundProgram[];
  readonly schemaVersion: number;
  readonly sid: {
    readonly clockHz: number;
    readonly model: '6581';
    readonly registerCount: number;
    readonly supportedControls: readonly number[];
    readonly voiceStride: number;
  };
  readonly stopRules: {
    readonly bensonDisplayFrequencyHighRegister: number;
    readonly liftControlRegister: number;
    readonly oneShotControlRegister: number;
    readonly secondVoiceControlRegister: number;
    readonly stoppedValue: number;
  };
}

export interface SightsEffect {
  readonly bitmapRows: readonly number[];
  readonly colours: {
    readonly room: number;
    readonly surface: number;
  };
  readonly height: number;
  readonly origin: readonly [number, number];
  readonly pixelScale: readonly [number, number];
  readonly slot: number;
  readonly width: number;
}

export interface ObjectEffectsDocument {
  readonly counts: Readonly<Record<string, number>>;
  readonly metalDetector: {
    readonly altitudeHighByteLimit: number;
    readonly colours: {
      readonly mechanoid: number;
      readonly neutral: number;
      readonly palyar: number;
    };
    readonly mechanoidMask: number;
    readonly neutralMask: number;
    readonly slot: number;
  };
  readonly schemaVersion: number;
  readonly sights: SightsEffect;
}

export interface Bundle {
  readonly benson?: BensonDocument;
  readonly endgame: EndgameDocument;
  readonly flight?: FlightDocument;
  readonly interaction?: InteractionDocument;
  readonly manifest: Manifest;
  readonly objectEffects: ObjectEffectsDocument;
  readonly objects: ObjectsDocument;
  readonly rooms: RoomsDocument;
  readonly sound: SoundDocument;
  readonly surface: SurfaceDocument;
  readonly text?: TextDocument;
  readonly underground?: UndergroundDocument;
  readonly world: WorldDocument;
}
