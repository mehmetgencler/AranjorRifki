import test from 'node:test';
import assert from 'node:assert/strict';

import { createChordEvent } from '../chordModel.ts';
import { JazzHarmonyEngine } from './JazzHarmonyEngine.ts';
import { validateGuitarVoicing } from '../guitarVoicingSolver.ts';
import { calculateSoundingPitch } from '../pitch.ts';

test('Jazz: Dm7 | G7 | Cmaj7 generates Db7 as a tritone substitute for G7', () => {
  // 1. Set up Dm7, G7, Cmaj7
  const dm7 = createChordEvent([1, 1, 2, 0, 'X', 'X'], 'c1', undefined, 0);
  const g7 = createChordEvent([1, 0, 0, 0, 2, 3], 'c2', undefined, 1);
  const cmaj7 = createChordEvent([0, 0, 0, 2, 3, 'X'], 'c3', undefined, 2);

  const progression = [dm7, g7, cmaj7];

  assert.equal(dm7.effectiveChordName, 'Dm7');
  assert.equal(g7.effectiveChordName, 'G7');
  assert.equal(cmaj7.effectiveChordName, 'Cmaj7');

  // 2. Request substitutions for G7
  const candidates = JazzHarmonyEngine.suggestSubstitutions(g7, progression, 'adventurous');
  assert.ok(candidates.length > 0, 'Should return candidate substitutions');

  // 3. Find the Db7 tritone substitute
  const db7Candidate = candidates.find((c) => c.chordName === 'Db7');
  assert.ok(db7Candidate, 'Must generate Db7 as a tritone substitute');
  assert.equal(db7Candidate.ruleId, 'JAZZ_TRITONE_SUB');

  // 4. Verify that the output voicing actually represents Db7
  const validation = validateGuitarVoicing('Db7', db7Candidate.frets);
  assert.equal(validation.isValid, true, 'Db7 voicing must be valid and playable');

  // Check that sounding pitches match the guitar tab
  for (let i = 0; i < 6; i++) {
    const f = db7Candidate.frets[i];
    if (f !== 'X') {
      const midi = calculateSoundingPitch(i, f);
      assert.ok(midi !== null);
      assert.ok(db7Candidate.soundingMidiPitches.includes(midi));
    }
  }

  // 5. Verify voice leading against final Cmaj7 voicing
  assert.ok(db7Candidate.voiceLeading, 'Must evaluate voice leading against context');
  assert.ok(db7Candidate.score > 50, 'Score must reflect high viability');
  assert.equal(db7Candidate.profile, 'jazz');
});

test('Jazz: Passing chord generation between Dm7 and Cmaj7', () => {
  const dm7 = createChordEvent([1, 1, 2, 0, 'X', 'X'], 'c1', undefined, 0);
  const cmaj7 = createChordEvent([0, 0, 0, 2, 3, 'X'], 'c2', undefined, 1);

  const passing = JazzHarmonyEngine.suggestPassingChords(dm7, cmaj7, 'balanced');
  assert.ok(passing.length > 0, 'Should generate passing chords');

  // Should include secondary dominant G7 or tritone Db7
  const hasG7orDb7 = passing.some((p) => p.chordName === 'G7' || p.chordName === 'Db7');
  assert.ok(hasG7orDb7, 'Must suggest G7 or Db7 passing between ii and I');

  // Every suggested passing chord must have valid playable voicing
  for (const p of passing) {
    const val = validateGuitarVoicing(p.chordName, p.frets);
    assert.equal(val.isValid, true, `Passing chord ${p.chordName} must be playable`);
  }
});
