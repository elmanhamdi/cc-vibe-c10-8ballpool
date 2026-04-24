export type AssetKind =
  | 'model'
  | 'template'
  | 'texture'
  | 'audio'
  | 'ui'
  | 'material';

export interface AssetManifestEntry {
  id: string;
  kind: AssetKind;
  browserUrl: string;
  futureMhsPath?: string;
  sourceFormat?: 'glb' | 'gltf' | 'fbx' | 'png' | 'jpg' | 'webp' | 'svg' | 'mp3' | 'ogg' | 'wav';
  unitScale?: number;
  forwardAxis?: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
  upAxis?: '+Y' | '+Z';
  correctiveRotationDeg?: { x: number; y: number; z: number };
  pivot?: 'center' | 'bottomCenter' | 'custom';
  collision?: 'none' | 'box' | 'sphere' | 'capsule' | 'mesh' | 'custom';
  notes?: string;
}
