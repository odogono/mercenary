// Shared pure coast query; each Title supplies its own recovered records.
export {
  classifyPosition,
  coastlineEdges,
  coastlineInBodyUnits,
  type CoastlineEdge,
  type LandSea
} from '../coast/islands.ts';
export type LandSeaAnswer = import('../coast/islands.ts').LandSeaAnswer<
  import('./world.ts').ErisIsland
>;
