/// A Title's planned view, independent of sessions, palettes' native encodings and graphics APIs.
export type ScreenPoint = readonly [number, number];
export type Rgb = readonly [number, number, number];

/// Lateral terms and positive forward depth. Projection is centre − focal·u/d, centre + focal·v/d.
export interface CameraPoint {
  readonly d: number;
  readonly u: number;
  readonly v: number;
}
export interface FrameProjection {
  readonly centre: ScreenPoint;
  readonly focal: number;
  readonly height: number;
  readonly near: number;
  readonly width: number;
}
export type FrameColour = { readonly index: number } | { readonly rgb: Rgb };
export interface PaletteBand {
  /// Resolved 8-bit RGB entries; the Title has already applied its allocation rules.
  readonly colours: readonly Rgb[];
  readonly fromRow: number;
}
interface Primitive {
  readonly colour: FrameColour;
  readonly order: number;
  readonly source: string;
}
export type OrderedPrimitive = Primitive &
  (
    | {
        readonly camera: readonly CameraPoint[];
        readonly kind: 'polygon';
        readonly screen: readonly ScreenPoint[];
      }
    | {
        readonly camera: readonly [CameraPoint, CameraPoint];
        /// Enhanced width in output pixels; omitted lines retain the reference raster width.
        readonly displayPixelWidth?: number;
        readonly kind: 'line';
        readonly screen: readonly [ScreenPoint, ScreenPoint];
      }
    | { readonly kind: 'point'; readonly screen: ScreenPoint }
  );
export interface FrameDescription {
  readonly background: FrameColour;
  /// Sorted ascending, beginning at row zero. A later band replaces the preceding palette.
  readonly paletteBands: readonly PaletteBand[];
  /// Painter order. Camera geometry is primary; screen geometry retains the accepted projection.
  readonly primitives: readonly OrderedPrimitive[];
  readonly projection: FrameProjection;
}
