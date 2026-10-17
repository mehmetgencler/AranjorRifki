import { ChordEvent, ChordCandidate, HarmonyPreference } from '../../types.ts';
import { findBestVoicingForChord } from '../guitarVoicingSolver.ts';
import { evaluateVoiceLeadingBetween, evaluatePassingChordVoiceLeading } from '../voiceLeading.ts';

// Classical functional substitution mappings (Tonic -> Tonic, Predominant -> Predominant, Dominant -> Dominant)
const CLASSICAL_DIATONIC_SUBS: Record<string, { sub: string; func: string; rule: string }[]> = {
  // Tonic
  'C': [
    { sub: 'Am', func: 'Tonik İkamesi (I -> vi)', rule: 'Aldatıcı kadans / akraba minör tonik fonksiyonu' },
    { sub: 'Em', func: 'Tonik Mediant İkamesi (I -> iii)', rule: 'Ortak sesli medyan tonik alternatifi' },
    { sub: 'C/E', func: 'Birinci Çevrim Tonik (I6)', rule: 'Bas hattında 3lü derece akıcılığı' },
  ],
  'Am': [
    { sub: 'C', func: 'Tonik İkamesi (vi -> I)', rule: 'Majör tonik alternatifi' },
    { sub: 'F', func: 'Subdominant Açılımı (vi -> IV)', rule: 'Diatonik bas inişi' },
  ],

  // Predominant
  'F': [
    { sub: 'Dm', func: 'Ön-Dominant İkamesi (IV -> ii)', rule: 'Klasik supertonik ön-dominant fonksiyonu' },
    { sub: 'Dm/F', func: 'Birinci Çevrim Supertonik (ii6)', rule: 'Klasik dönem kadanslarında en sık kullanılan ön-dominant' },
  ],
  'Dm': [
    { sub: 'F', func: 'Ön-Dominant İkamesi (ii -> IV)', rule: 'Kök durumda subdominant fonksiyonu' },
    { sub: 'Dm/F', func: 'Çevrim Supertonik (ii6)', rule: 'Bas sesini vurgulayan birinci çevrim' },
  ],

  // Dominant
  'G': [
    { sub: 'G7', func: 'Dominant 7li Genişletmesi (V -> V7)', rule: 'Trisaundan 7li akora klasik gerilim artırımı' },
    { sub: 'G/B', func: 'Birinci Çevrim Dominant (V6)', rule: 'Bas hattında sansibl (leading-tone B) yönelimi' },
    { sub: 'Bdim', func: 'Sansibl Eksilmiş Derece (V -> vii°)', rule: 'Kök süz dominant fonksiyonu' },
  ],
  'G7': [
    { sub: 'G/B', func: 'Birinci Çevrim Dominant 7li (V6/5)', rule: 'Bas hattında B sesi ile C toniğine basamaklı adım' },
    { sub: 'Bdim', func: 'Sansibl Akoru (vii°)', rule: 'Dominant ailesi köksüz temsilcisi' },
  ],
  'D': [
    { sub: 'D/F#', func: 'Birinci Çevrim (V6 veya I6)', rule: 'Bas hattında F# basamaklı yürüyüş' },
    { sub: 'D7', func: 'Dominant 7li Genişletmesi', rule: 'Dominant gerilim eklemesi' },
  ],
  'Em': [
    { sub: 'G', func: 'Akraba Majör İkamesi', rule: 'Diatonik akraba derecesi' },
    { sub: 'C', func: 'Tonik Genişletmesi', rule: 'Ortak sesler' },
  ],
};

// Classical applied dominants (Secondary dominants)
const CLASSICAL_APPLIED_DOMINANTS: Record<string, { dom: string; label: string; explanation: string }> = {
  G: { dom: 'D7', label: 'V7/V (Dominantın Dominantı)', explanation: 'G dominantına varmadan önce D7 uygulayarak kadansı pekiştirir.' },
  G7: { dom: 'D7', label: 'V7/V (Dominantın Dominantı)', explanation: 'G7 dominantına varmadan önce D7 uygulayarak kadansı pekiştirir.' },
  Dm: { dom: 'A7', label: 'V7/ii (Supertoniğin Dominantı)', explanation: 'Dm ön-dominantına A7 ile yaklaşarak güçlü çekim sağlar.' },
  Dm7: { dom: 'A7', label: 'V7/ii (Supertoniğin Dominantı)', explanation: 'Dm7 ön-dominantına A7 ile yaklaşarak güçlü çekim sağlar.' },
  Am: { dom: 'E7', label: 'V7/vi (Submediantın Dominantı)', explanation: 'Am akoruna E7 uygulayarak klasik armonizasyon sunar.' },
  Am7: { dom: 'E7', label: 'V7/vi (Submediantın Dominantı)', explanation: 'Am7 akoruna E7 uygulayarak klasik armonizasyon sunar.' },
  F: { dom: 'C7', label: 'V7/IV (Subdominantın Dominantı)', explanation: 'F subdominantına C7 üzerinden geçiş sağlar.' },
  C: { dom: 'G7', label: 'V7 (Asli Dominant)', explanation: 'C tonik akoruna otantik kadans ile bağlanır.' },
};

