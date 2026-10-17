import React, { useState, useEffect, useRef } from 'react';
import {
  FretValue,
  GuitarStringInfo,
  ChordEvent,
  ChordRecognitionResult,
} from '../types.ts';
import {
  GUITAR_STRINGS,
  validateSixStrings,
  parseFretInput,
  calculateSoundingPitch,
  calculateWrittenPitch,
} from '../utils/pitch.ts';
import { recognizeChord } from '../utils/chordRecognition.ts';
import { midiToPitchName } from '../utils/spelling.ts';
import {
  Plus,
  RefreshCw,
  Trash2,
  FilePlus,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Edit3,
  Sliders,
  X,
  Sparkles,
} from 'lucide-react';

interface TabEditorProps {
  selectedChord: ChordEvent | null;
  onAddChord: (
    frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue],
    manualName?: string
  ) => void;
  onUpdateChord: (
    chordId: string,
    frets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue],
    manualName?: string
  ) => void;
  onDeleteChord: (chordId: string) => void;
  onNewChord: () => void;
  onOpenSubstitution?: () => void;
}

export const TabEditor: React.FC<TabEditorProps> = ({
  selectedChord,
  onAddChord,
  onUpdateChord,
  onDeleteChord,
  onNewChord,
  onOpenSubstitution,
}) => {
  // 6 string input raw string representations ('', 'X', '0', '1'..'24')
  // String 0: high e, String 5: low E
  const [stringValues, setStringValues] = useState<string[]>(['', '', '', '', '', '']);
  const [manualName, setManualName] = useState<string>('');
  const [showManualNameEdit, setShowManualNameEdit] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selector modal/popover state for a specific string
  const [activeSelectorStringIndex, setActiveSelectorStringIndex] = useState<number | null>(null);

  // References to the 6 inputs for focus control
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // When selectedChord changes, load its values into editor
  useEffect(() => {
    if (selectedChord) {
      setStringValues(
        selectedChord.strings.map((s) => (s === null ? '' : String(s)))
      );
      setManualName(selectedChord.manualChordName || '');
      setErrorMessage(null);
    } else {
      // In new chord mode, if not previously editing, start fresh
      setStringValues(['', '', '', '', '', '']);
      setManualName('');
      setErrorMessage(null);
    }
  }, [selectedChord]);

  // Compute live preview of recognized chord and sounding notes as user types
  const parsedFrets = stringValues.map(parseFretInput);
  const allAssigned = parsedFrets.every((f) => f !== null);

  let liveRecognizedChord: ChordRecognitionResult | null = null;
  let liveSoundingNotes: { stringName: string; fret: number; pitch: string; writtenPitch: string }[] = [];

  if (allAssigned) {
    const soundingMidis: number[] = [];
    const notesTemp: { stringName: string; fret: number; pitch: string; writtenPitch: string }[] = [];

    parsedFrets.forEach((f, idx) => {
      if (f !== 'X' && typeof f === 'number') {
        const midi = calculateSoundingPitch(idx, f);
        if (midi !== null) {
          soundingMidis.push(midi);
          const writtenMidi = calculateWrittenPitch(midi);
          notesTemp.push({
            stringName: GUITAR_STRINGS[idx].name,
            fret: f,
            pitch: midiToPitchName(midi),
            writtenPitch: midiToPitchName(writtenMidi),
          });
        }
      }
    });

    if (soundingMidis.length > 0) {
      liveRecognizedChord = recognizeChord(soundingMidis);
      liveSoundingNotes = notesTemp;
    }
  }

  // Handle cell change directly from typing
  const handleInputChange = (index: number, rawVal: string) => {
    setErrorMessage(null);
    const upper = rawVal.trim().toUpperCase();

    // Allow empty string (blank = not assigned)
    if (upper === '') {
      const next = [...stringValues];
      next[index] = '';
      setStringValues(next);
      return;
    }

    // Allow 'X'
    if (upper === 'X') {
      const next = [...stringValues];
      next[index] = 'X';
      setStringValues(next);
      return;
    }

    // Allow numbers 0 to 24
    const num = parseInt(upper, 10);
    if (!isNaN(num) && num >= 0 && num <= 24) {
      const next = [...stringValues];
      next[index] = String(num);
      setStringValues(next);
    }
  };

  // Select value from picker popup
  const handleSelectFretFromPicker = (fretVal: FretValue) => {
    if (activeSelectorStringIndex === null) return;
    const next = [...stringValues];
    next[activeSelectorStringIndex] = String(fretVal);
    setStringValues(next);
    setErrorMessage(null);
    setActiveSelectorStringIndex(null);

    // Auto focus next input if not at the bottom string
    if (activeSelectorStringIndex < 5) {
      inputRefs.current[activeSelectorStringIndex + 1]?.focus();
    }
  };

  // Form submit handler (Enter key or Add/Update button)
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // 1. Validate all six string assignments
    const fretsToValidate = stringValues.map(parseFretInput);
    const validation = validateSixStrings(fretsToValidate);

    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    setErrorMessage(null);

    if (selectedChord) {
      // Edit state: Update existing chord
      onUpdateChord(selectedChord.id, validation.frets, manualName.trim() || undefined);
    } else {
      // Add new chord
      onAddChord(validation.frets, manualName.trim() || undefined);
      // Clear inputs
      setStringValues(['', '', '', '', '', '']);
      setManualName('');
      // Return focus to first string
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 50);
    }
  };

  // Keyboard Enter handler with debounce / repeat guard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Prevent keyboard repeat events from duplicating commits
      if (e.repeat) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleStartNewChord = () => {
    onNewChord();
    setStringValues(['', '', '', '', '', '']);
    setManualName('');
    setErrorMessage(null);
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 50);
  };

  // Quick guitar presets for convenience and rapid chord testing
  const applyPreset = (presetFrets: [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue]) => {
    setStringValues(presetFrets.map((f) => String(f)));
    setErrorMessage(null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-full bg-white border border-[#e7e4dc] rounded-xl shadow-xs overflow-hidden"
    >
      {/* Editor Header */}
      <div className="px-5 py-3.5 border-b border-[#ece8df] bg-[#fbf9f2] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-stone-900 text-amber-50 flex items-center justify-center font-bold text-xs tracking-wider">
            TAB
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-900 tracking-tight">TAB Akor Düzenleyici</h2>
            <p className="text-xs text-stone-500">
              {selectedChord ? (
                <span className="text-blue-700 font-medium">Akor Düzenleniyor</span>
              ) : (
                'Yeni akor için 6 teli doldurun'
              )}
            </p>
          </div>
        </div>

        {selectedChord && (
          <button
            onClick={handleStartNewChord}
            className="text-xs flex items-center gap-1 px-2.5 py-1 text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
            title="Seçimi kaldırıp yeni akor girişine geç"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>Yeni Akor</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-start gap-2 shadow-2xs animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Giriş Hatası</p>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Six Strings TAB Grid */}
        <div className="space-y-2 bg-[#fdfbf7] p-4 rounded-xl border border-[#ece8df]">
          <div className="flex items-center justify-between text-xs text-stone-500 pb-1 border-b border-stone-200/80">
            <span className="font-medium">Tel / Nota</span>
            <span className="text-right">Perde Değeri (0-24 veya X)</span>
          </div>

          {GUITAR_STRINGS.map((strInfo: GuitarStringInfo, idx: number) => {
            const rawVal = stringValues[idx];
            const isUnassigned = rawVal === '';
            const isMuted = rawVal === 'X';
            const isOpen = rawVal === '0';
            const isFretNumber = !isUnassigned && !isMuted && !isOpen;

            return (
              <div
                key={strInfo.index}
                className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                  activeSelectorStringIndex === idx
                    ? 'border-blue-400 bg-blue-50/40'
                    : 'border-stone-200/70 bg-white hover:border-stone-300'
                }`}
              >
                {/* String Label */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-stone-100 border border-stone-200/80 flex items-center justify-center font-bold text-stone-800 text-sm font-mono shadow-2xs">
                    {strInfo.name}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                      <span>{strInfo.name}</span>
                      <span className="text-[10px] text-stone-400 font-normal">
                        ({strInfo.turkishName})
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-400">
                      Boş Tel: {strInfo.openPitchName} (MIDI {strInfo.openMidi})
                    </div>
                  </div>
                </div>

                {/* Input Cell and Quick Selector Trigger */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      value={rawVal}
                      onChange={(e) => handleInputChange(idx, e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="-"
                      maxLength={2}
                      aria-label={`${strInfo.name} teli perde girişi`}
                      className={`w-14 h-10 text-center font-mono font-bold text-base rounded-lg border outline-none transition-all shadow-2xs ${
                        isUnassigned
                          ? 'border-amber-300 bg-amber-50/30 text-stone-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                          : isMuted
                            ? 'border-stone-400 bg-stone-100 text-stone-600 focus:border-stone-600'
                            : 'border-stone-300 bg-white text-stone-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                      }`}
                    />
                  </div>

                  {/* Popover trigger button */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSelectorStringIndex(activeSelectorStringIndex === idx ? null : idx)
                    }
                    className="h-10 px-2.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg flex items-center gap-1 transition-colors"
                    title={`${strInfo.name} teli için perde seçiciyi aç`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Seç</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fret Selector Modal / Dialog */}
        {activeSelectorStringIndex !== null && (
          <div className="p-4 bg-white border border-blue-200 rounded-xl shadow-md space-y-3 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <span className="text-xs font-bold text-stone-800">
                {GUITAR_STRINGS[activeSelectorStringIndex].name} Teli İçin Perde Seçin
              </span>
              <button
                onClick={() => setActiveSelectorStringIndex(null)}
                className="text-stone-400 hover:text-stone-600 p-1"
                aria-label="Seçiciyi Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick choices: Muted (X) and Open (0) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectFretFromPicker('X')}
                className="py-2 px-3 text-xs font-bold rounded-lg border border-stone-300 bg-stone-100 hover:bg-stone-200 text-stone-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="w-4 h-4 rounded-full bg-stone-300 flex items-center justify-center text-[10px]">
                  ✕
                </span>
                X (Susturulmuş Tel)
              </button>
              <button
                type="button"
                onClick={() => handleSelectFretFromPicker(0)}
                className="py-2 px-3 text-xs font-bold rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="w-4 h-4 rounded-full bg-emerald-200 flex items-center justify-center text-[10px]">
                  0
                </span>
                0 (Boş Tel)
              </button>
            </div>

            {/* Frets 1 through 24 */}
            <div>
              <div className="text-[11px] font-semibold text-stone-500 mb-1.5">
                Perde Numarası (1 - 24):
              </div>
              <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto p-1">
                {Array.from({ length: 24 }, (_, i) => i + 1).map((fret) => (
                  <button
                    key={fret}
                    type="button"
                    onClick={() => handleSelectFretFromPicker(fret)}
                    className="h-8 text-xs font-bold rounded-md border border-stone-200 bg-stone-50 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-stone-800 transition-colors"
                  >
                    {fret}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Live Recognized Chord & Note Breakdown */}
        <div className="p-4 bg-[#f8f7f2] border border-[#e4e1d7] rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Tanınan Akor Bilgisi
            </span>
            {liveRecognizedChord && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  liveRecognizedChord.isAmbiguous
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}
              >
                {liveRecognizedChord.isAmbiguous ? 'Belirsiz / Alternatifler Var' : 'Yüksek Güven'}
              </span>
            )}
          </div>

          {liveRecognizedChord ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-stone-900 tracking-tight font-serif">
                  {manualName.trim() || liveRecognizedChord.chordName}
                </span>
                <span className="text-xs text-stone-500 font-medium">
                  {liveRecognizedChord.explanation}
                </span>
              </div>

              {/* Sounding notes breakdown */}
              <div className="text-xs text-stone-600 bg-white/80 p-2.5 rounded-lg border border-stone-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-stone-700">Duyulan Sesler:</span>
                  <span className="font-mono text-stone-900 font-bold">
                    {liveSoundingNotes.map((n) => n.pitch).join(', ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-500">
                  <span>Yazılan Notalar (Porte):</span>
                  <span className="font-mono">
                    {liveSoundingNotes.map((n) => n.writtenPitch).join(', ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1 border-t border-stone-100">
                  <span>Varsayılan Süre:</span>
                  <span>1/4 Dörtlük Nota (Varsayılan)</span>
                </div>
              </div>

              {/* Ambiguity alternatives picker */}
              {liveRecognizedChord.alternatives.length > 0 && (
                <div className="text-xs text-stone-600 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/80">
                  <span className="text-[11px] font-semibold text-amber-900 block mb-1">
                    Alternatif İsimlendirmeler:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {liveRecognizedChord.alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => setManualName(alt)}
                        className="px-2 py-0.5 text-xs bg-white hover:bg-amber-100 border border-amber-300 rounded text-amber-900 transition-colors"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Name Correction Field */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualNameEdit(!showManualNameEdit)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>
                    {showManualNameEdit
                      ? 'Manuel İsmi Gizle'
                      : manualName
                        ? `Özel İsim: ${manualName} (Düzenle)`
                        : 'Akor Adını Manuel Düzelt'}
                  </span>
                </button>

                {showManualNameEdit && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Örn: Am7, Cadd9..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:border-blue-500 outline-none"
                    />
                    {manualName && (
                      <button
                        type="button"
                        onClick={() => setManualName('')}
                        className="px-2 py-1 text-xs text-stone-500 hover:text-stone-700 bg-stone-100 rounded-lg"
                      >
                        Sıfırla
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-stone-500 italic py-2">
              Tüm 6 tel için değer girildiğinde akor otomatik olarak tanınacak ve notalar gösterilecektir.
            </div>
          )}
        </div>

        {/* Main Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          {selectedChord ? (
            <>
              {onOpenSubstitution && (
                <button
                  type="button"
                  onClick={onOpenSubstitution}
                  className="col-span-2 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Akor Alternatifleri (Öneriler)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-2xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Akoru Güncelle</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteChord(selectedChord.id)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold text-xs transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Akoru Sil</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="col-span-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Akor Ekle (Enter)</span>
              </button>
            </>
          )}
        </div>

        {/* Quick Presets for Guitarists */}
        <div className="pt-2 border-t border-stone-200/60">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider block mb-2">
            Hızlı Hazır Akorlar (TAB):
          </span>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { name: 'Am', frets: [0, 1, 2, 2, 0, 'X'] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'C', frets: [0, 1, 0, 2, 3, 'X'] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'D', frets: [2, 3, 2, 0, 'X', 'X'] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'Em', frets: [0, 0, 0, 2, 2, 0] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'G', frets: [3, 0, 0, 0, 2, 3] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'F', frets: [1, 1, 2, 3, 3, 1] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'A', frets: [0, 2, 2, 2, 0, 'X'] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'E', frets: [0, 0, 1, 2, 2, 0] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'Dm', frets: [1, 3, 2, 0, 'X', 'X'] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
              { name: 'G7', frets: [1, 0, 0, 0, 2, 3] as [FretValue, FretValue, FretValue, FretValue, FretValue, FretValue] },
            ].map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset.frets)}
                className="py-1 px-2 text-xs font-semibold rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
};
