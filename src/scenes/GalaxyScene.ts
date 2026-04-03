import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { ParticleScene } from '../ParticleScene';

// Numero de particulas de la galaxia
const COUNT      = 20_000;
const ARMS       = 3;       // brazos espirales
const MAX_RADIUS = 5.0;     // radio maximo inicial

// Vertex shader: orbita espiral con velocidad angular inversa al radio (efecto Kepleriano)
const vertexShader = /* glsl */`
precision highp float;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform float uTime;          // tiempo acumulado
uniform float uSpeed;         // velocidad angular base
uniform float uRadius;        // radio maximo visible (escala de los radios)
uniform float uHeightSpread;  // altura del disco galactico
uniform float uSize;          // tamano base de los puntos
uniform float uTwist;         // enrollamiento extra de la espiral con el radio

// Atributos por particula
in float aRadius;   // distancia al centro
in float aAngle;    // angulo inicial en la espiral
in float aHeight;   // desplazamiento vertical
in vec3  aColor;    // color asignado por brazo

out vec3  vColor;
out float vRadius;

void main() {
  // El angulo gira mas rapido en el interior que en el exterior (efecto galactico)
  float spin = aAngle
             + uTime * uSpeed / max(aRadius, 0.3)
             + aRadius * uTwist;

  float r = aRadius * (uRadius / 5.0); // escalar radio con el control de GUI
  float x = r * cos(spin);
  float z = r * sin(spin);
  float y = aHeight * uHeightSpread;

  vec4 clip = projectionMatrix * viewMatrix * vec4(x, y, z, 1.0);
  gl_Position  = clip;
  gl_PointSize = uSize * (300.0 / -clip.z); // perspectiva

  vColor  = aColor;
  vRadius = aRadius;
}
`;

// Fragment shader: punto circular con brillo decreciente desde el nucleo
const fragmentShader = /* glsl */`
precision highp float;

uniform float uRadius;

in vec3  vColor;
in float vRadius;

out vec4 fragColor;

void main() {
  // Circulo suave
  vec2  d     = gl_PointCoord - 0.5;
  float dist  = length(d);
  if (dist > 0.5) discard;

  // Halo gaussiano: mas brillante en el centro del punto
  float glow = exp(-dist * dist * 8.0);

  // Nucleo galactico mas brillante que los brazos exteriores
  float brightness = 1.0 - clamp(vRadius / (uRadius + 0.01), 0.0, 1.0);

  float alpha = glow * (0.4 + 0.6 * brightness);
  vec3  color = vColor * (0.5 + 0.5 * brightness);

  fragColor = vec4(color, alpha);
}
`;

export function createGalaxyScene(gui: GUI): ParticleScene {
  // --- Geometria: espiral logaritmica generada en CPU ---
  const geometry = new THREE.BufferGeometry();

  // Atributo 'position' requerido por Three.js (la GPU recalcula la posicion real)
  geometry.setAttribute('position',
    new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));

  const aRadius = new Float32Array(COUNT);
  const aAngle  = new Float32Array(COUNT);
  const aHeight = new Float32Array(COUNT);
  const aColor  = new Float32Array(COUNT * 3);

  // Colores por brazo: azul, cian, blanco-lavanda
  const armColors: [number, number, number][] = [
    [0.4, 0.6, 1.0],   // brazo 0 — azul
    [0.3, 0.9, 0.9],   // brazo 1 — cian
    [0.9, 0.85, 1.0],  // brazo 2 — blanco violaceo
  ];

  for (let i = 0; i < COUNT; i++) {
    // Distribuir radios con mayor densidad cerca del centro
    const r   = Math.pow(Math.random(), 0.6) * MAX_RADIUS;
    const arm = i % ARMS;

    // Angulo base del brazo + espiral logaritmica + ruido leve
    const armOffset    = (arm / ARMS) * Math.PI * 2;
    const spiralAngle  = armOffset + Math.log(r + 0.5) * 2.0
                       + (Math.random() - 0.5) * 0.5;

    aRadius[i] = r;
    aAngle[i]  = spiralAngle;
    aHeight[i] = (Math.random() - 0.5); // [-0.5, 0.5], escalado por uHeightSpread

    // Color del brazo con variacion aleatoria leve
    const [cr, cg, cb] = armColors[arm];
    const jitter = 0.1;
    aColor[i * 3]     = Math.min(cr + (Math.random() - 0.5) * jitter, 1.0);
    aColor[i * 3 + 1] = Math.min(cg + (Math.random() - 0.5) * jitter, 1.0);
    aColor[i * 3 + 2] = Math.min(cb + (Math.random() - 0.5) * jitter, 1.0);
  }

  geometry.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
  geometry.setAttribute('aAngle',  new THREE.BufferAttribute(aAngle,  1));
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(aHeight, 1));
  geometry.setAttribute('aColor',  new THREE.BufferAttribute(aColor,  3));

  // --- Material ---
  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    uniforms: {
      viewMatrix:       { value: new THREE.Matrix4() },
      projectionMatrix: { value: new THREE.Matrix4() },
      uTime:            { value: 0.0 },
      uSpeed:           { value: 0.3 },
      uRadius:          { value: 5.0 },
      uHeightSpread:    { value: 0.2 },
      uSize:            { value: 4.0 },
      uTwist:           { value: 1.5 },
    },
    transparent:  true,
    depthWrite:   false,
    blending:     THREE.AdditiveBlending,
  });

  const points = new THREE.Points<THREE.BufferGeometry, THREE.RawShaderMaterial>(
    geometry, material
  );

  // --- Controles GUI ---
  const controllers = [
    gui.add(material.uniforms.uSpeed,        'value', 0,    1,    0.01).name('Rotation Speed'),
    gui.add(material.uniforms.uHeightSpread, 'value', 0,    1,    0.01).name('Height Spread'),
    gui.add(material.uniforms.uTwist,        'value', 0,    4,    0.05).name('Spiral Twist'),
    gui.add(material.uniforms.uRadius,       'value', 1,   10,    0.1).name('Radius'),
    gui.add(material.uniforms.uSize,         'value', 1,   12,    0.5).name('Size'),
  ];

  return {
    points,
    update(time: number, camera: THREE.PerspectiveCamera) {
      material.uniforms.uTime.value = time;

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
