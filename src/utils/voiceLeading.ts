import { HarmonyProfile, VoiceLeadingEvaluation } from '../types.ts';
import { midiToPitchClass } from './spelling.ts';

/**
 * Calculates bipartite matching of upper voice pitches between two chords
 * to evaluate voice leading smoothness independently of guitar strings.
 */
function matchUpperVoices(
  voicesA: number[],
  voicesB: number[]
): {
  totalDisplacement: number;
  stepwiseCount: number;
  leapCount: number;
  commonTonesCount: number;
} {
  if (voicesA.length === 0 || voicesB.length === 0) {
    return { totalDisplacement: 0, stepwiseCount: 0, leapCount: 0, commonTonesCount: 0 };
  }

  // Work with copies sorted ascending
  const sortedA = [...voicesA].sort((a, b) => a - b);
  const sortedB = [...voicesB].sort((a, b) => a - b);

  let commonTonesCount = 0;
  let stepwiseCount = 0;
  let leapCount = 0;
  let totalDisplacement = 0;

  // Greedy closest assignment from A to B
  const availableB = [...sortedB];

  for (const pitchA of sortedA) {
    if (availableB.length === 0) break;

    // Find closest pitch in availableB
    let bestIdx = 0;
    let minDiff = Math.abs(availableB[0] - pitchA);

    for (let j = 1; j < availableB.length; j++) {
      const diff = Math.abs(availableB[j] - pitchA);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = j;
      }
    }

    totalDisplacement += minDiff;
    if (minDiff === 0) {
      commonTonesCount++;
    } else if (minDiff === 1 || minDiff === 2) {
      stepwiseCount++;
    } else if (minDiff > 4) {
      leapCount++;
    }

    availableB.splice(bestIdx, 1);
  }

  // Penalty for missing/surplus unmatched voices
  const voiceCountDiff = Math.abs(voicesA.length - voicesB.length);
  totalDisplacement += voiceCountDiff * 3;

  return { totalDisplacement, stepwiseCount, leapCount, commonTonesCount };
}

/**
 * Checks for parallel perfect fifths or octaves in classical voice leading
 */
