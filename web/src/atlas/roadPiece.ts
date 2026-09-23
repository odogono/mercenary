import type { Catalogue, Mesh, RoadNetwork } from '../catalogue/data.ts';
import type { ModelLookup } from '../catalogue/modelStore.ts';
import { DAMOCLES_CELL_UNITS } from '../damocles/residence.ts';
import type { MapPoint } from './mapView.ts';
import { catalogueBodyId } from './surface.ts';

/// A road cell's Drawn Record as the Atlas draws it at the Street Range: the ground record the
/// cell actually draws, which a placement may have replaced, laid on the surface in Body
/// Coordinates. Nothing here touches the DOM.
///
/// Recovered, not derived. A captured cell's Model is that cell's own resolved geometry —
/// already turned by its orientation byte and already joined to the scene points its workspace's
/// seed hands it — so it is placed at the cell's centre and nothing more (#459). An image-derived
/// cell has a Selected Piece and no Drawn Record, and another cell's Model sharing that record
/// would be a different shape, so it is counted and not drawn (#460).

/// One face or edge of a Drawn Record, in its recovered colour, in Body Coordinates.
///
/// Unwrapped, for the reason a coastline is: a scene join may reach several cells past the cell
/// it belongs to, and `wrapImages` offsets the primitive bodily instead.
export interface RoadPiecePrimitive {
  readonly colour: string;
  readonly points: readonly MapPoint[];
}

export interface RoadPiece {
  /// The cell's centre in Body Coordinates, which the record's own vertices count from.
  readonly at: MapPoint;
  /// Two-point edges (`$C00E`), drawn over the faces.
  readonly edges: readonly RoadPiecePrimitive[];
  /// Filled faces in the record's own order: a later face draws over an earlier one where they
  /// overlap, as the ground stream paints them.
  readonly faces: readonly RoadPiecePrimitive[];
  readonly modelId: string;
  readonly networkId: string;
  /// Whether a placement replaced the Selected Piece. Always known here: only a capture records
  /// the Drawn Record, and a capture answers this too.
  readonly overridden: boolean | null;
  readonly pieceName: RoadNetwork['cells'][number]['pieceName'];
}

export interface BodyRoadPieces {
  readonly drawn: readonly RoadPiece[];
  /// Road cells on this Body whose Drawn Record is not recovered: the image-derived networks,
  /// where the run grid was expanded from the authored stream and no capture stood.
  readonly undrawn: number;
}

const toBody = (
  at: MapPoint,
  mesh: Mesh,
  indices: readonly number[]
): readonly MapPoint[] =>
  indices.map(index => {
    const vertex = mesh.vertices[index]!;
    // No z mirror: the draw path adds the position as it is ($0538BE), the same composition
    // `footprintOf` places a structure with.
    return {
      x: at.x + vertex[0] / DAMOCLES_CELL_UNITS,
      z: at.z + vertex[2] / DAMOCLES_CELL_UNITS
    };
  });

const bodyNetworks = (catalogue: Catalogue, sourceIndex: number) => {
  const bodyId = catalogueBodyId(sourceIndex);
  return catalogue.roadNetworks.filter(network => network.body === bodyId);
};

/// Every road cell's Drawn Record on one Body, and how many road cells have none.
///
/// Placed from the Models in hand: a cell whose file has not been read is neither drawn nor
/// counted until it has (ADR 0048). `bodyRoadPieceModels` names what to read first.
export const readBodyRoadPieces = (
  catalogue: Catalogue,
  models: ModelLookup,
  sourceIndex: number
): BodyRoadPieces => {
  const drawn: RoadPiece[] = [];
  let undrawn = 0;
  for (const network of bodyNetworks(catalogue, sourceIndex)) {
    const [ox, oz] = network.origin;
    for (const cell of network.cells) {
      if (cell.model === null) {
        undrawn += 1;
        continue;
      }
      const mesh = models.peek(cell.model)?.variants[0]?.mesh;
      if (mesh === undefined) {
        continue;
      }
      const at = { x: ox + cell.x + 0.5, z: oz + cell.z + 0.5 };
      drawn.push({
        at,
        edges: mesh.lines.map(line => ({
          colour: line.colour,
          points: toBody(at, mesh, line.vertices)
        })),
        faces: mesh.faces.map(face => ({
          colour: face.colour,
          points: toBody(at, mesh, face.vertices)
        })),
        modelId: cell.model,
        networkId: network.id,
        overridden: cell.overridden,
        pieceName: cell.pieceName
      });
    }
  }
  return { drawn, undrawn };
};

/// The Models a Body's Road Pieces are drawn from.
export const bodyRoadPieceModels = (
  catalogue: Catalogue,
  sourceIndex: number
): readonly string[] => [
  ...new Set(
    bodyNetworks(catalogue, sourceIndex).flatMap(network =>
      network.cells.flatMap(cell => (cell.model === null ? [] : [cell.model]))
    )
  )
];
