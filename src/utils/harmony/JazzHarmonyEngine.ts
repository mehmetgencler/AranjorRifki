import { ChordEvent, ChordCandidate, HarmonyPreference } from '../../types.ts';
import { midiToPitchClass, SHARP_PITCH_CLASSES, FLAT_PITCH_CLASSES } from '../spelling.ts';
import { findBestVoicingForChord } from '../guitarVoicingSolver.ts';
import { evaluateVoiceLeadingBetween, evaluatePassingChordVoiceLeading } from '../voiceLeading.ts';

const TRITONE_MAP: Record<string, string> = {
  G7: 'Db7',
  Db7: 'G7',
  C7: 'Gb7',
  Gb7: 'C7',
  F7: 'B7',
  B7: 'F7',
  D7: 'Ab7',
  Ab7: 'D7',
  A7: 'Eb7',
  Eb7: 'A7',
  E7: 'Bb7',
  Bb7: 'E7',
};

// Dominant 7th chords leading to target root (Circle of 5ths V7 -> target)
const SECONDARY_DOMINANT_MAP: Record<string, string> = {
  C: 'G7',
  Cmaj7: 'G7',
  Dm: 'A7',
  Dm7: 'A7',
  Em: 'B7',
  Em7: 'B7',
  F: 'C7',
  Fmaj7: 'C7',
  G: 'D7',
  G7: 'D7',
  Am: 'E7',
  Am7: 'E7',
  Bm: 'F#7',
  Bm7: 'F#7',
  Bb: 'F7',
  Bbmaj7: 'F7',
  Eb: 'Bb7',
  Ebmaj7: 'Bb7',
};

