import React, { useState } from 'react';
import {
  ChordCandidate,
  ChordEvent,
  HarmonyProfile,
  HarmonyPreference,
  SelectedGap,
} from '../types.ts';
import { GUITAR_STRINGS } from '../utils/pitch.ts';
import { playChordPitches } from '../utils/audioPreview.ts';
import {
  Sparkles,
  Volume2,
  Check,
  X,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';

interface HarmonyAssistantPanelProps {
  mode: 'substitution' | 'passing';
  selectedChord: ChordEvent | null;
  selectedGap: SelectedGap | null;
  candidates: ChordCandidate[];
  profile: HarmonyProfile;
  preference: HarmonyPreference;
  onSelectProfile: (profile: HarmonyProfile) => void;
  onSelectPreference: (preference: HarmonyPreference) => void;
  onApplyCandidate: (candidate: ChordCandidate) => void;
  onClose: () => void;
}

export const HarmonyAssistantPanel: React.FC<HarmonyAssistantPanelProps> = ({
  mode,
  selectedChord,
  selectedGap,
  candidates,
  profile,
  preference,
  onSelectProfile,
  onSelectPreference,
  onApplyCandidate,
  onClose,
}) => {
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const handlePreview = (cand: ChordCandidate) => {
    setPreviewingId(cand.id);
    playChordPitches(cand.soundingMidiPitches);
    setTimeout(() => {
      setPreviewingId(null);
    }, 1200);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden flex flex-col max-h-[85vh]">
      {/* Header */}
      <div className="px-5 py-4 bg-[#fbf9f2] border-b border-[#ece8df] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-900/10 text-amber-900 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-stone-900 text-sm tracking-tight">
                {mode === 'substitution'
                  ? `Akor Alternatifleri: ${selectedChord?.effectiveChordName}`
                  : `Geçiş Akoru: ${selectedGap?.chordBefore.effectiveChordName} → ? → ${selectedGap?.chordAfter.effectiveChordName}`}
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  profile === 'jazz'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {profile === 'jazz' ? 'Caz Motoru' : 'Klasik Motor'}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {mode === 'substitution'
                ? 'Mevcut akor için ses iletimi ve fonksiyonel uyum alternatifleri'
                : 'İki akor arasındaki hareket için köprü ve bas yürüyüşü önerileri'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
          aria-label="Paneli Kapat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Profile & Preference Switcher inside Panel */}
      <div className="px-5 py-2.5 bg-stone-50/80 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-stone-600">Armoni Profili:</span>
          <div className="inline-flex rounded-lg border border-stone-200 p-0.5 bg-white shadow-2xs">
            <button
              onClick={() => onSelectProfile('jazz')}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                profile === 'jazz'
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Caz (Jazz)
            </button>
            <button
              onClick={() => onSelectProfile('classical')}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                profile === 'classical'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Klasik (Tonal)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-stone-500">Tercih:</span>
          <select
            value={preference}
            onChange={(e) => onSelectPreference(e.target.value as HarmonyPreference)}
            className="px-2 py-1 bg-white border border-stone-200 rounded-md text-stone-700 font-medium text-xs outline-none"
          >
            <option value="conservative">Tutucu / Pürüzsüz</option>
            <option value="balanced">Dengeli</option>
            <option value="adventurous">Yenilikçi / Zengin</option>
          </select>
        </div>
      </div>

      {/* Candidates List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {candidates.length === 0 ? (
          <div className="py-8 text-center text-stone-500 space-y-2">
            <Info className="w-8 h-8 mx-auto text-stone-300" />
            <p className="font-medium text-sm">Bu bağlam için uygun aday bulunamadı.</p>
            <p className="text-xs text-stone-400">
              Farklı bir armoni profili seçmeyi veya çevre akorları güncellemeyi deneyebilirsiniz.
            </p>
          </div>
        ) : (
          candidates.map((cand, idx) => {
            const isPreviewing = previewingId === cand.id;

            return (
              <div
                key={cand.id}
                className="p-4 rounded-xl border border-stone-200 bg-[#fdfbf7] hover:border-blue-400 transition-all space-y-3.5 shadow-2xs"
              >
                {/* Candidate Header: Name, Rule, Score */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl font-black text-stone-900 font-serif tracking-tight">
                        {cand.chordName}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
                        {cand.ruleName}
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                          cand.category === 'conventional'
                            ? 'bg-blue-100 text-blue-800'
                            : cand.category === 'colorful'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {cand.category === 'conventional'
                          ? 'Geleneksel'
                          : cand.category === 'colorful'
                            ? 'Renkli'
                            : 'Yenilikçi'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mt-1">{cand.explanation}</p>
                  </div>

                  {/* Rating / Score badge */}
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{cand.score}/100</span>
                    </span>
                    <span className="block text-[10px] text-stone-400 font-medium mt-0.5">
                      {cand.rating}
                    </span>
                  </div>
                </div>

                {/* Playable Guitar TAB and Sounding Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-stone-200/90 text-xs">
                  {/* TAB Display */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block mb-1.5">
                      Çalınabilir Gitar TAB:
                    </span>
                    <div className="flex items-center gap-1.5 font-mono">
                      {GUITAR_STRINGS.map((str, sIdx) => {
                        const fret = cand.frets[sIdx];
                        return (
                          <div
                            key={str.index}
                            className="flex flex-col items-center bg-stone-50 border border-stone-200 rounded px-1.5 py-1 min-w-[28px]"
                          >
                            <span className="text-[9px] text-stone-400 font-sans">{str.name}</span>
                            <span
                              className={`text-xs font-bold ${
                                fret === 'X'
                                  ? 'text-stone-400'
                                  : fret === 0
                                    ? 'text-emerald-700'
                                    : 'text-stone-900'
                              }`}
                            >
                              {fret === 'X' ? 'x' : fret}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sounding pitches */}
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block mb-1.5">
                      Tınlayan Perdeler:
                    </span>
                    <div className="flex flex-wrap gap-1 font-mono">
                      {cand.soundingNotes.map((note) => (
                        <span
                          key={note.stringIndex}
                          className="px-2 py-0.5 bg-stone-100 text-stone-800 rounded font-semibold text-xs border border-stone-200"
                        >
                          {note.soundingPitchName}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-stone-400 block mt-1">
                      Bas Sesi: {cand.soundingNotes[0]?.soundingPitchName || '-'}
                    </span>
                  </div>
                </div>

                {/* Voice Leading Assessment */}
                <div className="text-xs bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
                    <span>Ses İletimi (Voice Leading) Analizi:</span>
                  </div>
                  <p className="text-stone-700">{cand.voiceLeading.summary}</p>
                  {cand.voiceLeading.guideToneResolution && (
                    <p className="text-[11px] text-purple-700 font-medium">
                      • {cand.voiceLeading.guideToneResolution}
                    </p>
                  )}
                  {cand.voiceLeading.parallelFifthsOctaves && (
                    <p className="text-[11px] text-red-600 font-medium">
                      • Uyarı: Klasik stilde paralel aralık tespit edildi.
                    </p>
                  )}
                </div>

                {/* Action Buttons: Preview and Apply */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-200/60">
                  <button
                    type="button"
                    onClick={() => handlePreview(cand)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                      isPreviewing
                        ? 'bg-amber-100 border-amber-300 text-amber-900 ring-2 ring-amber-300/40'
                        : 'bg-white hover:bg-stone-50 border-stone-200 text-stone-700'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5 text-stone-500" />
                    <span>{isPreviewing ? 'Çalınıyor...' : 'Önizle (Dinle)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onApplyCandidate(cand)}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-stone-900 hover:bg-stone-800 text-white transition-all shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {mode === 'substitution'
                        ? `${selectedChord?.effectiveChordName} Yerine Kullan`
                        : 'Geçiş Akorunu Araya Ekle'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
