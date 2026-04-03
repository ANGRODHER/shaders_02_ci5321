import type * as THREE from 'three';

// Contrato que deben cumplir todas las escenas de partículas del laboratorio
export interface ParticleScene {
  // El objeto Points (geometria + material) que se agrega a la escena Three.js
  points: THREE.Points;
  // Actualizar uniformes cada frame; recibe tiempo acumulado (segundos) y la camara activa
  update(time: number, camera: THREE.PerspectiveCamera): void;
  // Liberar recursos de GPU y destruir controles de GUI al cambiar de escena
  dispose(): void;
}
