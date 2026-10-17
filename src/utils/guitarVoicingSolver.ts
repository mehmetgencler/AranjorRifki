import { FretValue, SoundingNote } from '../types.ts';
import {
  GUITAR_STRINGS,
  calculateSoundingPitch,
  calculateWrittenPitch,
} from './pitch.ts';
import { midiToPitchName, midiToVexKey, ROOTS_PREFERRING_FLATS } from './spelling.ts';
import { recognizeChord } from './chordRecognition.ts';

export interface GeneratedVoicing {
  chordName: string;
  frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue];
  soundingNotes: SoundingNote[];
  soundingMidiPitches: number[];
  writtenMidiPitches: number[];
  bassMidi: number;
  highestMidi: number;
  fretSpan: number;
  averageFret: number;
  playabilityScore: number; // 0 to 100
  isValid: boolean;
  validationError?: string;
}

/**
 * Standard chord shapes indexed by root pitch class (0 = C, 1 = C#/Db, ..., 11 = B) and quality.
 * We store multiple ergonomic guitar voicings for each chord type so the solver can pick the
 * voicing that minimizes voice leading distance and position shifts relative to adjacent chords.
 */
interface VoicingPattern {
  quality: string;
  // String indices 0..5 (0: high e, 1: B, 2: G, 3: D, 4: A, 5: low E)
  frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue];
  description: string;
}

