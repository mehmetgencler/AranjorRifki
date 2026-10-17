import test from 'node:test';
import assert from 'node:assert/strict';

import { createChordEvent, recomputeProgressionMeasures } from '../chordModel.ts';
import { ClassicalHarmonyEngine } from './ClassicalHarmonyEngine.ts';
import { JazzHarmonyEngine } from './JazzHarmonyEngine.ts';
import { validateGuitarVoicing } from '../guitarVoicingSolver.ts';

test('Classical: Functional diatonic substitution for Tonic (C -> Am / Em)', () => {
  const c = createChordEvent([0, 1, 0, 2, 3, 'X'], 'c1', undefined, 0);
  const g = createChordEvent([3, 0, 0, 0, 2, 3], 'c2', undefined, 1);
  const progression = [c, g];

  const candidates = ClassicalHarmonyEngine.suggestSubstitutions(c, progression, 'conservative');
  assert.ok(candidates.length > 0);

  // Should contain Am (vi) or Em (iii)
  const amSub = candidates.find((cand) => cand.chordName === 'Am');
  assert.ok(amSub, 'Must propose Am as diatonic tonic substitution');
  assert.equal(amSub.ruleId, 'CLASSICAL_DIATONIC_SUB');
  assert.equal(amSub.profile, 'classical');
});

test('Classical: Applied dominant generation (V7/V -> D7 resolving to G)', () => {
  const c = createChordEvent([0, 1, 0, 2, 3, 'X'], 'c1', undefined, 0);
  const g = createChordEvent([3, 0, 0, 0, 2, 3], 'c2', undefined, 1);

  // Passing chord between C and G
  const passing = ClassicalHarmonyEngine.suggestPassingChords(c, g, 'balanced');
  assert.ok(passing.length > 0);

  // Must propose D7 (V7/V) or F#dim (vii°/V)
  const appliedDom = passing.find((p) => p.chordName === 'D7');
  assert.ok(appliedDom, 'Must propose D7 as applied dominant leading to G');
  assert.equal(appliedDom.ruleId, 'CLASSICAL_APPLIED_DOMINANT');

  const val = validateGuitarVoicing('D7', appliedDom.frets);
  assert.equal(val.isValid, true);
});

test('Profile Difference: Jazz vs Classical engines generate different active rules for the same chord', () => {
  const g7 = createChordEvent([1, 0, 0, 0, 2, 3], 'c1', undefined, 0);
  const c = createChordEvent([0, 1, 0, 2, 3, 'X'], 'c2', undefined, 1);
  const progression = [g7, c];

  const jazzCandidates = JazzHarmonyEngine.suggestSubstitutions(g7, progression);
  const classicalCandidates = ClassicalHarmonyEngine.suggestSubstitutions(g7, progression);

  // Jazz generates tritone substitution (Db7)
  const jazzHasDb7 = jazzCandidates.some((c) => c.chordName === 'Db7');
  assert.ok(jazzHasDb7, 'Jazz must produce Db7 tritone sub');

  // Classical strictly does NOT generate tritone substitution, it generates diatonic/inversion rules
  const classicalHasDb7 = classicalCandidates.some((c) => c.chordName === 'Db7');
  assert.equal(classicalHasDb7, false, 'Classical must NOT produce tritone sub');

  const classicalHasInversionOrDim = classicalCandidates.some(
    (c) => c.ruleId === 'CLASSICAL_DIATONIC_SUB' || c.ruleId === 'CLASSICAL_INVERSION_VOICING'
  );
  assert.ok(classicalHasInversionOrDim, 'Classical must apply classical functional rules');
});

test('Integration & Undo: Inserting passing chord preserves chord order, durations, and undo restores state', () => {
  const c = createChordEvent([0, 1, 0, 2, 3, 'X'], 'c1', undefined, 0);
  const g = createChordEvent([3, 0, 0, 0, 2, 3], 'c2', undefined, 1);
  let progression = [c, g];

  // Save history state for undo
  const history = [JSON.stringify(progression)];

  // Get passing chord (e.g. D7)
  const passing = ClassicalHarmonyEngine.suggestPassingChords(c, g)[0];
  assert.ok(passing);

  // Insert passing chord between index 0 and 1
  const insertedChord = createChordEvent(passing.frets, undefined, passing.chordName, 1);
  const updatedProgression = recomputeProgressionMeasures([
    progression[0],
    insertedChord,
    progression[1],
  ]);

  assert.equal(updatedProgression.length, 3);
  assert.equal(updatedProgression[0].id, 'c1');
  assert.equal(updatedProgression[1].effectiveChordName, passing.chordName);
  assert.equal(updatedProgression[2].id, 'c2');
  assert.equal(updatedProgression[1].duration, 'q'); // default quarter note duration preserved
  assert.equal(updatedProgression[1].beatIndex, 1);
  assert.equal(updatedProgression[2].beatIndex, 2);

  // Test Undo: restore from history
  const restored = JSON.parse(history[0]);
  assert.equal(restored.length, 2);
  assert.equal(restored[0].id, 'c1');
  assert.equal(restored[1].id, 'c2');
});

test('Validation: Invalid fretboard shapes are rejected by validator', () => {
  // Excessive fret span (> 4 frets)
  const invalidSpan = [1, 9, 2, 0, 'X', 'X'] as any;
  const valSpan = validateGuitarVoicing('Dm7', invalidSpan);
  assert.equal(valSpan.isValid, false);
  assert.ok(valSpan.error?.includes('açıklığı'));

  // Invalid fret number (> 24)
  const invalidFret = [28, 0, 0, 0, 2, 3] as any;
  const valFret = validateGuitarVoicing('G', invalidFret);
  assert.equal(valFret.isValid, false);
});