function hasParallelFifthsOrOctaves(pitchesA: number[], pitchesB: number[]): boolean {
  if (pitchesA.length < 2 || pitchesB.length < 2) return false;

  const minLen = Math.min(pitchesA.length, pitchesB.length);
  for (let i = 0; i < minLen; i++) {
    for (let j = i + 1; j < minLen; j++) {
      const intervalA = Math.abs(pitchesA[i] - pitchesA[j]) % 12;
      const intervalB = Math.abs(pitchesB[i] - pitchesB[j]) % 12;

      // Perfect 5th is 7 semitones, octave is 0 semitones
      const isFifthOrOctaveA = intervalA === 7 || intervalA === 0;
      const isFifthOrOctaveB = intervalB === 7 || intervalB === 0;

      if (isFifthOrOctaveA && isFifthOrOctaveB && intervalA === intervalB) {
        const motionI = pitchesB[i] - pitchesA[i];
        const motionJ = pitchesB[j] - pitchesA[j];
        // Same direction and non-zero motion
        if (motionI !== 0 && motionI * motionJ > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Evaluates voice leading between two chords (Chord A -> Chord B)
 */
export function evaluateVoiceLeadingBetween(
  chordA_Pitches: number[],
  chordB_Pitches: number[],
  profile: HarmonyProfile
): VoiceLeadingEvaluation {
  if (!chordA_Pitches.length || !chordB_Pitches.length) {
    return {
      totalCost: 50,
      stepwiseMovementCount: 0,
      leapCount: 0,
      commonTonesCount: 0,
      bassMovementInterval: 0,
      bassMovementDescription: 'Belirsiz',
      summary: 'Yetersiz nota verisi.',
    };
  }

  const sortedA = [...chordA_Pitches].sort((a, b) => a - b);
  const sortedB = [...chordB_Pitches].sort((a, b) => a - b);

  const bassA = sortedA[0];
  const bassB = sortedB[0];
  const bassInterval = Math.abs(bassB - bassA);

  let bassMovementDescription = '';
  let bassCost = 0;

  if (bassInterval === 0) {
    bassMovementDescription = 'Durgun bas (Ortak bas sesi)';
    bassCost = 0;
  } else if (bassInterval === 1) {
    bassMovementDescription = bassB < bassA ? 'Yarım ton iniş (Kromatik)' : 'Yarım ton çıkış (Kromatik)';
    bassCost = 2;
  } else if (bassInterval === 2) {
    bassMovementDescription = bassB < bassA ? 'Tam ton bas inişi' : 'Tam ton bas çıkışı';
    bassCost = 3;
  } else if (bassInterval === 5 || bassInterval === 7) {
    bassMovementDescription = '5li / 4lü bas döngüsü kadansı';
    bassCost = 3;
  } else if (bassInterval <= 4) {
    bassMovementDescription = `${bassInterval} yarım ton bas adımı`;
    bassCost = 5;
  } else {
    bassMovementDescription = `${bassInterval} yarım ton bas sıçraması`;
    bassCost = Math.min(18, bassInterval * 2);
  }

  // Upper voices (all notes except bass)
  const upperA = sortedA.slice(1);
  const upperB = sortedB.slice(1);
  const upperMatch = matchUpperVoices(upperA, upperB);

  let totalCost =
    bassCost +
    upperMatch.totalDisplacement * 1.5 +
    upperMatch.leapCount * 6 -
    upperMatch.commonTonesCount * 4;

  let guideToneResolution: string | undefined;
  let parallelFifthsOctaves = false;

  if (profile === 'jazz') {
    // Jazz: Check guide tone resolution (3rds and 7ths)
    // E.g. in G7 -> Cmaj7 or Db7 -> Cmaj7, 3rd (F/B) moves to (E/C)
    const pcA = sortedA.map(midiToPitchClass);
    const pcB = sortedB.map(midiToPitchClass);

    // If tritone substitution half-step bass motion
    if (bassInterval === 1 && bassB < bassA) {
      totalCost -= 8; // bonus for chromatic descent
      guideToneResolution = 'Kromatik bas inişi ve rehber ses (guide-tone) pürüzsüzlüğü';
    } else if (upperMatch.commonTonesCount >= 2) {
      totalCost -= 5;
      guideToneResolution = '2+ ortak ses korunumu';
    }
  } else {
    // Classical: Check parallel 5ths/octaves
    parallelFifthsOctaves = hasParallelFifthsOrOctaves(sortedA, sortedB);
    if (parallelFifthsOctaves) {
      totalCost += 20; // Classical strictness penalty
    }

    if (bassInterval === 1 || bassInterval === 2) {
      totalCost -= 5; // Stepwise bass line bonus in classical
    }
  }

  totalCost = Math.max(0, Math.round(totalCost));

  const summary = `${bassMovementDescription}. ${upperMatch.commonTonesCount} ortak ses, ${upperMatch.stepwiseCount} basamaklı adım${
    upperMatch.leapCount > 0 ? `, ${upperMatch.leapCount} sıçrama` : ''
  }.`;

  return {
    totalCost,
    stepwiseMovementCount: upperMatch.stepwiseCount,
    leapCount: upperMatch.leapCount,
    commonTonesCount: upperMatch.commonTonesCount,
    bassMovementInterval: bassInterval,
    bassMovementDescription,
    guideToneResolution,
    parallelFifthsOctaves,
    summary,
  };
}

/**
 * Combines voice leading evaluation for passing chords:
 * Total Cost = cost(Chord A -> Candidate) + cost(Candidate -> Chord B)
 */
export function evaluatePassingChordVoiceLeading(
  chordA_Pitches: number[],
  candidatePitches: number[],
  chordB_Pitches: number[],
  profile: HarmonyProfile
): VoiceLeadingEvaluation {
  const step1 = evaluateVoiceLeadingBetween(chordA_Pitches, candidatePitches, profile);
  const step2 = evaluateVoiceLeadingBetween(candidatePitches, chordB_Pitches, profile);

  const combinedCost = step1.totalCost + step2.totalCost;
  const stepwise = step1.stepwiseMovementCount + step2.stepwiseMovementCount;
  const leaps = step1.leapCount + step2.leapCount;
  const common = step1.commonTonesCount + step2.commonTonesCount;
  const parallel = step1.parallelFifthsOctaves || step2.parallelFifthsOctaves;

  const summary = `Geçiş Hattı: ${step1.bassMovementDescription} → ${step2.bassMovementDescription}. Toplam ${common} ortak ses, ${stepwise} basamaklı hareket.`;

  return {
    totalCost: combinedCost,
    stepwiseMovementCount: stepwise,
    leapCount: leaps,
    commonTonesCount: common,
    bassMovementInterval: step1.bassMovementInterval + step2.bassMovementInterval,
    bassMovementDescription: `${step1.bassMovementDescription} → ${step2.bassMovementDescription}`,
    guideToneResolution: step1.guideToneResolution || step2.guideToneResolution,
    parallelFifthsOctaves: parallel,
    summary,
  };
}
