import { FretValue, GuitarStringInfo } from '../types.ts';

// Standard guitar tuning strings ordered from String 1 (high e) to String 6 (low E)
export const GUITAR_STRINGS: GuitarStringInfo[] = [
  { index: 0, stringNumber: 1, name: 'e', turkishName: '1. Tel (İnce mi)', openMidi: 64, openPitchName: 'E4' },
  { index: 1, stringNumber: 2, name: 'B', turkishName: '2. Tel (Si)', openMidi: 59, openPitchName: 'B3' },
  { index: 2, stringNumber: 3, name: 'G', turkishName: '3. Tel (Sol)', openMidi: 55, openPitchName: 'G3' },
  { index: 3, stringNumber: 4, name: 'D', turkishName: '4. Tel (Re)', openMidi: 50, openPitchName: 'D3' },
  { index: 4, stringNumber: 5, name: 'A', turkishName: '5. Tel (La)', openMidi: 45, openPitchName: 'A2' },
  { index: 5, stringNumber: 6, name: 'E', turkishName: '6. Tel (Kalın Mi)', openMidi: 40, openPitchName: 'E2' },
];

/**
 * Calculates the sounding MIDI pitch for a guitar string and fret.
 * Returns null if the string is muted ('X').
 */
export function calculateSoundingPitch(stringIndexFromHighE: number, fret: FretValue): number | null {
  if (fret === 'X') {
    return null;
  }
  if (typeof fret !== 'number' || fret < 0 || fret > 24) {
    throw new Error(`Geçersiz perde numarası: ${fret}. Perde 0 ile 24 arasında olmalıdır.`);
  }
  const stringInfo = GUITAR_STRINGS[stringIndexFromHighE];
  if (!stringInfo) {
    throw new Error(`Geçersiz tel indeksi: ${stringIndexFromHighE}.`);
  }
  return stringInfo.openMidi + fret;
}

/**
 * Sounding pitch to written pitch:
 * In conventional guitar notation (treble clef / 8vb), the written pitch
 * is handled exactly one octave (12 semitones) above the sounding pitch.
 */
export function calculateWrittenPitch(soundingMidi: number): number {
  return soundingMidi + 12;
}

/**
 * Parse raw input string or number into valid FretValue or null
 */
export function parseFretInput(val: string | number | null | undefined): FretValue | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (str === '') return null;
  if (str === 'X') return 'X';
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 0 && num <= 24 && String(num) === str) {
    return num;
  }
  return null;
}

/**
 * Validate that all 6 strings are properly assigned and not all muted
 */
export function validateSixStrings(
  inputs: (FretValue | null | undefined)[]
): { valid: true; frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] } | { valid: false; error: string } {
  if (inputs.length !== 6) {
    return { valid: false, error: 'Tüm 6 tel için değer girilmelidir.' };
  }

  const result: FretValue[] = [];
  for (let i = 0; i < 6; i++) {
    const val = inputs[i];
    if (val === null || val === undefined) {
      const stringName = GUITAR_STRINGS[i].name;
      return { valid: false, error: `${stringName} teli boş bırakılamaz. X, 0 veya 1-24 girin.` };
    }
    if (val !== 'X' && (typeof val !== 'number' || val < 0 || val > 24)) {
      return { valid: false, error: `Geçersiz perde değeri: ${val}. 0-24 veya X olmalıdır.` };
    }
    result.push(val);
  }

  // Must have at least one sounding note
  const hasSounding = result.some((f) => f !== 'X');
  if (!hasSounding) {
    return { valid: false, error: 'En az bir tel çalınmalıdır (tüm teller susturulamaz).' };
  }

  return {
    valid: true,
    frets: result as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue],
  };
}
