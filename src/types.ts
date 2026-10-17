export type FretValue = number | 'X'; // 0-24, or 'X' for muted

export type StringAssignment = FretValue | null;

// Guitar strings ordered from String 1 (high e) to String 6 (low E)
// Index 0: high e
// Index 1: B
// Index 2: G
// Index 3: D
// Index 4: A
// Index 5: low E
export type SixStrings = [
  StringAssignment,
  StringAssignment,
  StringAssignment,
  StringAssignment,
  StringAssignment,
  StringAssignment
];

export interface GuitarStringInfo {
  index: number; // 0 to 5
  stringNumber: number; // 1 to 6
  name: string; // 'e', 'B', 'G', 'D', 'A', 'E'
  turkishName: string; // '1. Tel (İnce mi)', etc.
  openMidi: number; // sounding MIDI: 64, 59, 55, 50, 45, 40
  openPitchName: string; // 'E4', 'B3', 'G3', 'D3', 'A2', 'E2'
}

export interface SoundingNote {
  stringIndex: number;
  stringName: string;
  fret: number;
  soundingMidi: number;
  soundingPitchName: string; // e.g. 'E4'
  writtenMidi: number;
  writtenPitchName: string; // e.g. 'E5'
  vexKey: string; // e.g. 'e/5'
  accidental: string | null; // e.g. '#', 'b', null
}

export interface ChordRecognitionResult {
  rootName: string;
  quality: string;
  chordName: string; // e.g. 'Am', 'C', 'G7'
  bassPitchName: string; // e.g. 'A2'
  isSlashChord: boolean;
  slashBassName?: string;
  confidence: 'high' | 'medium' | 'ambiguous';
  isAmbiguous: boolean;
  alternatives: string[];
  explanation: string;
}

export interface ChordEvent {
  id: string;
  strings: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue];
  soundingNotes: SoundingNote[]; // in ascending pitch order for VexFlow
  soundingMidiPitches: number[];
  writtenMidiPitches: number[];
  noteSpellings: string[]; // Sounding names, e.g. ['A2', 'E3', 'A3', 'C4', 'E4']
  writtenSpellings: string[]; // Written names, e.g. ['A3', 'E4', 'A4', 'C5', 'E5']
  vexKeys: string[]; // e.g. ['a/3', 'e/4', 'a/4', 'c/5', 'e/5']
  vexAccidentals: { index: number; acc: string }[];
  recognizedChord: ChordRecognitionResult;
  manualChordName?: string;
  effectiveChordName: string; // manualChordName || recognizedChord.chordName
  duration: string; // default 'q' (quarter note)
  durationLabel: string; // '1/4 (Dörtlük)'
  measureIndex: number; // 0-based
  beatIndex: number; // 0..3 in 4/4
  createdAt: number;
}

export interface ProjectState {
  chords: ChordEvent[];
  selectedChordId: string | null;
  timeSignature: '4/4';
}

export type HarmonyProfile = 'jazz' | 'classical';
export type HarmonyPreference = 'conservative' | 'balanced' | 'adventurous';

export interface VoiceLeadingEvaluation {
  totalCost: number;
  stepwiseMovementCount: number;
  leapCount: number;
  commonTonesCount: number;
  bassMovementInterval: number; // semitones moved
  bassMovementDescription: string; // Turkish description
  guideToneResolution?: string;
  parallelFifthsOctaves?: boolean;
  summary: string;
}

export interface ChordCandidate {
  id: string;
  chordName: string;
  frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue];
  soundingNotes: SoundingNote[];
  soundingMidiPitches: number[];
  writtenMidiPitches: number[];
  ruleId: string;
  ruleName: string;
  profile: HarmonyProfile;
  explanation: string;
  musicalEffect: string;
  voiceLeading: VoiceLeadingEvaluation;
  score: number; // 0 to 100
  rating: 'Mükemmel' | 'Çok İyi' | 'İyi' | 'Uyumlu';
  isPassingChord: boolean;
  category: 'conventional' | 'colorful' | 'adventurous';
}

export interface SelectedGap {
  afterChordIndex: number;
  chordBefore: ChordEvent;
  chordAfter: ChordEvent;
}
