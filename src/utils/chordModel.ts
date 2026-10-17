import {
  ChordEvent,
  FretValue,
  SoundingNote,
} from '../types.ts';
import {
  GUITAR_STRINGS,
  calculateSoundingPitch,
  calculateWrittenPitch,
} from './pitch.ts';
import {
  midiToPitchName,
  midiToVexKey,
  ROOTS_PREFERRING_FLATS,
} from './spelling.ts';
import { recognizeChord } from './chordRecognition.ts';

const LOCAL_STORAGE_KEY = 'fretharmony_progression_v1';

/**
 * Creates a complete ChordEvent from six string fret assignments
 */
export function createChordEvent(
  frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue],
  existingId?: string,
  manualChordName?: string,
  indexInProgression = 0
): ChordEvent {
  const soundingRaw: {
    stringIndex: number;
    stringName: string;
    fret: number;
    soundingMidi: number;
  }[] = [];

  for (let i = 0; i < 6; i++) {
    const f = frets[i];
    if (f !== 'X') {
      const midi = calculateSoundingPitch(i, f);
      if (midi !== null) {
        soundingRaw.push({
          stringIndex: i,
          stringName: GUITAR_STRINGS[i].name,
          fret: f,
          soundingMidi: midi,
        });
      }
    }
  }

  // Recognize chord first to determine preferFlats for spelling
  const soundingMidis = soundingRaw.map((s) => s.soundingMidi);
  const recognizedChord = recognizeChord(soundingMidis);

  const preferFlats = ROOTS_PREFERRING_FLATS.has(recognizedChord.rootName);

  // Sort sounding notes by MIDI pitch ascending (essential for VexFlow stave note keys)
  soundingRaw.sort((a, b) => a.soundingMidi - b.soundingMidi);

  const soundingNotes: SoundingNote[] = soundingRaw.map((s) => {
    const writtenMidi = calculateWrittenPitch(s.soundingMidi);
    const soundingPitchName = midiToPitchName(s.soundingMidi, preferFlats);
    const vex = midiToVexKey(writtenMidi, preferFlats);

    return {
      stringIndex: s.stringIndex,
      stringName: s.stringName,
      fret: s.fret,
      soundingMidi: s.soundingMidi,
      soundingPitchName,
      writtenMidi,
      writtenPitchName: `${vex.pitchName}${vex.octave}`,
      vexKey: vex.vexKey,
      accidental: vex.accidental,
    };
  });

  const vexKeys = soundingNotes.map((n) => n.vexKey);
  const vexAccidentals: { index: number; acc: string }[] = [];
  soundingNotes.forEach((n, idx) => {
    if (n.accidental) {
      vexAccidentals.push({ index: idx, acc: n.accidental });
    }
  });

  const soundingMidiPitches = soundingNotes.map((n) => n.soundingMidi);
  const writtenMidiPitches = soundingNotes.map((n) => n.writtenMidi);
  const noteSpellings = soundingNotes.map((n) => n.soundingPitchName);
  const writtenSpellings = soundingNotes.map((n) => n.writtenPitchName);

  const id = existingId || `chord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const effectiveChordName = (manualChordName && manualChordName.trim()) || recognizedChord.chordName;

  return {
    id,
    strings: [...frets],
    soundingNotes,
    soundingMidiPitches,
    writtenMidiPitches,
    noteSpellings,
    writtenSpellings,
    vexKeys,
    vexAccidentals,
    recognizedChord,
    manualChordName: manualChordName ? manualChordName.trim() : undefined,
    effectiveChordName,
    duration: 'q',
    durationLabel: '1/4 (Dörtlük)',
    measureIndex: Math.floor(indexInProgression / 4),
    beatIndex: indexInProgression % 4,
    createdAt: Date.now(),
  };
}

/**
 * Recomputes measureIndex and beatIndex across the chord progression
 */
export function recomputeProgressionMeasures(chords: ChordEvent[]): ChordEvent[] {
  return chords.map((chord, idx) => ({
    ...chord,
    measureIndex: Math.floor(idx / 4),
    beatIndex: idx % 4,
  }));
}

/**
 * Save chords progression to localStorage safely
 */
export function saveProgressionToStorage(chords: ChordEvent[]): void {
  try {
    const data = JSON.stringify(chords);
    localStorage.setItem(LOCAL_STORAGE_KEY, data);
  } catch (err) {
    console.error('Failed to save to localStorage', err);
  }
}

/**
 * Load chords progression from localStorage safely, with validation
 */
export function loadProgressionFromStorage(): ChordEvent[] | null {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return null;

    // Validate and rehydrate chords
    const validChords: ChordEvent[] = [];
    for (const item of parsed) {
      if (item && Array.isArray(item.strings) && item.strings.length === 6) {
        // Rebuild cleanly to ensure valid pitch calculation and Vex keys
        const reconstructed = createChordEvent(
          item.strings,
          item.id,
          item.manualChordName,
          validChords.length
        );
        validChords.push(reconstructed);
      }
    }
    return validChords.length > 0 ? recomputeProgressionMeasures(validChords) : null;
  } catch (err) {
    console.warn('Failed to parse saved progression, starting fresh', err);
    return null;
  }
}

/**
 * Default initial sample chord progression for demo and visual verification:
 * Am, C, D, G (4 popular guitar chords)
 */
export function getInitialDemoProgression(): ChordEvent[] {
  // Am: high to low: [0, 1, 2, 2, 0, 'X']
  // C:  high to low: [0, 1, 0, 2, 3, 'X']
  // D:  high to low: [2, 3, 2, 0, 'X', 'X']
  // G:  high to low: [3, 0, 0, 0, 2, 3]
  const c1 = createChordEvent([0, 1, 2, 2, 0, 'X'], 'demo_1', undefined, 0);
  const c2 = createChordEvent([0, 1, 0, 2, 3, 'X'], 'demo_2', undefined, 1);
  const c3 = createChordEvent([2, 3, 2, 0, 'X', 'X'], 'demo_3', undefined, 2);
  const c4 = createChordEvent([3, 0, 0, 0, 2, 3], 'demo_4', undefined, 3);
  return [c1, c2, c3, c4];
}