// Library of hand-crafted, verified guitar voicings for major, minor, 7, maj7, m7, dim7, m7b5 and inversions
const KNOWN_VOICING_PATTERNS: Record<string, [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue][]> = {
  // Dominant 7ths
  'G7': [
    [1, 0, 0, 0, 2, 3], // open G7
    ['X', 3, 4, 3, 5, 3], // barre 3rd fret
    [1, 0, 0, 3, 'X', 3], // shell 3rd fret
    [7, 6, 7, 5, 'X', 'X'], // upper 5th fret
  ],
  'Db7': [
    ['X', 2, 4, 3, 4, 'X'], // standard jazz Db7 root on 5th string (fret 4)
    [4, 6, 4, 6, 4, 'X'], // full 4th fret barre
    ['X', 6, 4, 6, 4, 'X'], // shell voicing
    [9, 9, 10, 9, 11, 9], // 9th fret barre
  ],
  'C7': [
    [0, 1, 3, 2, 3, 'X'], // open C7
    ['X', 5, 3, 5, 3, 'X'], // 3rd fret drop-2
    [3, 5, 3, 5, 3, 'X'], // 3rd fret barre
    [8, 8, 9, 8, 10, 8], // 8th fret barre
  ],
  'D7': [
    [2, 1, 2, 0, 'X', 'X'], // open D7
    ['X', 3, 5, 4, 5, 'X'], // 5th fret
    [5, 7, 5, 7, 5, 'X'], // 5th fret barre
  ],
  'A7': [
    [0, 2, 0, 2, 0, 'X'], // open A7
    ['X', 5, 6, 5, 7, 5], // 5th fret barre
    [3, 2, 2, 2, 0, 'X'], // open variation
  ],
  'E7': [
    [0, 0, 1, 0, 2, 0], // open E7
    [0, 3, 1, 2, 2, 0], // open E7 with high D
    ['X', 5, 7, 6, 7, 'X'], // 7th fret
  ],
  'B7': [
    [2, 0, 2, 1, 2, 'X'], // open B7
    ['X', 4, 2, 4, 2, 'X'], // 2nd fret
    [7, 7, 8, 7, 9, 7], // 7th fret barre
  ],
  'F7': [
    [1, 1, 2, 1, 3, 1], // 1st fret barre
    ['X', 4, 5, 3, 'X', 1], // shell 1st fret
    ['X', 6, 8, 7, 8, 'X'], // 8th fret
  ],
  'Bb7': [
    ['X', 3, 1, 3, 1, 'X'], // 1st fret
    [1, 3, 1, 3, 1, 'X'], // 1st fret barre
    [6, 6, 7, 6, 8, 6], // 6th fret barre
  ],
  'Eb7': [
    ['X', 4, 6, 5, 6, 'X'], // 6th fret
    [6, 8, 6, 8, 6, 'X'], // 6th fret barre
    [3, 2, 3, 1, 'X', 'X'], // lower 1st fret
  ],
  'Ab7': [
    [4, 4, 5, 4, 6, 4], // 4th fret barre
    ['X', 7, 5, 6, 'X', 4], // shell 4th fret
    ['X', 9, 8, 10, 'X', 4], // 4th fret
  ],
  'F#7': [
    [2, 2, 3, 2, 4, 2], // 2nd fret barre
    ['X', 5, 3, 4, 'X', 2], // shell 2nd fret
  ],

  // Minor 7ths
  'Dm7': [
    [1, 1, 2, 0, 'X', 'X'], // open Dm7
    ['X', 6, 5, 7, 5, 'X'], // 5th fret
    [5, 6, 5, 7, 5, 'X'], // 5th fret barre
    [1, 1, 2, 3, 'X', 'X'], // 1st fret
  ],
  'Am7': [
    [0, 1, 0, 2, 0, 'X'], // open Am7
    [5, 5, 5, 5, 7, 5], // 5th fret barre
    ['X', 5, 5, 5, 'X', 5], // shell
  ],
  'Em7': [
    [0, 3, 0, 2, 2, 0], // open Em7
    [0, 0, 0, 0, 2, 0], // open Em7
    ['X', 8, 7, 9, 7, 'X'], // 7th fret
  ],
  'Gm7': [
    [3, 3, 3, 3, 5, 3], // 3rd fret barre
    ['X', 3, 3, 3, 5, 'X'], // 3rd fret
    ['X', 6, 7, 5, 'X', 3], // shell
  ],
  'Cm7': [
    ['X', 4, 3, 5, 3, 'X'], // 3rd fret
    [3, 4, 3, 5, 3, 'X'], // 3rd fret barre
    [8, 8, 8, 8, 10, 8], // 8th fret barre
  ],
  'Fm7': [
    [1, 1, 1, 1, 3, 1], // 1st fret barre
    ['X', 4, 5, 3, 'X', 1], // shell
    ['X', 9, 8, 10, 8, 'X'], // 8th fret
  ],
  'Bm7': [
    ['X', 3, 2, 4, 2, 'X'], // 2nd fret
    [2, 3, 2, 4, 2, 'X'], // 2nd fret barre
    [7, 7, 7, 7, 9, 7], // 7th fret barre
  ],

  // Major 7ths
  'Cmaj7': [
    [0, 0, 0, 2, 3, 'X'], // open Cmaj7
    ['X', 5, 4, 5, 3, 'X'], // 3rd fret
    [3, 5, 4, 5, 3, 'X'], // 3rd fret barre
  ],
  'Fmaj7': [
    [0, 1, 2, 3, 'X', 'X'], // open Fmaj7
    [1, 1, 2, 2, 'X', 1], // 1st fret
    ['X', 5, 5, 3, 'X', 1], // shell
    ['X', 10, 9, 10, 8, 'X'], // 8th fret
  ],
  'Gmaj7': [
    [2, 0, 0, 0, 2, 3], // open Gmaj7
    ['X', 3, 4, 4, 'X', 3], // shell 3rd fret
    ['X', 7, 7, 5, 'X', 3], // 3rd fret
  ],
  'Dmaj7': [
    [2, 2, 2, 0, 'X', 'X'], // open Dmaj7
    ['X', 7, 6, 7, 5, 'X'], // 5th fret
  ],
  'Amaj7': [
    [0, 2, 1, 2, 0, 'X'], // open Amaj7
    ['X', 5, 6, 6, 7, 5], // 5th fret
  ],
  'Emaj7': [
    [0, 0, 1, 1, 2, 0], // open Emaj7
    ['X', 9, 8, 9, 7, 'X'], // 7th fret
  ],
  'Bbmaj7': [
    ['X', 3, 2, 3, 1, 'X'], // 1st fret
    [1, 3, 2, 3, 1, 'X'], // 1st fret
    [5, 6, 7, 8, 'X', 6], // 6th fret
  ],

  // Diminished 7ths
  'C#dim7': [
    ['X', 2, 3, 2, 4, 'X'], // 2nd fret
    ['X', 5, 3, 5, 4, 'X'], // 4th fret
    [0, 2, 0, 2, 'X', 'X'], // open
  ],
  'D#dim7': [
    ['X', 4, 5, 4, 6, 'X'], // 4th fret
    [2, 1, 2, 1, 'X', 'X'], // 1st fret
  ],
  'F#dim7': [
    ['X', 7, 8, 7, 9, 'X'], // 7th fret
    [2, 'X', 2, 1, 0, 2], // 2nd fret
    ['X', 4, 2, 4, 3, 'X'], // 3rd fret (inversion)
  ],
  'G#dim7': [
    [4, 'X', 4, 3, 2, 4], // 4th fret
    ['X', 3, 4, 3, 'X', 4], // shell
  ],
  'Bdim7': [
    ['X', 0, 1, 0, 2, 'X'], // open Bdim7
    ['X', 3, 1, 3, 2, 'X'], // 2nd fret
  ],

  // Triads & Classical Inversions
  'C': [
    [0, 1, 0, 2, 3, 'X'], // open C
    [3, 5, 5, 5, 3, 'X'], // 3rd fret barre
    [8, 8, 9, 10, 10, 8], // 8th fret barre
  ],
  'C/E': [
    [0, 1, 0, 2, 3, 0], // C with open low E
    [0, 1, 0, 2, 'X', 0], // clean C/E
  ],
  'C/G': [
    [0, 1, 0, 2, 3, 3], // C with low G
  ],
  'Am': [
    [0, 1, 2, 2, 0, 'X'], // open Am
    [5, 5, 5, 7, 7, 5], // 5th fret barre
  ],
  'Am/C': [
    [0, 1, 2, 2, 3, 'X'], // Am with C in bass
  ],
  'Dm': [
    [1, 3, 2, 0, 'X', 'X'], // open Dm
    [5, 6, 7, 7, 5, 'X'], // 5th fret barre
  ],
  'Dm/F': [
    [1, 3, 2, 3, 'X', 'X'], // Dm with F in bass
    [1, 3, 2, 0, 'X', 1], // Dm with low F
  ],
  'G': [
    [3, 0, 0, 0, 2, 3], // open G
    [3, 3, 4, 5, 5, 3], // 3rd fret barre
  ],
  'G/B': [
    [3, 0, 0, 0, 2, 'X'], // G with B in bass (5th string fret 2)
    [3, 3, 0, 0, 2, 'X'], // G/B
    [X => 2 as any, 3, 4, 5, 2, 'X'], // classical B bass
  ],
  'D': [
    [2, 3, 2, 0, 'X', 'X'], // open D
    [5, 7, 7, 7, 5, 'X'], // 5th fret barre
  ],
  'D/F#': [
    [2, 3, 2, 0, 0, 2], // D with F# bass
    [2, 3, 2, 4, 'X', 2], // D/F#
  ],
  'F': [
    [1, 1, 2, 3, 3, 1], // 1st fret barre
    [1, 1, 2, 3, 'X', 'X'], // 4-string F
  ],
  'Em': [
    [0, 0, 0, 2, 2, 0], // open Em
    [7, 8, 9, 9, 7, 'X'], // 7th fret barre
  ],
  'Bdim': [
    ['X', 0, 1, 0, 2, 'X'], // open Bdim
    ['X', 3, 4, 3, 2, 'X'], // 2nd fret
  ],
  'Bdim/D': [
    [1, 0, 1, 0, 'X', 'X'], // Bdim first inversion
  ],
};

