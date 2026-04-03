import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import type { ParticleScene } from './ParticleScene';
import { createFountainScene } from './scenes/FountainScene';
import { createGalaxyScene } from './scenes/GalaxyScene';

// Configuracion del renderer
const container = document.getElementById('canvas-container')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Escena con fondo negro profundo (espacio)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);

// Camara
const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  200
);
camera.position.set(0, 3, 8);

// OrbitControls para acercarse/alejarse y orbitar con el mouse
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;

const gui = new GUI({ width: 280 });

type SceneName = 'fountain' | 'galaxy';
let currentScene: ParticleScene | null = null;

function buildScene(name: SceneName): ParticleScene {
  switch (name) {
    case 'fountain': return createFountainScene(gui);
    case 'galaxy':   return createGalaxyScene(gui);
  }
}

function loadScene(name: SceneName): void {
  // Limpiar escena anterior
  if (currentScene !== null) {
    scene.remove(currentScene.points);
    currentScene.dispose();
    currentScene = null;
  }

  // Resetear camara
  camera.position.set(0, 3, 8);
  controls.target.set(0, 0, 0);
  controls.update();

  currentScene = buildScene(name);
  scene.add(currentScene.points);

  // Marcar boton activo en la UI
  document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${name}`);
  if (activeBtn !== null) activeBtn.classList.add('active');
}

// Loop de animacion
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  controls.update();
  currentScene?.update(elapsed, camera);

  renderer.render(scene, camera);
}

// Redimensionar canvas al cambiar el tamaño de la ventana
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// Exponer loadScene para los botones del HTML
declare global {
  interface Window { loadScene: (name: SceneName) => void; }
}
window.loadScene = loadScene;

// Iniciar con la fuente
animate();
loadScene('fountain');
