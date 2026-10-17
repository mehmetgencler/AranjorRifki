import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSoundingPitch,
  calculateWrittenPitch,
  validateSixStrings,
} from './pitch.ts';
import { recognizeChord } from './chordRecognition.ts';
import {
  createChordEvent,
  recomputeProgressionMeasures,
  saveProgressionToStorage,
  loadProgressionFromStorage,
} from './chordModel.ts';
import { FretValue, ChordEvent } from '../types.ts';

// ---------------------------------------------------------
// 1. Pitch Calculation Tests
// ---------------------------------------------------------
test('Pitch calculation: Open low E produces MIDI 40', () => {
  // String 6 (low E) has index 5 in our 0-5 high-to-low scheme
  const pitch = calculateSoundingPitch(5, 0);
  assert.equal(pitch, 40);
});

test('Pitch calculation: Low E string, fret 3 produces MIDI 43', () => {
  const pitch = calculateSoundingPitch(5, 3);
  assert.equal(pitch, 43);
});

test('Pitch calculation: Open high E produces MIDI 64', () => {
  // String 1 (high e) has index 0
  const pitch = calculateSoundingPitch(0, 0);
  assert.equal(pitch, 64);
});

test('Pitch calculation: A muted string generates no note', () => {
  const pitch = calculateSoundingPitch(5, 'X');
  assert.equal(pitch, null);
});

test('Pitch calculation: Written guitar pitch is handled exactly one octave above sounding pitch', () => {
  const soundingLowE = calculateSoundingPitch(5, 0)!; // 40
  const writtenLowE = calculateWrittenPitch(soundingLowE);
  assert.equal(writtenLowE, 52);
  assert.equal(writtenLowE - soundingLowE, 12);

  const soundingHighE = calculateSoundingPitch(0, 0)!; // 64
  const writtenHighE = calculateWrittenPitch(soundingHighE);
  assert.equal(writtenHighE, 76);
  assert.equal(writtenHighE - soundingHighE, 12);
});

// ---------------------------------------------------------
// 2. Chord Recognition Tests
// ---------------------------------------------------------
test('Chord recognition: A minor guitar shape [0, 1, 2, 2, 0, X]', () => {
  // Shape from high E (index 0) to low E (index 5):
  // e: 0 -> E4 (64)
  // B: 1 -> C4 (60)
  // G: 2 -> A3 (57)
  // D: 2 -> E3 (52)
  // A: 0 -> A2 (45)
  // E: X -> muted
  const frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [
    0, 1, 2, 2, 0, 'X',
  ];

  const soundingMidis: number[] = [];
  const noteNamesFromHighToLow: string[] = [];

  for (let i = 0; i < 6; i++) {
    const f = frets[i];
    if (f !== 'X') {
      const midi = calculateSoundingPitch(i, f)!;
      soundingMidis.push(midi);
    }
  }

  // Check sounding pitches in high-to-low order
  // e (0) -> 64 (E4)
  // B (1) -> 60 (C4)
  // G (2) -> 57 (A3)
  // D (2) -> 52 (E3)
  // A (0) -> 45 (A2)
  assert.deepEqual(soundingMidis, [64, 60, 57, 52, 45]);

  const chord = recognizeChord(soundingMidis);
  assert.equal(chord.chordName, 'Am');
  assert.equal(chord.rootName, 'A');
  assert.equal(chord.quality, 'minor');
});

test('Chord recognition: Major shape (C major: [0, 1, 0, 2, 3, X])', () => {
  const frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [
    0, 1, 0, 2, 3, 'X',
  ];
  const soundingMidis = frets
    .map((f, i) => (f !== 'X' ? calculateSoundingPitch(i, f) : null))
    .filter((p): p is number => p !== null);

  const chord = recognizeChord(soundingMidis);
  assert.equal(chord.chordName, 'C');
  assert.equal(chord.rootName, 'C');
  assert.equal(chord.quality, 'major');
});

test('Chord recognition: Dominant 7th shape (G7: [1, 0, 0, 0, 2, 3])', () => {
  const frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [
    1, 0, 0, 0, 2, 3,
  ];
  const soundingMidis = frets
    .map((f, i) => (f !== 'X' ? calculateSoundingPitch(i, f) : null))
    .filter((p): p is number => p !== null);

  const chord = recognizeChord(soundingMidis);
  assert.equal(chord.chordName, 'G7');
  assert.equal(chord.rootName, 'G');
  assert.equal(chord.quality, 'dominant7');
});

test('Chord recognition: Major 7th shape (Cmaj7: [0, 0, 0, 2, 3, X])', () => {
  const frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [
    0, 0, 0, 2, 3, 'X',
  ];
  const soundingMidis = frets
    .map((f, i) => (f !== 'X' ? calculateSoundingPitch(i, f) : null))
    .filter((p): p is number => p !== null);

  const chord = recognizeChord(soundingMidis);
  assert.equal(chord.chordName, 'Cmaj7');
  assert.equal(chord.rootName, 'C');
  assert.equal(chord.quality, 'major7');
});

