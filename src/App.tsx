/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ChordEvent,
  FretValue,
  HarmonyProfile,
  HarmonyPreference,
  ChordCandidate,
  SelectedGap,
} from './types.ts';
import { TabEditor } from './components/TabEditor.tsx';
import { ScoreRenderer } from './components/ScoreRenderer.tsx';
import { HarmonyAssistantPanel } from './components/HarmonyAssistantPanel.tsx';
import { JazzHarmonyEngine } from './utils/harmony/JazzHarmonyEngine.ts';
import { ClassicalHarmonyEngine } from './utils/harmony/ClassicalHarmonyEngine.ts';
import { playChordPitches } from './utils/audioPreview.ts';
import {
  createChordEvent,
  recomputeProgressionMeasures,
  loadProgressionFromStorage,
  saveProgressionToStorage,
  getInitialDemoProgression,
} from './utils/chordModel.ts';
import {
  Guitar,
  Music2,
  Trash2,
  RotateCcw,
  BookOpen,
  Info,
  Undo2,
  Sparkles,
} from 'lucide-react';

interface AssistantModalState {
  mode: 'substitution' | 'passing';
  selectedChord?: ChordEvent;
  selectedGap?: SelectedGap;
  candidates: ChordCandidate[];
}

export default function App() {
  const [chords, setChords] = useState<ChordEvent[]>(() => {
    const saved = loadProgressionFromStorage();
    if (saved && saved.length > 0) {
      return saved;
    }
    return getInitialDemoProgression();
  });

  // Undo history stack
  const [history, setHistory] = useState<ChordEvent[][]>([]);

  const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
  const [selectedGapAfterIndex, setSelectedGapAfterIndex] = useState<number | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'tab' | 'score'>('tab');
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  // Phase 2 Harmony Profile & Preferences
  const [harmonyProfile, setHarmonyProfile] = useState<HarmonyProfile>('jazz');
  const [harmonyPreference, setHarmonyPreference] = useState<HarmonyPreference>('balanced');

  // Suggestions Assistant Panel State
  const [assistantModal, setAssistantModal] = useState<AssistantModalState | null>(null);

  // Auto-save to localStorage on change
  useEffect(() => {
    saveProgressionToStorage(chords);
  }, [chords]);

  // Push previous state before modifying
  const recordHistory = (previous: ChordEvent[]) => {
    setHistory((prev) => [...prev.slice(-15), previous]);
  };

  // Undo action
  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setChords(previous);
    setSelectedChordId(null);
    setSelectedGapAfterIndex(null);
    setAssistantModal(null);
  };

  // Selected chord object
  const selectedChord = chords.find((c) => c.id === selectedChordId) || null;

  // Add chord
  const handleAddChord = (
    frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue],
    manualName?: string
  ) => {
    recordHistory(chords);
    const newChord = createChordEvent(frets, undefined, manualName, chords.length);
    const updated = recomputeProgressionMeasures([...chords, newChord]);
    setChords(updated);
    setSelectedChordId(null);
    setSelectedGapAfterIndex(null);
  };

  // Update existing chord
  const handleUpdateChord = (
    chordId: string,
    frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue],
    manualName?: string
  ) => {
    recordHistory(chords);
    const updated = chords.map((chord, idx) => {
      if (chord.id === chordId) {
        return createChordEvent(frets, chordId, manualName, idx);
      }
      return chord;
    });
    setChords(recomputeProgressionMeasures(updated));
  };

  // Delete chord
  const handleDeleteChord = (chordId: string) => {
    recordHistory(chords);
    const filtered = chords.filter((c) => c.id !== chordId);
    setChords(recomputeProgressionMeasures(filtered));
    if (selectedChordId === chordId) {
      setSelectedChordId(null);
    }
  };

  // New chord mode (exit editing)
  const handleNewChord = () => {
    setSelectedChordId(null);
    setSelectedGapAfterIndex(null);
    setAssistantModal(null);
  };

  // Select or toggle chord
  const handleSelectChord = (chordId: string) => {
    setSelectedChordId(chordId);
    setSelectedGapAfterIndex(null);
  };

  // Reset to demo progression
  const handleResetDemo = () => {
    recordHistory(chords);
    const demo = getInitialDemoProgression();
    setChords(demo);
    setSelectedChordId(null);
    setSelectedGapAfterIndex(null);
    setAssistantModal(null);
  };

  // Clear all chords
  const handleClearAll = () => {
    recordHistory(chords);
    setChords([]);
    setSelectedChordId(null);
    setSelectedGapAfterIndex(null);
    setAssistantModal(null);
  };

  // Open Chord Substitution Panel
  const handleOpenSubstitution = () => {
    if (!selectedChord) return;
    setSelectedGapAfterIndex(null);

    const candidates =
      harmonyProfile === 'jazz'
        ? JazzHarmonyEngine.suggestSubstitutions(selectedChord, chords, harmonyPreference)
        : ClassicalHarmonyEngine.suggestSubstitutions(selectedChord, chords, harmonyPreference);

    setAssistantModal({
      mode: 'substitution',
      selectedChord,
      candidates,
    });
  };

  // Open Passing Chord Gap Panel
  const handleOpenPassingChord = (afterIndex: number) => {
    if (afterIndex < 0 || afterIndex >= chords.length - 1) return;
    const chordBefore = chords[afterIndex];
    const chordAfter = chords[afterIndex + 1];
    setSelectedGapAfterIndex(afterIndex);

    const candidates =
      harmonyProfile === 'jazz'
        ? JazzHarmonyEngine.suggestPassingChords(chordBefore, chordAfter, harmonyPreference)
        : ClassicalHarmonyEngine.suggestPassingChords(chordBefore, chordAfter, harmonyPreference);

    setAssistantModal({
      mode: 'passing',
      selectedGap: {
        afterChordIndex: afterIndex,
        chordBefore,
        chordAfter,
      },
      candidates,
    });
  };

  // Refresh candidate suggestions when profile or preference changes inside modal
  const handleUpdateModalProfile = (newProfile: HarmonyProfile) => {
    setHarmonyProfile(newProfile);
    if (!assistantModal) return;

    if (assistantModal.mode === 'substitution' && assistantModal.selectedChord) {
      const candidates =
        newProfile === 'jazz'
          ? JazzHarmonyEngine.suggestSubstitutions(assistantModal.selectedChord, chords, harmonyPreference)
          : ClassicalHarmonyEngine.suggestSubstitutions(assistantModal.selectedChord, chords, harmonyPreference);
      setAssistantModal({ ...assistantModal, candidates });
    } else if (assistantModal.mode === 'passing' && assistantModal.selectedGap) {
      const candidates =
        newProfile === 'jazz'
          ? JazzHarmonyEngine.suggestPassingChords(
              assistantModal.selectedGap.chordBefore,
              assistantModal.selectedGap.chordAfter,
              harmonyPreference
            )
          : ClassicalHarmonyEngine.suggestPassingChords(
              assistantModal.selectedGap.chordBefore,
              assistantModal.selectedGap.chordAfter,
              harmonyPreference
            );
      setAssistantModal({ ...assistantModal, candidates });
    }
  };

  const handleUpdateModalPreference = (newPref: HarmonyPreference) => {
    setHarmonyPreference(newPref);
    if (!assistantModal) return;

    if (assistantModal.mode === 'substitution' && assistantModal.selectedChord) {
      const candidates =
        harmonyProfile === 'jazz'
          ? JazzHarmonyEngine.suggestSubstitutions(assistantModal.selectedChord, chords, newPref)
          : ClassicalHarmonyEngine.suggestSubstitutions(assistantModal.selectedChord, chords, newPref);
      setAssistantModal({ ...assistantModal, candidates });
    } else if (assistantModal.mode === 'passing' && assistantModal.selectedGap) {
      const candidates =
        harmonyProfile === 'jazz'
          ? JazzHarmonyEngine.suggestPassingChords(
              assistantModal.selectedGap.chordBefore,
              assistantModal.selectedGap.chordAfter,
              newPref
            )
          : ClassicalHarmonyEngine.suggestPassingChords(
              assistantModal.selectedGap.chordBefore,
              assistantModal.selectedGap.chordAfter,
              newPref
            );
      setAssistantModal({ ...assistantModal, candidates });
    }
  };

  // Accept and apply a candidate suggestion
  const handleApplyCandidate = (candidate: ChordCandidate) => {
    if (!assistantModal) return;
    recordHistory(chords);

    if (assistantModal.mode === 'substitution' && assistantModal.selectedChord) {
      const targetId = assistantModal.selectedChord.id;
      const targetIdx = chords.findIndex((c) => c.id === targetId);
      if (targetIdx >= 0) {
        const replacement = createChordEvent(
          candidate.frets,
          targetId,
          candidate.chordName,
          targetIdx
        );
        const updated = chords.map((c) => (c.id === targetId ? replacement : c));
        setChords(recomputeProgressionMeasures(updated));
      }
    } else if (assistantModal.mode === 'passing' && assistantModal.selectedGap) {
      const insertIdx = assistantModal.selectedGap.afterChordIndex + 1;
      const newPassingChord = createChordEvent(
        candidate.frets,
        undefined,
        candidate.chordName,
        insertIdx
      );
      const nextChords = [
        ...chords.slice(0, insertIdx),
        newPassingChord,
        ...chords.slice(insertIdx),
      ];
      setChords(recomputeProgressionMeasures(nextChords));
      setSelectedChordId(newPassingChord.id);
    }

    playChordPitches(candidate.soundingMidiPitches);
    setAssistantModal(null);
    setSelectedGapAfterIndex(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f4ee] text-stone-900 font-sans selection:bg-amber-200">
      {/* Top Application Bar */}
      <header className="bg-white border-b border-[#e5e2d8] px-4 lg:px-8 py-3 relative z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-900 text-amber-50 flex items-center justify-center shadow-xs">
              <Guitar className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-stone-900">
                  FretHarmony
                </h1>
                <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  Aşama 2: Armoni Asistanı
                </span>
              </div>
              <p className="text-xs text-stone-500 hidden sm:block">
                Gitar TAB, Porte Notasyonu & Akor Alternatifi / Geçiş Asistanı
              </p>
            </div>
          </div>

          {/* Harmony Profile Switcher */}
          <div className="flex items-center gap-2 bg-stone-100/90 p-1 rounded-xl border border-stone-200/80">
            <span className="text-[11px] font-bold text-stone-500 px-1 hidden md:inline">
              Profil:
            </span>
            <button
              onClick={() => setHarmonyProfile('jazz')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                harmonyProfile === 'jazz'
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Caz (Jazz)
            </button>
            <button
              onClick={() => setHarmonyProfile('classical')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                harmonyProfile === 'classical'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Klasik (Tonal)
            </button>
          </div>

          {/* Header Action Tools: Undo, Guide, Reset, Clear */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                history.length > 0
                  ? 'bg-white hover:bg-stone-50 border-stone-300 text-stone-800 shadow-2xs cursor-pointer'
                  : 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed'
              }`}
              title="Son işlemi geri al (Undo)"
              aria-label="Geri Al"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Geri Al ({history.length})</span>
            </button>

            <button
              onClick={() => setShowInfoModal(true)}
              className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
              title="Kullanım Rehberi & Bilgi"
              aria-label="Kullanım Rehberi"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetDemo}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
              title="Varsayılan örnek akorları yükle"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Örneği Yükle</span>
            </button>

            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
              title="Tüm akorları sil"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tümünü Sil</span>
            </button>
          </div>
        </div>

        {/* Mobile View Switcher Tabs (< lg screens) */}
        <div className="lg:hidden mt-3 pt-2 border-t border-stone-100 flex gap-2">
          <button
            onClick={() => setActiveMobileTab('tab')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeMobileTab === 'tab'
                ? 'bg-stone-900 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Guitar className="w-3.5 h-3.5" />
            <span>TAB Girişi</span>
          </button>
          <button
            onClick={() => setActiveMobileTab('score')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeMobileTab === 'score'
                ? 'bg-stone-900 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>Porte ({chords.length})</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: Two-Panel Layout */}
      <main className="max-w-7xl mx-auto w-full flex-1 p-4 lg:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Panel: TAB Editor (approx 40% width) */}
          <section
            className={`w-full lg:w-[40%] flex flex-col ${
              activeMobileTab === 'tab' ? 'block' : 'hidden lg:flex'
            }`}
            aria-label="TAB Akor Düzenleyici Paneli"
          >
            <TabEditor
              selectedChord={selectedChord}
              onAddChord={handleAddChord}
              onUpdateChord={handleUpdateChord}
              onDeleteChord={handleDeleteChord}
              onNewChord={handleNewChord}
              onOpenSubstitution={handleOpenSubstitution}
            />
          </section>

          {/* Right Panel: Music Score (approx 60% width) */}
          <section
            className={`w-full lg:w-[60%] flex flex-col ${
              activeMobileTab === 'score' ? 'block' : 'hidden lg:flex'
            }`}
            aria-label="Nota Portesi Paneli"
          >
            <ScoreRenderer
              chords={chords}
              selectedChordId={selectedChordId}
              selectedGapAfterIndex={selectedGapAfterIndex}
              onSelectChord={handleSelectChord}
              onOpenSubstitution={handleOpenSubstitution}
              onOpenPassingChord={handleOpenPassingChord}
            />
          </section>
        </div>

        {/* Harmony Suggestions Modal / Bottom Sheet */}
        {assistantModal && (
          <div className="fixed inset-0 bg-stone-950/40 backdrop-blur-2xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="max-w-2xl w-full">
              <HarmonyAssistantPanel
                mode={assistantModal.mode}
                selectedChord={assistantModal.selectedChord || null}
                selectedGap={assistantModal.selectedGap || null}
                candidates={assistantModal.candidates}
                profile={harmonyProfile}
                preference={harmonyPreference}
                onSelectProfile={handleUpdateModalProfile}
                onSelectPreference={handleUpdateModalPreference}
                onApplyCandidate={handleApplyCandidate}
                onClose={() => {
                  setAssistantModal(null);
                  setSelectedGapAfterIndex(null);
                }}
              />
            </div>
          </div>
        )}
      </main>

      {/* Info Guide Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-stone-950/40 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-700" />
                <h3 className="font-bold text-stone-900 text-base">FretHarmony Aşama 2 Rehberi</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm p-1"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-stone-600 space-y-2.5 leading-relaxed">
              <p>
                <strong>FretHarmony Aşama 2</strong>, gitar akor dizilimlerinize akıllı ve doğrulanmış armoni önerileri getirir:
              </p>
              <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 space-y-2 font-mono text-[11px]">
                <p>• <strong>Caz Motoru (Jazz)</strong>: Dominant 7li akorlar için Triton İkamesi (subV7), ikincil dominantlar ve kromatik yarım ton bas adımları.</p>
                <p>• <strong>Klasik Motor (Classical)</strong>: Tonal fonksiyon ikameleri (Tonic, Predominant, Dominant), uygulamalı dominantlar (V7/V) ve sansibl eksilmiş (vii°) çözülüşleri.</p>
                <p>• <strong>Akor Alternatifleri</strong>: Seçili akor yerine daha akıcı veya renkli bir alternatif önerir.</p>
                <p>• <strong>Geçiş Akoru (+ Geçiş)</strong>: İki bitişik akor arasına köprü kuracak basamaklı bas yürüyüşü ve gerilim akoru ekler.</p>
                <p>• <strong>Geri Al (Undo)</strong>: Yapılan her ikame veya geçiş akoru eklemesini tek tıkla geri alır.</p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 bg-stone-900 text-white font-medium text-xs rounded-xl hover:bg-stone-800"
              >
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
