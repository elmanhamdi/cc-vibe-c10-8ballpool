import type { AssetKind, AssetManifestEntry } from './AssetTypes.js';

export type { AssetKind, AssetManifestEntry } from './AssetTypes.js';

const tableGlb = new URL('../../assets/meshes/Table.glb', import.meta.url).href;

export const AssetManifest = {
  'env.tableMesh': {
    id: 'env.tableMesh',
    kind: 'model',
    browserUrl: tableGlb,
    futureMhsPath: '@Templates/table.hstf',
    sourceFormat: 'glb',
    unitScale: 1,
    forwardAxis: '+Z',
    upAxis: '+Y',
    pivot: 'custom',
    collision: 'custom',
    notes: 'Imported table mesh; physics bounds authored in Table.ts',
  },
} as const satisfies Record<string, AssetManifestEntry>;
