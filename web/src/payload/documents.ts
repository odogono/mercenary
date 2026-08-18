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
  readonly schemaVersion: number
  readonly sourceDatasetId: string
  readonly sourceCoreDigest: string
  readonly decoderVersion: number
  readonly counts: Readonly<Record<string, number>>
}

export interface Grid {
  readonly cellsPerAxis: number
  readonly cellSize: number
}

export interface Bounds {
  readonly min: readonly number[]
  readonly max: readonly number[]
}

export interface RoadSegment {
  readonly slot: number
  readonly from: readonly number[]
  readonly to: readonly number[]
}

export interface RoadCell {
  readonly cell: number
  readonly segments: readonly RoadSegment[]
}

export interface WorldDocument {
  readonly schemaVersion: number
  readonly grid: Grid
  readonly bounds: Bounds
  readonly roadAltitudeLookup: readonly number[]
  readonly roadCells: readonly RoadCell[]
  readonly highAltitudeMap: readonly RoadSegment[]
}

export type SurfaceVertexKind = "world-point" | "rotated-input"

export interface SurfaceVertexDocument {
  readonly kind: SurfaceVertexKind
  readonly position?: readonly number[]
  readonly rotationInput?: readonly number[]
}

export interface RotationDocument {
  readonly descriptor: number
  readonly center: readonly number[]
}

export interface SurfaceCell {
  readonly cell: number
  readonly grid: readonly number[]
  readonly structure?: string
  readonly vertices: readonly SurfaceVertexDocument[]
  readonly edges: readonly (readonly number[])[]
  readonly rotation?: RotationDocument
}

export interface SurfaceDocument {
  readonly schemaVersion: number
  readonly cells: readonly SurfaceCell[]
}

export interface Model {
  readonly id: string
  readonly vertices: readonly (readonly number[])[]
  readonly edges: readonly (readonly number[])[]
}

export interface Visibility {
  readonly detailCubePerAxis: number
  readonly farRepresentation: string
}

export interface Instance {
  readonly slot: number
  readonly id: string
  readonly model: string
  readonly position: readonly number[]
  readonly orientation?: readonly number[]
  readonly room: number
  readonly stateFlags: number
  readonly rotatable: boolean
  readonly placement: string
  readonly visibility: Visibility
}

export interface ObjectsDocument {
  readonly schemaVersion: number
  readonly models: readonly Model[]
  readonly instances: readonly Instance[]
}

export interface Palette {
  readonly background: number
  readonly foreground: number
}

/// Where a Doorway leads. Leaving the underground is its own case rather than a room id,
/// because the Colony Craft is not a Room.
export type Destination = { readonly room: number } | { readonly colonyCraft: true }

export interface Lock {
  readonly class: number
  readonly requiresObject: number
}

export interface Point {
  readonly x: number
  readonly z: number
}

export interface Doorway {
  readonly index: number
  readonly shape: number
  readonly plane: string
  readonly position: Point
  readonly destination: Destination
  readonly arrivalCommandIndex: number
  readonly arrival?: Point
  readonly arrivalWithinDestination: boolean
  readonly lock?: Lock
}

/// What happens on arriving in a Room: a Benson Script starts, or a message shows.
export type Entry = { readonly script: number } | { readonly message: number }

export type Selector = "random" | "previousRoom"

export interface Alternate {
  readonly room: number
  readonly arrivalCommandIndex: number
  readonly destination: Destination
  readonly arrival?: Point
  readonly arrivalWithinDestination: boolean
}

export interface SpecialSetup {
  readonly selector: Selector
  readonly alternates: readonly Alternate[]
}

export interface RoomDocument {
  readonly room: number
  readonly vertices: readonly (readonly number[])[]
  readonly edges: readonly (readonly number[])[]
  readonly bounds: Bounds
  readonly palette: Palette
  readonly dark: boolean
  readonly entry?: Entry
  readonly specialSetup?: SpecialSetup
  readonly doorways: readonly Doorway[]
}

