import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Texture } from "three";
import { expect, it, vi } from "vitest";
import {
  createProceduralModelController,
  createProceduralModelCapture,
} from "../src/authoring/procedural-model";

function model() {
  const root = new Group();
  const texture = new Texture();
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial({ map: texture });
  const part = new Mesh(geometry, material);
  const other = new Mesh(geometry, material);
  root.add(part, other);
  root.position.x = 2;
  root.userData.sculptRuntime = { nodes: { part, other } };
  return { root, part, other, geometry, material, texture };
}
it("restores every initial transform and visibility before a direct or backward pose", () => {
  const { root, part, other } = model();
  const controller = createProceduralModelController(root, (t, { nodes }) => {
    nodes.part.position.x += t;
    nodes.part.rotation.y = t;
    if (t > 1) {
      nodes.other.visible = false;
      nodes.other.scale.setScalar(2);
    }
  });
  controller.setTime(1);
  const expected = part.matrixWorld.clone();
  controller.setTime(3);
  expect(other.visible).toBe(false);
  controller.setTime(1);
  expect(part.matrixWorld.equals(expected)).toBe(true);
  expect(other.visible).toBe(true);
  expect(other.scale.toArray()).toEqual([1, 1, 1]);
  expect(root.position.x).toBe(2);
  expect(() => controller.setTime(Number.NaN)).toThrow("finite");
  expect(() => createProceduralModelController(new Group(), () => {})).toThrow("sculptRuntime");
});
it("disposes owned shared resources exactly once and forbids posing after disposal", () => {
  const { root, geometry, material, texture } = model();
  const parent = new Group();
  parent.add(root);
  const spies = [geometry, material, texture].map((r) => vi.spyOn(r, "dispose"));
  const onDispose = vi.fn();
  const controller = createProceduralModelController(root, () => {}, { onDispose });
  controller.dispose();
  controller.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(onDispose).toHaveBeenCalledTimes(1);
  expect(parent.children).toHaveLength(0);
  expect(() => controller.setTime(0)).toThrow("disposed");
});
it("leaves externally shared resources intact and still cleans owned resources if a callback fails", () => {
  const first = model();
  const dispose = vi.spyOn(first.geometry, "dispose");
  createProceduralModelController(first.root, () => {}, { disposeResources: false }).dispose();
  expect(dispose).not.toHaveBeenCalled();
  const second = model();
  const cleanup = vi.spyOn(second.geometry, "dispose");
  const controller = createProceduralModelController(second.root, () => {}, {
    onDispose: () => {
      throw Error("cleanup failure");
    },
  });
  expect(() => controller.dispose()).toThrow("cleanup failure");
  expect(cleanup).toHaveBeenCalledOnce();
});
const view = {
  azimuthDegrees: 90,
  elevationDegrees: 0,
  target: [1, 2, 3] as [number, number, number],
  distance: 5,
  fovDegrees: 35,
  near: 0.1,
  far: 100,
};
it("applies an explicit shared camera and renders only after its matrices are ready", () => {
  const camera = new PerspectiveCamera();
  const render = vi.fn();
  const capture = createProceduralModelCapture(camera, render);
  capture.setCamera(view);
  expect(camera.position.x).toBeCloseTo(6);
  expect(camera.position.y).toBeCloseTo(2);
  expect(camera.position.z).toBeCloseTo(3);
  expect(camera.fov).toBe(35);
  expect(render).toHaveBeenCalledOnce();
  const projection = camera.projectionMatrix.clone();
  capture.setCamera({ ...view, azimuthDegrees: 0 });
  capture.setCamera(view);
  expect(camera.projectionMatrix.equals(projection)).toBe(true);
});
it.each([
  { distance: 0 },
  { fovDegrees: 180 },
  { far: 0 },
  { near: -1 },
  { azimuthDegrees: NaN },
  { target: [1, 2] },
])("rejects incomplete or invalid review cameras %j", (invalid) => {
  const render = vi.fn();
  const capture = createProceduralModelCapture(new PerspectiveCamera(), render);
  expect(() => capture.setCamera({ ...view, ...invalid } as typeof view)).toThrow(
    "explicit finite camera",
  );
  expect(render).not.toHaveBeenCalled();
});
