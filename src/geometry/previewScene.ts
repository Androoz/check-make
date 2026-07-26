export type CameraView = 'isometric' | 'top' | 'front' | 'back' | 'bottom' | 'left' | 'right';

export interface CameraPose {
  position: [number, number, number];
  up: [number, number, number];
  target: [number, number, number];
}

export function cameraPose(view: CameraView, distance: number, targetY: number): CameraPose {
  const target: CameraPose['target'] = [0, targetY, 0];
  if (view === 'top') return { position: [0, targetY + distance, 0.001], up: [0, 0, -1], target };
  if (view === 'bottom') return { position: [0, targetY - distance, 0.001], up: [0, 0, 1], target };
  if (view === 'front') return { position: [0, targetY, distance], up: [0, 1, 0], target };
  if (view === 'back') return { position: [0, targetY, -distance], up: [0, 1, 0], target };
  if (view === 'left') return { position: [-distance, targetY, 0], up: [0, 1, 0], target };
  if (view === 'right') return { position: [distance, targetY, 0], up: [0, 1, 0], target };
  return { position: [distance * 0.72, targetY + distance * 0.58, distance * 0.72], up: [0, 1, 0], target };
}