test('Chord recognition: Minor 7th shape (Em7: [0, 3, 0, 2, 2, 0])', () => {
  const frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [
    0, 3, 0, 2, 2, 0,
  ];
  const soundingMidis = frets
    .map((f, i) => (f !== 'X' ? calculateSoundingPitch(i, f) : null))
    .filter((p): p is number => p !== null);

  const chord = recognizeChord(soundingMidis);
  assert.equal(chord.chordName, 'Em7');
});

// ---------------------------------------------------------
// 3. Editing, Progression and Measure Boundary Tests
// ---------------------------------------------------------
test('Validation: Incomplete input is rejected', () => {
  // One string unassigned (null)
  const incompleteInput = [0, 1, 2, null, 0, 'X'];
  const res = validateSixStrings(incompleteInput as any);
  assert.equal(res.valid, false);

  // All muted is rejected
  const allMuted = ['X', 'X', 'X', 'X', 'X', 'X'] as FretValue[];
  const resAllMuted = validateSixStrings(allMuted);
  assert.equal(resAllMuted.valid, false);
});

test('Validation: Complete valid input is accepted', () => {
  const valid = [0, 1, 2, 2, 0, 'X'] as FretValue[];
  const res = validateSixStrings(valid);
  assert.equal(res.valid, true);
});

test('Chord Event: Creates complete model and omits muted strings', () => {
  const frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [
    0, 1, 2, 2, 0, 'X',
  ];
  const event = createChordEvent(frets, 'test_1', undefined, 0);

  assert.equal(event.id, 'test_1');
  assert.equal(event.soundingNotes.length, 5); // 6 minus 1 muted string = 5
  assert.equal(event.soundingMidiPitches.length, 5);
  assert.equal(event.writtenMidiPitches.length, 5);

  // Sounding ascending: A2(45), E3(52), A3(57), C4(60), E4(64)
  assert.deepEqual(event.soundingMidiPitches, [45, 52, 57, 60, 64]);
  // Written ascending: A3(57), E4(64), A4(69), C5(72), E5(76)
  assert.deepEqual(event.writtenMidiPitches, [57, 64, 69, 72, 76]);

  // Vex keys should correspond to written notes
  assert.deepEqual(event.vexKeys, ['a/3', 'e/4', 'a/4', 'c/5', 'e/5']);
});

test('Progression: Measure boundaries after every four quarter-note chords', () => {
  const fretsAm: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] = [0, 1, 2, 2, 0, 'X'];
  const chords: ChordEvent[] = [];

  for (let i = 0; i < 9; i++) {
    chords.push(createChordEvent(fretsAm, `chord_${i}`, undefined, i));
  }

  const updated = recomputeProgressionMeasures(chords);

  // Check 1st measure (index 0): chords 0, 1, 2, 3
  assert.equal(updated[0].measureIndex, 0);
  assert.equal(updated[0].beatIndex, 0);
  assert.equal(updated[3].measureIndex, 0);
  assert.equal(updated[3].beatIndex, 3);

  // Check 2nd measure (index 1): chords 4, 5, 6, 7
  assert.equal(updated[4].measureIndex, 1);
  assert.equal(updated[4].beatIndex, 0);
  assert.equal(updated[7].measureIndex, 1);
  assert.equal(updated[7].beatIndex, 3);

  // Check 3rd measure (index 2): chord 8
  assert.equal(updated[8].measureIndex, 2);
  assert.equal(updated[8].beatIndex, 0);
});

test('Progression: Editing updates the selected chord rather than duplicating it', () => {
  let chords: ChordEvent[] = [
    createChordEvent([0, 1, 2, 2, 0, 'X'], 'chord_1', undefined, 0),
    createChordEvent([0, 1, 0, 2, 3, 'X'], 'chord_2', undefined, 1),
  ];

  assert.equal(chords.length, 2);
  assert.equal(chords[0].effectiveChordName, 'Am');

  // Edit chord_1 to D major: [2, 3, 2, 0, 'X', 'X']
  const updatedChord = createChordEvent([2, 3, 2, 0, 'X', 'X'], 'chord_1', undefined, 0);
  chords = chords.map((c) => (c.id === 'chord_1' ? updatedChord : c));

  assert.equal(chords.length, 2); // No duplicate added
  assert.equal(chords[0].id, 'chord_1');
  assert.equal(chords[0].effectiveChordName, 'D');
});

test('Progression: Deleting a chord updates progression order and measures', () => {
  let chords: ChordEvent[] = [
    createChordEvent([0, 1, 2, 2, 0, 'X'], 'c1', undefined, 0),
    createChordEvent([0, 1, 0, 2, 3, 'X'], 'c2', undefined, 1),
    createChordEvent([2, 3, 2, 0, 'X', 'X'], 'c3', undefined, 2),
  ];

  // Delete c2
  chords = recomputeProgressionMeasures(chords.filter((c) => c.id !== 'c2'));

  assert.equal(chords.length, 2);
  assert.equal(chords[0].id, 'c1');
  assert.equal(chords[1].id, 'c3');
  assert.equal(chords[1].beatIndex, 1); // was 2, now 1
});
