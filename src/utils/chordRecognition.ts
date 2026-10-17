import { ChordRecognitionResult } from '../types.ts';
import {
  SHARP_PITCH_CLASSES,
  FLAT_PITCH_CLASSES,
  ROOTS_PREFERRING_FLATS,
  midiToPitchClass,
  midiToPitchName,
} from './spelling.ts';

interface ChordTemplate {
  quality: string; // e.g. 'major', 'minor', 'dominant7', etc.
  symbol: string; // e.g. '', 'm', '7', 'maj7', 'm7', etc.
  turkishQuality: string;
  intervals: number[]; // semitones from root
  essentialIntervals: number[]; // tones that should be present
  optionalIntervals?: number[]; // e.g. 5th in 7th chord
  baseBonus: number;
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  // Triads
  {
    quality: 'major',
    symbol: '',
    turkishQuality: 'Majör',
    intervals: [0, 4, 7],
    essentialIntervals: [0, 4],
    baseBonus: 20,
  },
  {
    quality: 'minor',
    symbol: 'm',
    turkishQuality: 'Minör',
    intervals: [0, 3, 7],
    essentialIntervals: [0, 3],
    baseBonus: 20,
  },
  {
    quality: 'power',
    symbol: '5',
    turkishQuality: 'Power (5li)',
    intervals: [0, 7],
    essentialIntervals: [0, 7],
    baseBonus: 10,
  },
  {
    quality: 'sus4',
    symbol: 'sus4',
    turkishQuality: 'Askıda 4lü (sus4)',
    intervals: [0, 5, 7],
    essentialIntervals: [0, 5],
    baseBonus: 12,
  },
  {
    quality: 'sus2',
    symbol: 'sus2',
    turkishQuality: 'Askıda 2li (sus2)',
    intervals: [0, 2, 7],
    essentialIntervals: [0, 2],
    baseBonus: 12,
  },
  {
    quality: 'diminished',
    symbol: 'dim',
    turkishQuality: 'Eksilmiş (dim)',
    intervals: [0, 3, 6],
    essentialIntervals: [0, 3, 6],
    baseBonus: 8,
  },
  {
    quality: 'augmented',
    symbol: 'aug',
    turkishQuality: 'Artmış (aug)',
    intervals: [0, 4, 8],
    essentialIntervals: [0, 4, 8],
    baseBonus: 8,
  },

  // Seventh chords
  {
    quality: 'dominant7',
    symbol: '7',
    turkishQuality: 'Dominant 7li',
    intervals: [0, 4, 7, 10],
    essentialIntervals: [0, 4, 10],
    optionalIntervals: [7],
    baseBonus: 18,
  },
  {
    quality: 'major7',
    symbol: 'maj7',
    turkishQuality: 'Majör 7li',
    intervals: [0, 4, 7, 11],
    essentialIntervals: [0, 4, 11],
    optionalIntervals: [7],
    baseBonus: 18,
  },
  {
    quality: 'minor7',
    symbol: 'm7',
    turkishQuality: 'Minör 7li',
    intervals: [0, 3, 7, 10],
    essentialIntervals: [0, 3, 10],
    optionalIntervals: [7],
    baseBonus: 18,
  },
  {
    quality: 'halfDiminished7',
    symbol: 'm7b5',
    turkishQuality: 'Yarı Eksilmiş 7li (m7b5)',
    intervals: [0, 3, 6, 10],
    essentialIntervals: [0, 3, 6, 10],
    baseBonus: 12,
  },
  {
    quality: 'diminished7',
    symbol: 'dim7',
    turkishQuality: 'Tam Eksilmiş 7li (dim7)',
    intervals: [0, 3, 6, 9],
    essentialIntervals: [0, 3, 6, 9],
    baseBonus: 12,
  },
];

interface ScoredCandidate {
  chordName: string;
  rootName: string;
  rootPc: number;
  quality: string;
  turkishQuality: string;
  score: number;
  bassPitchName: string;
  isSlashChord: boolean;
  slashBassName?: string;
  explanation: string;
}

/**
 * Recognize chord from sounding MIDI pitches
 */
