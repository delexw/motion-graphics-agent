import { Mesh, Texture, type Object3D, type PerspectiveCamera } from "three";

/** Compatible with the part handles emitted in root.userData.sculptRuntime. */
export interface SculptRuntime {
  nodes: Record<string, Object3D>;
  sockets?: Record<string, Object3D>;
}

/** The factory owns its assets by default; opt out when they are shared elsewhere. */
export function createProceduralModelController(
  root: Object3D,
  pose: (timeSeconds: number, runtime: SculptRuntime) => void,
  options: { disposeResources?: boolean; onDispose?: () => void } = {},
) {
  const runtime = root.userData.sculptRuntime as SculptRuntime | undefined;
  if (!runtime?.nodes) throw Error("Procedural model needs sculptRuntime.nodes");
  const initial: { node: Object3D; restore: () => void }[] = [];
  root.traverse((node) => {
    const position = node.position.clone();
    const quaternion = node.quaternion.clone();
    const scale = node.scale.clone();
    const visible = node.visible;
    initial.push({
      node,
      restore: () => {
        node.position.copy(position);
        node.quaternion.copy(quaternion);
        node.scale.copy(scale);
        node.visible = visible;
      },
    });
  });
  let disposed = false;
  return {
    root,
    setTime(timeSeconds: number) {
      if (disposed) throw Error("Procedural model is disposed");
      if (!Number.isFinite(timeSeconds)) throw Error("Composition time must be finite");
      for (const { restore } of initial) restore();
      pose(timeSeconds, runtime);
      root.updateMatrixWorld(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      try {
        options.onDispose?.();
      } finally {
        if (options.disposeResources !== false) {
          const resources = new Set<{ dispose(): void }>();
          for (const { node } of initial) {
            if (!(node instanceof Mesh)) continue;
            resources.add(node.geometry);
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
              resources.add(material);
              for (const value of Object.values(material)) {
                if (value instanceof Texture) resources.add(value);
              }
            }
          }
          for (const resource of resources) resource.dispose();
        }
      }
    },
  };
}

export interface ProceduralCaptureCamera {
  azimuthDegrees: number;
  elevationDegrees: number;
  target: [number, number, number];
  distance: number;
  fovDegrees: number;
  near: number;
  far: number;
}

/** Upstream capture hook; the host owns readiness, screenshots and evidence manifests. */
export function createProceduralModelCapture(camera: PerspectiveCamera, renderFrame: () => void) {
  return {
    setCamera(view: ProceduralCaptureCamera) {
      if (
        !Array.isArray(view.target) ||
        view.target.length !== 3 ||
        ![
          view.azimuthDegrees,
          view.elevationDegrees,
          ...view.target,
          view.distance,
          view.fovDegrees,
          view.near,
          view.far,
        ].every(Number.isFinite) ||
        view.distance <= 0 ||
        view.fovDegrees <= 0 ||
        view.fovDegrees >= 180 ||
        view.near <= 0 ||
        view.far <= view.near
      )
        throw Error(
          "Capture requires an explicit finite camera, distance, field of view and clipping planes",
        );
      const azimuth = (view.azimuthDegrees * Math.PI) / 180;
      const elevation = (view.elevationDegrees * Math.PI) / 180;
      const horizontal = view.distance * Math.cos(elevation);
      const [x, y, z] = view.target;
      camera.position.set(
        x + horizontal * Math.sin(azimuth),
        y + view.distance * Math.sin(elevation),
        z + horizontal * Math.cos(azimuth),
      );
      camera.fov = view.fovDegrees;
      camera.near = view.near;
      camera.far = view.far;
      camera.lookAt(x, y, z);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      renderFrame();
    },
  };
}
