import type { QuatData, TransformState, Vec3Data } from './renderTypes.js';

export const IDENTITY_QUAT: QuatData = { x: 0, y: 0, z: 0, w: 1 };

export function vec3(x: number, y: number, z: number): Vec3Data {
  return { x, y, z };
}

export function uniformScale(s: number): Vec3Data {
  return { x: s, y: s, z: s };
}

export function transformAt(pos: Vec3Data, scale: Vec3Data = uniformScale(1)): TransformState {
  return { position: pos, rotation: { ...IDENTITY_QUAT }, scale };
}