export function recognizeChord(soundingMidis: number[]): ChordRecognitionResult {
  if (!soundingMidis || soundingMidis.length === 0) {
    return {
      rootName: '-',
      quality: 'none',
      chordName: 'Sessiz',
      bassPitchName: '-',
      isSlashChord: false,
      confidence: 'ambiguous',
      isAmbiguous: true,
      alternatives: [],
      explanation: 'Herhangi bir ses çalmıyor.',
    };
  }

  // Find lowest sounding pitch (bass note)
  const sortedMidis = [...soundingMidis].sort((a, b) => a - b);
  const bassMidi = sortedMidis[0];
  const bassPc = midiToPitchClass(bassMidi);
  const bassPitchName = midiToPitchName(bassMidi);

  // Set of unique pitch classes present in voicing
  const uniquePcs = Array.from(new Set(sortedMidis.map((m) => midiToPitchClass(m))));

  // Handle single note
  if (uniquePcs.length === 1) {
    const rootName = SHARP_PITCH_CLASSES[uniquePcs[0]];
    return {
      rootName,
      quality: 'singleNote',
      chordName: `${rootName} (Tek Ses)`,
      bassPitchName,
      isSlashChord: false,
      confidence: 'high',
      isAmbiguous: false,
      alternatives: [],
      explanation: `Yalnızca tek bir nota tınlıyor: ${bassPitchName}`,
    };
  }

  const candidates: ScoredCandidate[] = [];

  // Evaluate each of the 12 pitch classes as a potential root
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    // Relative intervals of played voicing with respect to this candidate root
    const voicingIntervals = new Set(uniquePcs.map((pc) => ((pc - rootPc) + 12) % 12));

    for (const template of CHORD_TEMPLATES) {
      const templateIntervalSet = new Set(template.intervals);
      let score = template.baseBonus;

      // 1. Check essential intervals
      let missingEssential = false;
      for (const ess of template.essentialIntervals) {
        if (!voicingIntervals.has(ess)) {
          missingEssential = true;
          score -= 35;
        } else {
          score += 20;
        }
      }

      // Check all template intervals
      for (const tInt of template.intervals) {
        if (voicingIntervals.has(tInt)) {
          score += 15;
        }
      }

      // 2. Penalize extra notes in voicing not in template
      let extraNotesCount = 0;
      for (const vInt of voicingIntervals) {
        if (!templateIntervalSet.has(vInt)) {
          extraNotesCount++;
          score -= 30;
        }
      }

      // If voicing has essential notes and no extra notes, big match bonus
      if (!missingEssential && extraNotesCount === 0) {
        score += 45;
      }

      // 3. Bass note relationship
      const isRootInBass = bassPc === rootPc;
      let isSlash = false;
      let slashBassName: string | undefined;

      if (isRootInBass) {
        score += 35; // strong preference for root position chords
      } else {
        // It's an inversion if bass note is in the template intervals
        const bassInterval = ((bassPc - rootPc) + 12) % 12;
        if (templateIntervalSet.has(bassInterval)) {
          score += 12; // Inversion bonus
          isSlash = true;
          slashBassName = SHARP_PITCH_CLASSES[bassPc];
        } else {
          score -= 20; // Bass note isn't even in chord
        }
      }

      // 4. Note doublings (standard guitar voicings have octave doublings)
      score += sortedMidis.length * 2;

      // Select root spelling (sharp vs flat)
      const sharpRoot = SHARP_PITCH_CLASSES[rootPc];
      const flatRoot = FLAT_PITCH_CLASSES[rootPc];
      const preferFlats = ROOTS_PREFERRING_FLATS.has(sharpRoot) || ROOTS_PREFERRING_FLATS.has(flatRoot);
      const rootName = preferFlats ? flatRoot : sharpRoot;

      let chordName = `${rootName}${template.symbol}`;
      if (isSlash && slashBassName) {
        chordName = `${chordName}/${slashBassName}`;
      }

      const explanation = `${rootName} ${template.turkishQuality}${isSlash ? ` (${slashBassName} baslı)` : ''}`;

      candidates.push({
        chordName,
        rootName,
        rootPc,
        quality: template.quality,
        turkishQuality: template.turkishQuality,
        score,
        bassPitchName,
        isSlashChord: isSlash,
        slashBassName,
        explanation,
      });
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Filter distinct chord names
  const uniqueCandidates: ScoredCandidate[] = [];
  const seenNames = new Set<string>();
  for (const c of candidates) {
    if (!seenNames.has(c.chordName)) {
      seenNames.add(c.chordName);
      uniqueCandidates.push(c);
    }
  }

  const top = uniqueCandidates[0];
  const second = uniqueCandidates[1];

  // Ambiguity evaluation:
  // If difference between top and second is small (<= 8 points) and second has decent score (> 40)
  const isAmbiguous = second && top.score - second.score <= 8 && second.score >= 40;
  const confidence: 'high' | 'medium' | 'ambiguous' = isAmbiguous
    ? 'ambiguous'
    : top.score >= 80
      ? 'high'
      : 'medium';

  const alternatives = uniqueCandidates
    .slice(1, 4)
    .filter((c) => c.score >= top.score - 20)
    .map((c) => c.chordName);

  return {
    rootName: top.rootName,
    quality: top.quality,
    chordName: top.chordName,
    bassPitchName: top.bassPitchName,
    isSlashChord: top.isSlashChord,
    slashBassName: top.slashBassName,
    confidence,
    isAmbiguous,
    alternatives,
    explanation: top.explanation,
  };
}
