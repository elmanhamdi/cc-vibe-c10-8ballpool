/** Canvas backing-store sizing from layout + DPR (guide §2 `platform-browser`). */
export function applyCanvasResize(
  canvas: HTMLCanvasElement,
  widthCssPx: number,
  heightCssPx: number,
): { width: number; height: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(2, Math.floor(widthCssPx * dpr));
  const height = Math.max(2, Math.floor(heightCssPx * dpr));
  canvas.width = width;
  canvas.height = height;
  return { width, height };
}
