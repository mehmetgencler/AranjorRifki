export const SHARP_PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_PITCH_CLASSES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export const ROOTS_PREFERRING_FLATS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

/**
 * Returns pitch class index (0-11, where 0 is C)
 */
export function midiToPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/**
 * Returns octave number for MIDI (60 -> 4, 40 -> 2, 52 -> 3)
 */
export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/**
 * Convert MIDI number to pitch name like "E2", "C#4", "Bb3"
 */
export function midiToPitchName(midi: number, preferFlats = false): string {
  const pc = midiToPitchClass(midi);
  const oct = midiToOctave(midi);
  const name = preferFlats ? FLAT_PITCH_CLASSES[pc] : SHARP_PITCH_CLASSES[pc];
  return `${name}${oct}`;
}

/**
 * Formats a written MIDI note into VexFlow key and accidental.
 * VexFlow expects key like "e/3", "f/3", "g#/4", "bb/4".
 */
export function midiToVexKey(
  writtenMidi: number,
  preferFlats = false
): { vexKey: string; accidental: string | null; step: string; octave: number; pitchName: string } {
  const pc = midiToPitchClass(writtenMidi);
  const oct = midiToOctave(writtenMidi);
  const pitchName = preferFlats ? FLAT_PITCH_CLASSES[pc] : SHARP_PITCH_CLASSES[pc];

  let step = pitchName[0].toLowerCase();
  let accidental: string | null = null;

  if (pitchName.length > 1) {
    accidental = pitchName[1]; // '#' or 'b'
  }

  const vexKey = `${step}${accidental ? accidental : ''}/${oct}`;

  return {
    vexKey,
    accidental,
    step,
    octave: oct,
    pitchName,
  };
}
