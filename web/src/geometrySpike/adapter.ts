/// The #671 loading adapters: either candidate's bytes, plus the sidecar, become the payload record
/// the existing readers take, so the existing renderers draw a candidate asset unchanged.

import {
  parseModelFile,
  type Catalogue,
  type Model
} from '../catalogue/data.ts';
import { compose } from '../geometry/compose.ts';
import {
  CONTRACT_FORMAT,
  type GeometryAsset,
  type Sidecar
} from '../geometry/contract.ts';
import type * as Doc from '../payload/documents.ts';
import { decodeGlb } from './glb.ts';
import { MalformedGeometry, decodeMgeo } from './mgeo.ts';

export type Candidate = 'contract-json' | 'glb' | 'mgeo';

export const candidateOf = (path: string): Candidate =>
  path.endsWith('.glb')
    ? 'glb'
    : path.endsWith('.mgeo')
      ? 'mgeo'
      : 'contract-json';

export const decodeCandidate = (
  candidate: Candidate,
  bytes: Uint8Array
): GeometryAsset => {
  if (candidate === 'glb') {
    return decodeGlb(bytes);
  }
  if (candidate === 'mgeo') {
    return decodeMgeo(bytes);
  }
  const asset = JSON.parse(new TextDecoder().decode(bytes)) as GeometryAsset;
  if (asset.format !== CONTRACT_FORMAT) {
    throw new MalformedGeometry('not a geometry contract document');
  }
  return asset;
};

/// A Damocles Model file record through the Catalogue's own Model reader.
export const damoclesModel = (
  asset: GeometryAsset,
  sidecar: Sidecar,
  catalogue: Catalogue
): Model => parseModelFile(compose(asset, sidecar).record, catalogue);

export const targRoom = (asset: GeometryAsset, sidecar: Sidecar) =>
  compose(asset, sidecar).record as Doc.RoomDocument;