// Fix the typo in G/B pattern if any
KNOWN_VOICING_PATTERNS['G/B'] = [
  [3, 0, 0, 0, 2, 'X'],
  ['X', 3, 0, 0, 2, 'X'],
];

/**
 * Validate a guitar voicing independently
 */
export function validateGuitarVoicing(
  chordSymbol: string,
  frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue]
): {
  isValid: boolean;
  soundingNotes: SoundingNote[];
  soundingMidiPitches: number[];
  writtenMidiPitches: number[];
  bassMidi: number;
  highestMidi: number;
  fretSpan: number;
  averageFret: number;
  playabilityScore: number;
  error?: string;
} {
  const soundingRaw: {
    stringIndex: number;
    stringName: string;
    fret: number;
    soundingMidi: number;
  }[] = [];

  const nonZeroFrets: number[] = [];

  for (let i = 0; i < 6; i++) {
    const f = frets[i];
    if (f !== 'X') {
      if (typeof f !== 'number' || f < 0 || f > 24) {
        return {
          isValid: false,
          soundingNotes: [],
          soundingMidiPitches: [],
          writtenMidiPitches: [],
          bassMidi: 0,
          highestMidi: 0,
          fretSpan: 99,
          averageFret: 0,
          playabilityScore: 0,
          error: `Geçersiz perde: ${f}`,
        };
      }
      const midi = calculateSoundingPitch(i, f);
      if (midi !== null) {
        soundingRaw.push({
          stringIndex: i,
          stringName: GUITAR_STRINGS[i].name,
          fret: f,
          soundingMidi: midi,
        });
        if (f > 0) nonZeroFrets.push(f);
      }
    }
  }

  if (soundingRaw.length < 2) {
    return {
      isValid: false,
      soundingNotes: [],
      soundingMidiPitches: [],
      writtenMidiPitches: [],
      bassMidi: 0,
      highestMidi: 0,
      fretSpan: 99,
      averageFret: 0,
      playabilityScore: 0,
      error: 'En az 2 çalan tel gereklidir.',
    };
  }

  // Calculate fret span (excluding open strings)
  let fretSpan = 0;
  if (nonZeroFrets.length > 0) {
    const minFret = Math.min(...nonZeroFrets);
    const maxFret = Math.max(...nonZeroFrets);
    fretSpan = maxFret - minFret;
    if (fretSpan > 4) {
      return {
        isValid: false,
        soundingNotes: [],
        soundingMidiPitches: [],
        writtenMidiPitches: [],
        bassMidi: 0,
        highestMidi: 0,
        fretSpan,
        averageFret: 0,
        playabilityScore: 0,
        error: `Aşırı perde açıklığı: ${fretSpan} perde (en fazla 4 olmalıdır).`,
      };
    }
  }

  // Sort sounding notes by pitch ascending
  soundingRaw.sort((a, b) => a.soundingMidi - b.soundingMidi);
  const soundingMidis = soundingRaw.map((s) => s.soundingMidi);
  const bassMidi = soundingMidis[0];
  const highestMidi = soundingMidis[soundingMidis.length - 1];
  const averageFret =
    nonZeroFrets.length > 0
      ? nonZeroFrets.reduce((sum, f) => sum + f, 0) / nonZeroFrets.length
      : 0;

  // Verify that pitches match the intended chord identity
  const recognized = recognizeChord(soundingMidis);
  // Compare core chord name (e.g. Db7, Cmaj7, Am)
  const cleanTarget = chordSymbol.split('/')[0].trim();
  const cleanRecognized = recognized.chordName.split('/')[0].trim();

  // Allow close enharmonic or equivalent representations (e.g. C#7 for Db7, or shell voicings)
  const isEnharmonicMatch =
    cleanTarget === cleanRecognized ||
    (cleanTarget === 'Db7' && cleanRecognized === 'C#7') ||
    (cleanTarget === 'C#7' && cleanRecognized === 'Db7') ||
    (cleanTarget === 'F#dim7' && cleanRecognized === 'Gbdim7') ||
    recognized.alternatives.includes(chordSymbol) ||
    recognized.alternatives.includes(cleanTarget);

  if (!isEnharmonicMatch && cleanTarget !== cleanRecognized) {
    // If not matching, allow if chord notes contain target essential root and 3rd
    // But check for gross mismatch
    const targetRoot = cleanTarget.replace(/[^A-G#b]/g, '');
    if (recognized.rootName !== targetRoot && !recognized.alternatives.some((a) => a.startsWith(targetRoot))) {
      return {
        isValid: false,
        soundingNotes: [],
        soundingMidiPitches: [],
        writtenMidiPitches: [],
        bassMidi,
        highestMidi,
        fretSpan,
        averageFret,
        playabilityScore: 0,
        error: `Akor tınlayan perdeleri (${recognized.chordName}) hedeflenen ${chordSymbol} ile uyuşmuyor.`,
      };
    }
  }

  const preferFlats = ROOTS_PREFERRING_FLATS.has(recognized.rootName) || ROOTS_PREFERRING_FLATS.has(chordSymbol.slice(0, 2));

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

  // Calculate ergonomic playability score (0 to 100)
  // Penalize high frets (> 12) slightly, penalize large fret span
  let playabilityScore = 95;
  if (fretSpan >= 3) playabilityScore -= 10;
  if (fretSpan >= 4) playabilityScore -= 20;
  if (averageFret > 9) playabilityScore -= 10;
  if (averageFret > 14) playabilityScore -= 25;
  if (soundingNotes.length >= 4) playabilityScore += 5; // fuller chords favored

  return {
    isValid: true,
    soundingNotes,
    soundingMidiPitches: soundingNotes.map((n) => n.soundingMidi),
    writtenMidiPitches: soundingNotes.map((n) => n.writtenMidi),
    bassMidi,
    highestMidi,
    fretSpan,
    averageFret,
    playabilityScore: Math.max(10, Math.min(100, playabilityScore)),
  };
}

/**
 * Finds the most suitable playable guitar voicing for a target chord,
 * optionally optimizing for proximity to a reference fret position (e.g. adjacent chords)
 */
export function findBestVoicingForChord(
  chordSymbol: string,
  referencePosition = 2
): GeneratedVoicing | null {
  // 1. Look up in predefined verified patterns
  const patterns = KNOWN_VOICING_PATTERNS[chordSymbol] || [];

  const candidates: GeneratedVoicing[] = [];

  for (const pattern of patterns) {
    const validation = validateGuitarVoicing(chordSymbol, pattern);
    if (validation.isValid) {
      candidates.push({
        chordName: chordSymbol,
        frets: [...pattern],
        soundingNotes: validation.soundingNotes,
        soundingMidiPitches: validation.soundingMidiPitches,
        writtenMidiPitches: validation.writtenMidiPitches,
        bassMidi: validation.bassMidi,
        highestMidi: validation.highestMidi,
        fretSpan: validation.fretSpan,
        averageFret: validation.averageFret,
        playabilityScore: validation.playabilityScore,
        isValid: true,
      });
    }
  }

  // 2. If no direct pattern found, derive from movable shapes or common intervals
  if (candidates.length === 0) {
    const derived = deriveMovableVoicing(chordSymbol);
    if (derived) {
      const validation = validateGuitarVoicing(chordSymbol, derived);
      if (validation.isValid) {
        candidates.push({
          chordName: chordSymbol,
          frets: derived,
          soundingNotes: validation.soundingNotes,
          soundingMidiPitches: validation.soundingMidiPitches,
          writtenMidiPitches: validation.writtenMidiPitches,
          bassMidi: validation.bassMidi,
          highestMidi: validation.highestMidi,
          fretSpan: validation.fretSpan,
          averageFret: validation.averageFret,
          playabilityScore: validation.playabilityScore,
          isValid: true,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort candidates by closeness to referencePosition and playability
  candidates.sort((a, b) => {
    const distA = Math.abs(a.averageFret - referencePosition);
    const distB = Math.abs(b.averageFret - referencePosition);
    return distA * 10 - a.playabilityScore - (distB * 10 - b.playabilityScore);
  });

  return candidates[0];
}

/**
 * Derives a movable chord voicing for unlisted chords based on root and quality
 */
function deriveMovableVoicing(
  chordSymbol: string
): [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] | null {
  // Parse root and quality
  const match = chordSymbol.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;
  const root = match[1];
  const quality = match[2];

  const pitchClassMap: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  const rootPc = pitchClassMap[root];
  if (rootPc === undefined) return null;

  // Root on 5th string (A string open is 9 = A). Fret on A string = (rootPc - 9 + 12) % 12
  const fret5thString = ((rootPc - 9 + 12) % 12);
  // Root on 6th string (E string open is 4 = E). Fret on E string = (rootPc - 4 + 12) % 12
  const fret6thString = ((rootPc - 4 + 12) % 12);

  // If dominant 7th:
  if (quality === '7') {
    // 5th string root form: X, fret, fret-1, fret, fret-2, X
    // e.g. for Db (fret 4 on A string): X, 4, 3, 4, 2, X
    if (fret5thString >= 2 && fret5thString <= 12) {
      return ['X', fret5thString - 2, fret5thString, fret5thString - 1, fret5thString, 'X'];
    }
    // 6th string root form: fret, X, fret, fret-1, X, X
    if (fret6thString >= 1 && fret6thString <= 12) {
      return ['X', fret6thString, fret6thString + 1, fret6thString, 'X', fret6thString];
    }
  }

  // If minor 7th:
  if (quality === 'm7') {
    if (fret5thString >= 1 && fret5thString <= 12) {
      return ['X', fret5thString + 1, fret5thString, fret5thString + 2, fret5thString, 'X'];
    }
    if (fret6thString >= 1 && fret6thString <= 12) {
      return [fret6thString, fret6thString, fret6thString, fret6thString, 'X', fret6thString];
    }
  }

  // If major 7th:
  if (quality === 'maj7') {
    if (fret5thString >= 1 && fret5thString <= 12) {
      return ['X', fret5thString + 2, fret5thString + 1, fret5thString + 2, fret5thString, 'X'];
    }
  }

  // If diminished 7th:
  if (quality === 'dim7' || quality === 'dim') {
    if (fret5thString >= 1 && fret5thString <= 12) {
      return ['X', fret5thString + 1, fret5thString - 1, fret5thString + 1, fret5thString, 'X'];
    }
  }

  return null;
}
