import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { ParticleScene } from '../ParticleScene';

// Numero de particulas de la fuente
const COUNT = 15_000;

// Vertex shader: calcula posicion de cada particula via cinematica en la GPU
const vertexShader = /* glsl */`
precision highp float;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform float uTime;       // tiempo acumulado
uniform float uGravity;    // aceleracion gravitacional (hacia abajo)
uniform float uWind;       // fuerza del viento en X
uniform float uLifetime;   // duracion de vida de cada particula (segundos)
uniform float uSpread;     // amplitud de la velocidad inicial
uniform float uSize;       // tamano base de los puntos en pantalla

// Atributos por particula (definidos una sola vez en CPU)
in vec3 aVelocity;    // velocidad inicial aleatoria con sesgo hacia arriba
in float aLifeOffset; // offset de tiempo para que no todas empiecen a la vez

out float vT; // ciclo de vida normalizado [0,1] para el fragment shader

void main() {
  // Calcular edad de la particula y reiniciarla ciclicamente
  float age = mod(uTime + aLifeOffset, uLifetime);
  vT = age / uLifetime;

  // Cinematica: pos = v0*t + 0.5*a*t^2
  vec3 vel = aVelocity * uSpread;
  vec3 pos = vel * age
           + vec3(uWind, -uGravity, 0.0) * 0.5 * age * age;

  vec4 clip = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  gl_Position = clip;

  // Atenuacion perspectiva: particulas lejanas se ven mas pequeñas
  gl_PointSize = uSize * (300.0 / -clip.z);
}
`;

// Fragment shader: dibuja un punto circular suave con gradiente de color caliente→frio
const fragmentShader = /* glsl */`
precision highp float;

in float vT;

out vec4 fragColor;

void main() {
  // Descartar fragmentos fuera del circulo unitario del punto
  vec2 d = gl_PointCoord - 0.5;
  float dist2 = dot(d, d);
  if (dist2 > 0.25) discard;

  // Alpha: la particula se desvanece al final de su vida y en los bordes
  float edgeFade = smoothstep(0.25, 0.15, dist2);
  float alpha = (1.0 - vT) * edgeFade;

  // Color: blanco/amarillo al nacer → naranja/rojo al morir
  vec3 color = mix(vec3(1.0, 0.95, 0.6), vec3(0.9, 0.08, 0.0), vT);

  fragColor = vec4(color, alpha);
}
`;

export function createFountainScene(gui: GUI): ParticleScene {
  // --- Geometria: atributos aleatorios generados en CPU una sola vez ---
  const geometry = new THREE.BufferGeometry();

  // Three.js requiere el atributo 'position'; lo dejamos en cero porque
  // la posicion real la calcula el vertex shader a partir de aVelocity + uTime
  geometry.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));

  // Velocidad inicial: direccion aleatoria con fuerte componente vertical
  const velocities  = new Float32Array(COUNT * 3);
  const lifeOffsets = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r     = Math.random() * 0.4; // esparcimiento horizontal
    velocities[i * 3]     = Math.cos(theta) * r;
    velocities[i * 3 + 1] = 2.5 + Math.random() * 2.0; // sesgo hacia arriba
    velocities[i * 3 + 2] = Math.sin(theta) * r;

    lifeOffsets[i] = Math.random() * 3.0; // offset dentro del ciclo de vida
  }

  geometry.setAttribute('aVelocity',
    new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aLifeOffset',
    new THREE.BufferAttribute(lifeOffsets, 1));

  // --- Material ---
  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,  // Three.js pone '#version 300 es' antes de sus #define
    uniforms: {
      viewMatrix:       { value: new THREE.Matrix4() },
      projectionMatrix: { value: new THREE.Matrix4() },
      uTime:            { value: 0.0 },
      uGravity:         { value: 9.8 },
      uWind:            { value: 0.5 },
      uLifetime:        { value: 3.0 },
      uSpread:          { value: 1.0 },
      uSize:            { value: 6.0 },
    },
    transparent:  true,
    depthWrite:   false,           // sin orden de profundidad → sin artefactos
    blending:     THREE.AdditiveBlending, // suma colores → brillo acumulado
  });

  const points = new THREE.Points<THREE.BufferGeometry, THREE.RawShaderMaterial>(
    geometry, material
  );

  // --- Controles GUI ---
  const controllers = [
    gui.add(material.uniforms.uGravity,  'value', 1,    25,  0.1).name('Gravity'),
    gui.add(material.uniforms.uWind,     'value', -4,    4,  0.05).name('Wind X'),
    gui.add(material.uniforms.uLifetime, 'value', 0.5,   6,  0.1).name('Lifetime'),
    gui.add(material.uniforms.uSpread,   'value', 0.1,   3,  0.05).name('Spread'),
    gui.add(material.uniforms.uSize,     'value', 2,    20,  0.5).name('Size'),
  ];

  return {
    points,
    update(time: number, camera: THREE.PerspectiveCamera) {
      material.uniforms.uTime.value = time;

      // RawShaderMaterial necesita las matrices de camara actualizadas manualmente
      camera.updateMatrixWorld();
      material.uniforms.viewMatrix.value.copy(camera.matrixWorldInverse);
      material.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
    },
    dispose() {
      controllers.forEach(c => c.destroy());
      geometry.dispose();
      material.dispose();
    },
  };
}