export class JazzHarmonyEngine {
  /**
   * Suggest chord alternatives / substitutions for a selected chord
   */
  public static suggestSubstitutions(
    selectedChord: ChordEvent,
    progression: ChordEvent[],
    preference: HarmonyPreference = 'balanced'
  ): ChordCandidate[] {
    const candidates: ChordCandidate[] = [];
    const chordIndex = progression.findIndex((c) => c.id === selectedChord.id);
    const nextChord = chordIndex >= 0 && chordIndex < progression.length - 1 ? progression[chordIndex + 1] : null;
    const prevChord = chordIndex > 0 ? progression[chordIndex - 1] : null;

    const baseName = selectedChord.effectiveChordName;
    const avgFret = selectedChord.soundingNotes.length > 0
      ? selectedChord.soundingNotes.reduce((sum, n) => sum + n.fret, 0) / selectedChord.soundingNotes.length
      : 2;

    // Rule 1: Tritone Substitution (JAZZ_TRITONE_SUB)
    // Applies if current chord is a dominant 7th
    const tritoneTarget = TRITONE_MAP[baseName];
    if (tritoneTarget) {
      const voicing = findBestVoicingForChord(tritoneTarget, Math.round(avgFret));
      if (voicing) {
        // Evaluate voice leading relative to surrounding chords
        let vl = evaluateVoiceLeadingBetween(
          selectedChord.soundingMidiPitches,
          voicing.soundingMidiPitches,
          'jazz'
        );

        if (nextChord) {
          // Evaluate against next chord (e.g. Db7 -> Cmaj7)
          const vlToNext = evaluateVoiceLeadingBetween(
            voicing.soundingMidiPitches,
            nextChord.soundingMidiPitches,
            'jazz'
          );
          // Combine evaluation
          vl = {
            totalCost: Math.round((vl.totalCost + vlToNext.totalCost) / 2),
            stepwiseMovementCount: vl.stepwiseMovementCount + vlToNext.stepwiseMovementCount,
            leapCount: vl.leapCount + vlToNext.leapCount,
            commonTonesCount: vl.commonTonesCount + vlToNext.commonTonesCount,
            bassMovementInterval: vlToNext.bassMovementInterval,
            bassMovementDescription: `${vlToNext.bassMovementDescription} (Hedefe yarım ton iniş)`,
            guideToneResolution: 'Rehber sesler (3. ve 7. dereceler) ortak kalarak yarım ton çözülür',
            summary: `Hedefe (${nextChord.effectiveChordName}) yarım ton kromatik bas inişi. ${vlToNext.summary}`,
          };
        }

        let score = 92 - vl.totalCost;
        if (preference === 'adventurous') score += 10;
        if (preference === 'conservative') score -= 5;
        score = Math.max(50, Math.min(98, score));

        candidates.push({
          id: `sub_${tritoneTarget}_${Date.now()}_1`,
          chordName: tritoneTarget,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'JAZZ_TRITONE_SUB',
          ruleName: 'Tritone Substitution (subV7)',
          profile: 'jazz',
          explanation: `${baseName} yerine triton uzaklığındaki ${tritoneTarget} akoru kullanılır. İki akor da aynı 3. ve 7. rehber sesleri paylaşır ancak bas notası hedefe yarım ton inişle pürüzsüz bağlanır.`,
          musicalEffect: 'Modern caz soundu, güçlü kromatik bas çekimi ve sofistike gerilim çözülüşü.',
          voiceLeading: vl,
          score,
          rating: score >= 88 ? 'Mükemmel' : score >= 75 ? 'Çok İyi' : 'İyi',
          isPassingChord: false,
          category: 'adventurous',
        });
      }
    }

    // Rule 2: Alternate Voicings / Shell Voicings (JAZZ_ALT_VOICING)
    // Offer an alternate position on the neck with smooth common tones
    const altTargetVoicing = findBestVoicingForChord(baseName, Math.round(avgFret > 5 ? 2 : 5));
    if (altTargetVoicing && altTargetVoicing.frets.join('') !== selectedChord.strings.join('')) {
      const vl = evaluateVoiceLeadingBetween(
        selectedChord.soundingMidiPitches,
        altTargetVoicing.soundingMidiPitches,
        'jazz'
      );
      let score = 85 - vl.totalCost / 2;
      if (preference === 'conservative') score += 10;
      score = Math.max(50, Math.min(95, score));

      candidates.push({
        id: `sub_alt_${baseName}_${Date.now()}_2`,
        chordName: baseName,
        frets: altTargetVoicing.frets,
        soundingNotes: altTargetVoicing.soundingNotes,
        soundingMidiPitches: altTargetVoicing.soundingMidiPitches,
        writtenMidiPitches: altTargetVoicing.writtenMidiPitches,
        ruleId: 'JAZZ_ALT_VOICING',
        ruleName: 'Alternatif Caz Pozisyonu',
        profile: 'jazz',
        explanation: `${baseName} akorunun klavye üzerinde farklı bir bölgedeki alternatif dizilimi. Çevre akorlarla ses bağını ve tını zenginliğini optimize eder.`,
        musicalEffect: 'Daha odaklı ses dağılımı ve farklı klavye tınısı.',
        voiceLeading: vl,
        score,
        rating: score >= 85 ? 'Çok İyi' : 'İyi',
        isPassingChord: false,
        category: 'conventional',
      });
    }

    // Rule 3: Chromatic Approach or Minor Substitution
    if (baseName.endsWith('m') || baseName.endsWith('m7')) {
      // Relative major or 7th extension
      const extName = baseName.endsWith('m') ? `${baseName}7` : baseName;
      if (extName !== baseName) {
        const v = findBestVoicingForChord(extName, Math.round(avgFret));
        if (v) {
          const vl = evaluateVoiceLeadingBetween(
            selectedChord.soundingMidiPitches,
            v.soundingMidiPitches,
            'jazz'
          );
          candidates.push({
            id: `sub_ext_${extName}_${Date.now()}_3`,
            chordName: extName,
            frets: v.frets,
            soundingNotes: v.soundingNotes,
            soundingMidiPitches: v.soundingMidiPitches,
            writtenMidiPitches: v.writtenMidiPitches,
            ruleId: 'JAZZ_ALT_VOICING',
            ruleName: '7li Caz Genişletmesi',
            profile: 'jazz',
            explanation: `Düz minör yerine caz standartlarında karakteristik olan minör 7li (${extName}) kullanımı.`,
            musicalEffect: 'Daha sıcak, zengin ve armonik derinlik katan caz tınısı.',
            voiceLeading: vl,
            score: 88,
            rating: 'Mükemmel',
            isPassingChord: false,
            category: 'colorful',
          });
        }
      }
    }

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  /**
   * Suggest passing chord candidates between two adjacent chords in progression
   */
  public static suggestPassingChords(
    chordBefore: ChordEvent,
    chordAfter: ChordEvent,
    preference: HarmonyPreference = 'balanced'
  ): ChordCandidate[] {
    const candidates: ChordCandidate[] = [];
    const avgFret = Math.round(
      (chordBefore.soundingNotes.reduce((s, n) => s + n.fret, 0) / Math.max(1, chordBefore.soundingNotes.length) +
        chordAfter.soundingNotes.reduce((s, n) => s + n.fret, 0) / Math.max(1, chordAfter.soundingNotes.length)) /
        2
    );

    const nameBefore = chordBefore.effectiveChordName;
    const nameAfter = chordAfter.effectiveChordName;

    const bassBefore = chordBefore.soundingMidiPitches[0];
    const bassAfter = chordAfter.soundingMidiPitches[0];
    const bassDelta = Math.abs(bassAfter - bassBefore);

    // 1. Secondary Dominant (V7 of chordAfter)
    const secDomName = SECONDARY_DOMINANT_MAP[nameAfter] || SECONDARY_DOMINANT_MAP[nameAfter.split('/')[0]];
    if (secDomName && secDomName !== nameBefore) {
      const voicing = findBestVoicingForChord(secDomName, avgFret);
      if (voicing) {
        const vl = evaluatePassingChordVoiceLeading(
          chordBefore.soundingMidiPitches,
          voicing.soundingMidiPitches,
          chordAfter.soundingMidiPitches,
          'jazz'
        );

        let score = 94 - vl.totalCost / 2;
        if (preference === 'conservative') score += 5;
        score = Math.max(50, Math.min(97, score));

        candidates.push({
          id: `pass_secdom_${secDomName}_${Date.now()}`,
          chordName: secDomName,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'JAZZ_SECONDARY_DOMINANT',
          ruleName: `İkincil Dominant (V7/${nameAfter})`,
          profile: 'jazz',
          explanation: `${nameAfter} akoruna varmadan önce onun 5. derecesi olan ${secDomName} dominant akorunu araya alarak güçlü bir kadans çekimi yaratır.`,
          musicalEffect: 'Hedef akora kaçınılmaz ve akıcı bir armonik yönelim hissi.',
          voiceLeading: vl,
          score,
          rating: score >= 90 ? 'Mükemmel' : 'Çok İyi',
          isPassingChord: true,
          category: 'conventional',
        });
      }
    }

    // 2. Tritone Substitute of the Secondary Dominant or Approach
    if (secDomName) {
      const tritoneSecDom = TRITONE_MAP[secDomName];
      if (tritoneSecDom && tritoneSecDom !== nameBefore) {
        const voicing = findBestVoicingForChord(tritoneSecDom, avgFret);
        if (voicing) {
          const vl = evaluatePassingChordVoiceLeading(
            chordBefore.soundingMidiPitches,
            voicing.soundingMidiPitches,
            chordAfter.soundingMidiPitches,
            'jazz'
          );

          let score = 90 - vl.totalCost / 2;
          if (preference === 'adventurous') score += 8;
          score = Math.max(50, Math.min(98, score));

          candidates.push({
            id: `pass_tritone_${tritoneSecDom}_${Date.now()}`,
            chordName: tritoneSecDom,
            frets: voicing.frets,
            soundingNotes: voicing.soundingNotes,
            soundingMidiPitches: voicing.soundingMidiPitches,
            writtenMidiPitches: voicing.writtenMidiPitches,
            ruleId: 'JAZZ_TRITONE_SUB',
            ruleName: `Triton Geçiş Akoru (subV7/${nameAfter})`,
            profile: 'jazz',
            explanation: `${nameAfter} akorunun yarım ton üstünden (${tritoneSecDom}) kromatik bas inişiyle bağlanan triton ikamesi geçiş akoru.`,
            musicalEffect: 'Çarpıcı caz lezzeti, kromatik yarım ton bas adımı.',
            voiceLeading: vl,
            score,
            rating: score >= 88 ? 'Mükemmel' : 'Çok İyi',
            isPassingChord: true,
            category: 'adventurous',
          });
        }
      }
    }

    // 3. Ascending Diminished 7th Passing Chord (JAZZ_DIM_PASSING)
    // If chords roots are separated by 2 semitones (whole step)
    const pcBefore = midiToPitchClass(bassBefore);
    const pcAfter = midiToPitchClass(bassAfter);
    if ((pcBefore + 2) % 12 === pcAfter || (pcAfter - pcBefore + 12) % 12 === 2) {
      const midPc = (pcBefore + 1) % 12;
      const dimRoot = SHARP_PITCH_CLASSES[midPc];
      const dimChordName = `${dimRoot}dim7`;

      const voicing = findBestVoicingForChord(dimChordName, avgFret);
      if (voicing) {
        const vl = evaluatePassingChordVoiceLeading(
          chordBefore.soundingMidiPitches,
          voicing.soundingMidiPitches,
          chordAfter.soundingMidiPitches,
          'jazz'
        );

        let score = 92 - vl.totalCost / 2;
        if (preference === 'colorful' || preference === 'balanced') score += 5;
        score = Math.max(50, Math.min(96, score));

        candidates.push({
          id: `pass_dim_${dimChordName}_${Date.now()}`,
          chordName: dimChordName,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'JAZZ_DIM_PASSING',
          ruleName: 'Kromatik Eksilmiş 7li Geçiş (dim7)',
          profile: 'jazz',
          explanation: `${nameBefore} ile ${nameAfter} arasındaki tam tonluk bas boşluğunu yarım ton tırmanan ${dimChordName} ile doldurur.`,
          musicalEffect: 'Bebop ve swing tarzı akıcı bas yürüyüşü ve zarif triton gerilimi.',
          voiceLeading: vl,
          score,
          rating: 'Mükemmel',
          isPassingChord: true,
          category: 'colorful',
        });
      }
    }

    // 4. Chromatic Approach from a half-step away
    // Approach chord from half step above or below target chord quality
    const targetRoot = nameAfter.replace(/[^A-G#b]/g, '');
    const isTargetMinor = nameAfter.includes('m') && !nameAfter.includes('maj');
    const approachQuality = isTargetMinor ? 'm7' : '7';
    // half step above
    const targetPc = midiToPitchClass(bassAfter);
    const halfStepAbovePc = (targetPc + 1) % 12;
    const approachName = `${FLAT_PITCH_CLASSES[halfStepAbovePc]}${approachQuality}`;

    if (approachName !== nameBefore && !candidates.some((c) => c.chordName === approachName)) {
      const voicing = findBestVoicingForChord(approachName, avgFret);
      if (voicing) {
        const vl = evaluatePassingChordVoiceLeading(
          chordBefore.soundingMidiPitches,
          voicing.soundingMidiPitches,
          chordAfter.soundingMidiPitches,
          'jazz'
        );

        candidates.push({
          id: `pass_chrom_${approachName}_${Date.now()}`,
          chordName: approachName,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'JAZZ_CHROMATIC_APPROACH',
          ruleName: 'Yarım Ton Kromatik Yaklaşım',
          profile: 'jazz',
          explanation: `Hedef ${nameAfter} akoruna yarım ton yukarıdan (${approachName}) kayarak bağlanan akor geçişi.`,
          musicalEffect: 'Tipik gitar swing kayışı (half-step slide).',
          voiceLeading: vl,
          score: 82,
          rating: 'İyi',
          isPassingChord: true,
          category: 'adventurous',
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 4);
  }
}
