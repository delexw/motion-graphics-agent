import * as THREE from "three";
import {
  createProceduralModelController,
  createProceduralModelCapture,
} from "../../src/authoring/procedural-model";

// Local factory-shaped fixture: checks integration, not agent reconstruction fidelity.
export function createFixtureModel() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.7), new THREE.MeshNormalMaterial());
  body.position.x = 0.6;
  pivot.add(body);
  root.add(pivot);
  root.userData.sculptRuntime = { nodes: { pivot } };
  return root;
}

export function mountProceduralModelFixture(root: THREE.Group) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e1e8ef");
  const camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(480, 320);
  renderer.setPixelRatio(1);
  document.body.style.margin = "0";
  document.body.appendChild(renderer.domElement);
  scene.add(root);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x52647a, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const controller = createProceduralModelController(root, (t) => {
    root.rotation.y = t;
  });
  const draw = () => renderer.render(scene, camera);
  const capture = createProceduralModelCapture(camera, draw);
  const hero = {
    azimuthDegrees: 25,
    elevationDegrees: 15,
    target: [0.4, 0, 0] as [number, number, number],
    distance: 5,
    fovDegrees: 40,
    near: 0.1,
    far: 100,
  };
  capture.setCamera(hero);
  const seek = (t: number) => {
    controller.setTime(t);
    draw();
  };
  seek(0);
  Object.assign(window, {
    seek,
    __IMG2THREEJS_CAPTURE__: capture,
    __IMG2THREEJS_READY__: true,
    hero,
  });
}