export interface Position3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/// How a Doorway is taken and how a Room contains the player. Every value is an immediate the
/// decoder read out of the Reference Build, so nothing that consumes them needs a constant.
export interface DoorwayRules {
  readonly skeletonKeySlot: number
  readonly photonEmitterSlot: number
  readonly lockedMessage: number
  readonly darkMessage: number
  readonly lineColour: number
  readonly cooldownFrames: number
  readonly worldFlipCooldownFrames: number
  readonly randomRoom: number
  readonly worldFlipRoom: number
  readonly nearMargin: number
  readonly farMargin: number
  readonly wallThudSound: number
  readonly colonyCraftArrival: Position3
  readonly colonyCraftSlot: number
  readonly stepInterlock: number
  readonly transitionColours: readonly number[]
  readonly worldFlipInputRemap: readonly number[]
}

export interface RoomsDocument {
  readonly schemaVersion: number
  readonly doorwayRules: DoorwayRules
  readonly rooms: readonly RoomDocument[]
}

export interface Word {
  readonly index: number
  readonly text: string
  readonly suffix: boolean
  readonly unused: boolean
}

/// One element of a message. `kind` distinguishes a dictionary word from an inline literal, an
/// extra space, and the two runtime-filled slots.
export interface Token {
  readonly kind: string
  readonly word?: number
  readonly text?: string
  readonly slot?: number
}

export interface Message {
  readonly index: number
  readonly tokens: readonly Token[]
  /// Pre-composed, with `{word0}` / `{number0}` placeholders left in.
  readonly text: string
}

export interface TextDocument {
  readonly schemaVersion: number
  readonly words: readonly Word[]
  readonly messages: readonly Message[]
  readonly unresolvedCodes: readonly string[]
  readonly counts: Readonly<Record<string, number>>
}

/// The control routines a block may dispatch through. The export refuses any address it cannot
/// name, so this set is closed.
export type Handler = "standard" | "sinking" | "slot7" | "tumble" | "descent"

export interface Tumble {
  readonly altitudeDrop: number
  readonly rollStep: number
  readonly pitchStep: number
  readonly yawStep: number
}

/// One Craft Parameter Block: everything that makes a craft handle as it does.
export interface Block {
  readonly index: number
  readonly handler: Handler
  /// Set only on the three blocks the engine installs itself.
  readonly mode?: string
  readonly yawDamping: number
  readonly yawAuthority: number
  /// Angle units added to pitch per input frame; there is no pitch velocity.
  readonly pitchStep: number
  readonly rollCoupling: number
  readonly liftFactor: number
  readonly speedDamping: number
  readonly ceiling: number
  readonly throttleGain: number
  readonly tumble?: Tumble
}

export interface Poweramp {
  readonly craft: number
  readonly throttleScale: number
  readonly ceiling: number
}

export interface FlightRules {
  readonly angleUnitsPerTurn: number
  readonly levelPitch: number
  readonly groundAltitude: number
  readonly groundBand: number
  readonly takeoffSpeed: number
  readonly crashDescentRate: number
  readonly crashPitch: number
  readonly ceilingClimbScale: number
  readonly ceilingUnit: number
  readonly throttleNotches: readonly number[]
  readonly throttleLimit: number
  readonly poweramp: Poweramp
  readonly walkingBlock: number
}

/// The on-foot mover, which is not a Craft Parameter Block at all (ADR 0016).
export interface Walk {
  readonly step: number
  readonly turnStep: number
}

export interface FlightDocument {
  readonly schemaVersion: number
  readonly blocks: readonly Block[]
  readonly walk: Walk
  readonly rules: FlightRules
  readonly counts: Readonly<Record<string, number>>
}

/// A document the port checks the version of but does not yet read the body of.
///
/// The Benson, interaction and underground documents belong to later stages of the port
/// (#93, #94), and reading their bodies now would mean writing validators for shapes nothing
/// consumes yet. Their `schemaVersion` is still checked, so a stale one is refused rather than
/// tolerated — which is the guarantee the loader owes — and the raw body is kept so nothing is
/// silently dropped on the way through.
export interface UnreadDocument {
  readonly schemaVersion: number
  readonly body: Readonly<Record<string, unknown>>
}

export interface Bundle {
  readonly manifest: Manifest
  readonly world: WorldDocument
  readonly surface: SurfaceDocument
  readonly objects: ObjectsDocument
  readonly rooms: RoomsDocument
  readonly text?: TextDocument
  readonly flight?: FlightDocument
  readonly benson?: UnreadDocument
  readonly interaction?: UnreadDocument
  readonly underground?: UnreadDocument
}