// Classical leading-tone passing chords (vii°/target)
const CLASSICAL_LEADING_TONE_DIM: Record<string, { dim: string; label: string }> = {
  C: { dim: 'Bdim', label: 'vii° (Sansibl eksilmiş üçlüsü)' },
  Dm: { dim: 'C#dim7', label: 'vii°7/ii (Supertoniğin sansibl eksilmişi)' },
  G: { dim: 'F#dim7', label: 'vii°7/V (Dominantın sansibl eksilmişi)' },
  G7: { dim: 'F#dim7', label: 'vii°7/V (Dominantın sansibl eksilmişi)' },
  Am: { dim: 'G#dim7', label: 'vii°7/vi (Submediantın sansibl eksilmişi)' },
};

export class ClassicalHarmonyEngine {
  /**
   * Suggest substitutions using Classical Tonal Syntax
   */
  public static suggestSubstitutions(
    selectedChord: ChordEvent,
    progression: ChordEvent[],
    preference: HarmonyPreference = 'balanced'
  ): ChordCandidate[] {
    const candidates: ChordCandidate[] = [];
    const baseName = selectedChord.effectiveChordName;
    const cleanBase = baseName.split('/')[0];
    const avgFret = selectedChord.soundingNotes.length > 0
      ? selectedChord.soundingNotes.reduce((sum, n) => sum + n.fret, 0) / selectedChord.soundingNotes.length
      : 2;

    const chordIndex = progression.findIndex((c) => c.id === selectedChord.id);
    const nextChord = chordIndex >= 0 && chordIndex < progression.length - 1 ? progression[chordIndex + 1] : null;

    // Rule 1: Classical Diatonic Functional Substitution (CLASSICAL_DIATONIC_SUB)
    const options = CLASSICAL_DIATONIC_SUBS[baseName] || CLASSICAL_DIATONIC_SUBS[cleanBase] || [];

    for (const opt of options) {
      const voicing = findBestVoicingForChord(opt.sub, Math.round(avgFret));
      if (voicing) {
        const vl = evaluateVoiceLeadingBetween(
          selectedChord.soundingMidiPitches,
          voicing.soundingMidiPitches,
          'classical'
        );

        let score = 94 - vl.totalCost;
        if (vl.parallelFifthsOctaves) score -= 25; // Classical parallel penalty
        if (preference === 'conservative') score += 5;
        score = Math.max(45, Math.min(97, score));

        candidates.push({
          id: `sub_class_${opt.sub}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          chordName: opt.sub,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'CLASSICAL_DIATONIC_SUB',
          ruleName: opt.func,
          profile: 'classical',
          explanation: `${baseName} yerine klasik tonal fonksiyon kurallarına göre ${opt.sub} kullanımı. ${opt.rule}.`,
          musicalEffect: 'Geleneksel Batı müziği armonik akışı, temiz derece ilişkisi.',
          voiceLeading: vl,
          score,
          rating: score >= 88 ? 'Mükemmel' : score >= 75 ? 'Çok İyi' : 'İyi',
          isPassingChord: false,
          category: 'conventional',
        });
      }
    }

    // Rule 2: First inversion voicing for smooth bass line
    const inversionTarget = baseName.includes('/') ? cleanBase : `${cleanBase}/B`;
    if (!candidates.some((c) => c.chordName === inversionTarget)) {
      const voicing = findBestVoicingForChord(inversionTarget, Math.round(avgFret));
      if (voicing) {
        const vl = evaluateVoiceLeadingBetween(
          selectedChord.soundingMidiPitches,
          voicing.soundingMidiPitches,
          'classical'
        );
        candidates.push({
          id: `sub_inv_${inversionTarget}_${Date.now()}`,
          chordName: inversionTarget,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'CLASSICAL_INVERSION_VOICING',
          ruleName: 'Klasik Çevrim Akoru (1. Çevrim)',
          profile: 'classical',
          explanation: `Bas notasında 3. dereceyi barındıran çevrim akor. Bas hattının basamaklı adım atmasına imkan tanır.`,
          musicalEffect: 'Daha yumuşak, hafifleyen bas tınısı.',
          voiceLeading: vl,
          score: 86,
          rating: 'Çok İyi',
          isPassingChord: false,
          category: 'colorful',
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 4);
  }

  /**
   * Suggest classical passing chords between two adjacent chords
   */
  public static suggestPassingChords(
    chordBefore: ChordEvent,
    chordAfter: ChordEvent,
    preference: HarmonyPreference = 'balanced'
  ): ChordCandidate[] {
    const candidates: ChordCandidate[] = [];
    const nameBefore = chordBefore.effectiveChordName;
    const nameAfter = chordAfter.effectiveChordName;
    const cleanAfter = nameAfter.split('/')[0];

    const avgFret = Math.round(
      (chordBefore.soundingNotes.reduce((s, n) => s + n.fret, 0) / Math.max(1, chordBefore.soundingNotes.length) +
        chordAfter.soundingNotes.reduce((s, n) => s + n.fret, 0) / Math.max(1, chordAfter.soundingNotes.length)) /
        2
    );

    // 1. Classical Applied Dominant (V7/target)
    const appliedDom = CLASSICAL_APPLIED_DOMINANTS[cleanAfter];
    if (appliedDom && appliedDom.dom !== nameBefore) {
      const voicing = findBestVoicingForChord(appliedDom.dom, avgFret);
      if (voicing) {
        const vl = evaluatePassingChordVoiceLeading(
          chordBefore.soundingMidiPitches,
          voicing.soundingMidiPitches,
          chordAfter.soundingMidiPitches,
          'classical'
        );

        let score = 94 - vl.totalCost / 2;
        if (vl.parallelFifthsOctaves) score -= 30; // Classical parallel strictness
        if (preference === 'conservative') score += 5;
        score = Math.max(45, Math.min(98, score));

        candidates.push({
          id: `pass_appldom_${appliedDom.dom}_${Date.now()}`,
          chordName: appliedDom.dom,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'CLASSICAL_APPLIED_DOMINANT',
          ruleName: appliedDom.label,
          profile: 'classical',
          explanation: appliedDom.explanation,
          musicalEffect: 'Hedef dereceye yönelen güçlü klasik kadans çözülüşü.',
          voiceLeading: vl,
          score,
          rating: score >= 88 ? 'Mükemmel' : 'Çok İyi',
          isPassingChord: true,
          category: 'conventional',
        });
      }
    }

    // 2. Classical Leading-tone Diminished (vii°/target)
    const ltDim = CLASSICAL_LEADING_TONE_DIM[cleanAfter];
    if (ltDim && ltDim.dim !== nameBefore) {
      const voicing = findBestVoicingForChord(ltDim.dim, avgFret);
      if (voicing) {
        const vl = evaluatePassingChordVoiceLeading(
          chordBefore.soundingMidiPitches,
          voicing.soundingMidiPitches,
          chordAfter.soundingMidiPitches,
          'classical'
        );

        let score = 90 - vl.totalCost / 2;
        if (vl.parallelFifthsOctaves) score -= 30;
        score = Math.max(45, Math.min(95, score));

        candidates.push({
          id: `pass_ltdim_${ltDim.dim}_${Date.now()}`,
          chordName: ltDim.dim,
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'CLASSICAL_LEADING_TONE_PASSING',
          ruleName: ltDim.label,
          profile: 'classical',
          explanation: `${cleanAfter} akoruna yarım ton alttaki sansibl (leading-tone) eksilmiş akoru ile yaklaşarak zarif çözülüş sağlar.`,
          musicalEffect: 'Barok ve klasik dönem inceliğinde basamaklı çözülme.',
          voiceLeading: vl,
          score,
          rating: score >= 85 ? 'Çok İyi' : 'İyi',
          isPassingChord: true,
          category: 'colorful',
        });
      }
    }

    // 3. Stepwise Passing Bass Chord (Inversion / diatonic scalar walk)
    // E.g. between C and Am, insert G/B; between C and F, insert C/E
    if (nameBefore.startsWith('C') && nameAfter.startsWith('Am')) {
      const voicing = findBestVoicingForChord('G/B', avgFret);
      if (voicing) {
        const vl = evaluatePassingChordVoiceLeading(
          chordBefore.soundingMidiPitches,
          voicing.soundingMidiPitches,
          chordAfter.soundingMidiPitches,
          'classical'
        );

        candidates.push({
          id: `pass_gb_${Date.now()}`,
          chordName: 'G/B',
          frets: voicing.frets,
          soundingNotes: voicing.soundingNotes,
          soundingMidiPitches: voicing.soundingMidiPitches,
          writtenMidiPitches: voicing.writtenMidiPitches,
          ruleId: 'CLASSICAL_INVERSION_VOICING',
          ruleName: 'Basamaklı Bas Çevrimi (V6)',
          profile: 'classical',
          explanation: `C ile Am arasında bas notasında C -> B -> A adımı oluşturan 1. çevrim G/B akoru.`,
          musicalEffect: 'Mükemmel basamaklı bas yürüyüşü (stepwise bass line).',
          voiceLeading: vl,
          score: 96,
          rating: 'Mükemmel',
          isPassingChord: true,
          category: 'conventional',
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 4);
  }
}
