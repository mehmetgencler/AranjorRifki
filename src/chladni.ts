export type MaterialKey = 'aluminum' | 'steel' | 'acrylic';

export interface PlateMode {
  index: number;
  m: number;
  n: number;
  omega: number;
  frequencyHz: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vz: number;
  z: number;
  radius: number;
}

export const materialPresets: Record<
  MaterialKey,
  { label: string; E: number; density: number; nu: number }
> = {
  aluminum: { label: 'Aluminum', E: 69e9, density: 2700, nu: 0.33 },
  steel: { label: 'Steel', E: 210e9, density: 7850, nu: 0.3 },
  acrylic: { label: 'Acrylic', E: 3.2e9, density: 1180, nu: 0.35 },
};

export function computePlateModes({
  L,
  thickness,
  E,
  density,
  nu,
  excitationX = 0.5,
  excitationY = 0.5,
}: {
  L: number;
  thickness: number;
  E: number;
  density: number;
  nu: number;
  excitationX?: number;
  excitationY?: number;
}): PlateMode[] {
  const D = (E * thickness ** 3) / (12 * (1 - nu ** 2));
  const base = Math.PI ** 2 * Math.sqrt(D / (density * thickness));
  const modes: PlateMode[] = [];

  for (let m = 1; m <= 8; m += 1) {
    for (let n = 1; n <= 8; n += 1) {
      const omega = base * (((m / L) ** 2 + (n / L) ** 2));
      const frequencyHz = omega / (2 * Math.PI);
      const coupling =
        Math.abs(
          Math.sin((m * Math.PI * excitationX) / L) * Math.sin((n * Math.PI * excitationY) / L)
        ) + 0.12;
      modes.push({
        index: modes.length,
        m,
        n,
        omega,
        frequencyHz: frequencyHz * coupling,
      });
    }
  }

  return modes.sort((a, b) => a.frequencyHz - b.frequencyHz);
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParticles(count: number, plateLength: number, seed: number): Particle[] {
  const particles: Particle[] = [];
  const rand = mulberry32(seed);

  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: rand() * plateLength,
      y: rand() * plateLength,
      vx: (rand() - 0.5) * 0.3,
      vy: (rand() - 0.5) * 0.3,
      vz: 0,
      z: 0,
      radius: 1.2 + rand() * 1.8,
    });
  }

  return particles;
}

