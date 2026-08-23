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
  readonly axisWindow: readonly number[];
  readonly destroyedMask: number;
  readonly factionObjective: {
    readonly comparison: string;
    readonly mechanoidScript: number;
    readonly negativeOnesComplement: boolean;
    readonly palyarScript: number;
    readonly threshold: number;
  };
  readonly impactFrames: number;
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

export interface EndgameCombat {
  readonly fire: EndgameFire;
  readonly hostileCraft: {
    readonly attackingSlot: number;
    readonly captureClearsAttackingShip: boolean;
    readonly captureMover: number;
    readonly captureRemovesSlots: readonly number[];
    readonly enabledByAttackingShip: boolean;
    readonly inboundLifecycleFrames: number;
    readonly inboundSlot: number;
    readonly surfaceOnly: boolean;
  };
  readonly objectHits: {
    readonly firstTargetMessage: number;
    readonly secondTargetScript: number;
    readonly targetSlots: readonly number[];
  };
  readonly siteDestruction: EndgameSiteDestruction;
}

export interface EndgameInterstellarShipField {
  readonly colours: Readonly<Record<string, unknown>>;
  readonly continuationState: readonly unknown[];
  readonly initialization: Readonly<Record<string, unknown>>;
  readonly loopOrder: readonly string[];
  readonly motion: Readonly<Record<string, unknown>>;
  readonly pointSlots: {
    readonly count: number;
    readonly first: number;
    readonly identity: string;
    readonly last: number;
  };
  readonly projection: Readonly<Record<string, unknown>>;
  readonly respawn: Readonly<Record<string, unknown>>;
  readonly storage: Readonly<Record<string, unknown>>;
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

export interface EndgameDocument {
  readonly combat: EndgameCombat;
  readonly controls: {
    readonly drop: EndgameDropRules;
    readonly takeOverrides: EndgameTakeOverrides;
  };
  readonly counts: Readonly<Record<string, number>>;
  readonly endingPresentation: {
    readonly activeValue: number;
    readonly completedValue: number;
    readonly dispatch: string;
    readonly interstellarShipField: EndgameInterstellarShipField;
    readonly scriptedValue: number;
  };
  readonly orbitalTransition: {
    readonly axisMiddleByteWindow: readonly number[];
    readonly callSites: readonly number[];
    readonly cell: readonly number[];
    readonly minimumAltitudeByte: number;
    readonly successCarry: string;
  };
  readonly schemaVersion: number;
  readonly shipDelivery: EndgameShipDelivery;
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
  readonly altitudeWrap: number;
  readonly altitudeWrapSubtract: number;
  readonly ascendRate: number;
  readonly descendRate: number;
  readonly floor: number;
  readonly submergeAt: number;
  readonly submergeMiddle: number;
  readonly surfaceAt: number;
  readonly surfaceMiddle: number;
}

export interface UndergroundDocument {
  readonly counts: Readonly<Record<string, number>>;
  readonly entrances: readonly UndergroundEntrance[];
  readonly lift: UndergroundLift;
  readonly pad: UndergroundPad;
  readonly schemaVersion: number;
}

export interface Bundle {
  readonly benson?: BensonDocument;
  readonly endgame: EndgameDocument;
  readonly flight?: FlightDocument;
  readonly interaction?: InteractionDocument;
  readonly manifest: Manifest;
  readonly objects: ObjectsDocument;
  readonly rooms: RoomsDocument;
  readonly surface: SurfaceDocument;
  readonly text?: TextDocument;
  readonly underground?: UndergroundDocument;
  readonly world: WorldDocument;
}
