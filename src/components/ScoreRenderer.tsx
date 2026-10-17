import React, { useEffect, useRef, useState } from 'react';
import {
  Renderer,
  Stave,
  StaveNote,
  Accidental,
  Formatter,
  Voice,
  Annotation,
  Barline,
  BarlineType,
} from 'vexflow';
import { ChordEvent } from '../types.ts';
import { Music, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ScoreRendererProps {
  chords: ChordEvent[];
  selectedChordId: string | null;
  selectedGapAfterIndex: number | null;
  onSelectChord: (chordId: string) => void;
  onOpenSubstitution: () => void;
  onOpenPassingChord: (afterIndex: number) => void;
}

export const ScoreRenderer: React.FC<ScoreRendererProps> = ({
  chords,
  selectedChordId,
  selectedGapAfterIndex,
  onSelectChord,
  onOpenSubstitution,
  onOpenPassingChord,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '';

    // Layout dimensions - generous spacing for clear reading
    const staffHeight = 220;
    const startX = 20;
    const startY = 50;
    const firstMeasureWidth = 330; // Extra width for clef & time signature
    const nextMeasureWidth = 280;

    // Group chords into measures of 4 quarter notes each
    const chordsPerMeasure = 4;
    const totalMeasures = Math.max(1, Math.ceil(chords.length / chordsPerMeasure));

    // Calculate total required width
    const totalScoreWidth =
      startX + firstMeasureWidth + Math.max(0, totalMeasures - 1) * nextMeasureWidth + 60;

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(Math.max(680, totalScoreWidth), staffHeight);
    const context = renderer.getContext();
    context.clear();

    let currentX = startX;

    for (let m = 0; m < totalMeasures; m++) {
      const isFirst = m === 0;
      const isLast = m === totalMeasures - 1;
      const measureWidth = isFirst ? firstMeasureWidth : nextMeasureWidth;

      const stave = new Stave(currentX, startY, measureWidth);

      if (isFirst) {
        stave.addClef('treble');
        stave.addTimeSignature('4/4');
      }

      // Add clean measure number without colliding border box
      stave.setMeasure(m + 1);

      // Set end barline
      if (isLast) {
        stave.setEndBarType(BarlineType.END);
      } else {
        stave.setEndBarType(BarlineType.SINGLE);
      }

      stave.setContext(context).draw();

      // Get chords in this measure
      const measureChords = chords.slice(m * chordsPerMeasure, (m + 1) * chordsPerMeasure);

      if (measureChords.length > 0) {
        const vexNotes: StaveNote[] = [];

        measureChords.forEach((chord) => {
          const isSelected = chord.id === selectedChordId;

          // Note: vexKeys are already sorted by pitch ascending in chordModel
          const staveNote = new StaveNote({
            keys: chord.vexKeys.length > 0 ? chord.vexKeys : ['b/4'],
            duration: 'q',
            clef: 'treble',
            autoStem: true,
          });

          // Style noteheads & stem
          if (isSelected) {
            staveNote.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
          } else {
            staveNote.setStyle({ fillStyle: '#18181b', strokeStyle: '#18181b' });
          }

          // Accidentals
          chord.vexAccidentals.forEach(({ index, acc }) => {
            const accidental = new Accidental(acc);
            if (isSelected) {
              accidental.setStyle({ fillStyle: '#2563eb', strokeStyle: '#2563eb' });
            }
            staveNote.addModifier(accidental, index);
          });

          // Chord Name Annotation above noteheads
          const chordName = chord.effectiveChordName;
          const annotation = new Annotation(chordName);
          annotation
            .setFont('sans-serif', isSelected ? 14 : 13, isSelected ? 'bold' : '600')
            .setVerticalJustification(Annotation.VerticalJustify.TOP);

          if (isSelected) {
            annotation.setStyle({ fillStyle: '#1d4ed8' });
          } else {
            annotation.setStyle({ fillStyle: '#374151' });
          }

          staveNote.addModifier(annotation, 0);

          vexNotes.push(staveNote);
        });

        try {
          const voice = new Voice({
            num_beats: vexNotes.length,
            beat_value: 4,
          }).setMode(Voice.Mode.SOFT);

          voice.addTickables(vexNotes);

          const availableWidth = isFirst ? measureWidth - 90 : measureWidth - 30;
          new Formatter().joinVoices([voice]).format([voice], Math.max(availableWidth, 120));
          voice.draw(context, stave);

          // Add interactive click listener and cursor styling to SVG elements
          vexNotes.forEach((vNote, idx) => {
            const targetChord = measureChords[idx];
            const svgGroup = vNote.getSVGElement();
            if (svgGroup) {
              svgGroup.style.cursor = 'pointer';
              svgGroup.setAttribute('role', 'button');
              svgGroup.setAttribute(
                'aria-label',
                `${targetChord.effectiveChordName} akorunu seç (Ölçü ${m + 1}, Vuruş ${idx + 1})`
              );
              svgGroup.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelectChord(targetChord.id);
              });
            }
          });
        } catch (err) {
          console.warn('VexFlow formatting notice:', err);
        }
      }

      currentX += measureWidth;
    }
  }, [chords, selectedChordId, onSelectChord]);

  return (
    <div className="flex flex-col h-full bg-[#fcfbf7] border border-[#e7e4dc] rounded-xl shadow-xs overflow-hidden">
      {/* Score Header & Controls */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#ece8df] bg-[#fbf9f2]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-900/10 text-amber-950 flex items-center justify-center">
            <Music className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-stone-900 tracking-tight">Nota Portesi (Treble Staff)</h2>
            <p className="text-xs text-stone-500">
              {chords.length === 0
                ? 'Akor eklenmedi'
                : `${chords.length} akor • ${Math.ceil(chords.length / 4)} ölçü • 4/4 Zaman`}
            </p>
          </div>
        </div>

        {/* Viewport Zoom & Info */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center text-xs text-stone-500 bg-stone-100/80 px-2.5 py-1 rounded-md border border-stone-200/60">
            <span>Duyulan: 1 oktav pes • Yazılan: 8va treble</span>
          </div>
          <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 hover:bg-stone-50 text-stone-600 transition-colors"
              title="Uzaklaştır"
              aria-label="Porteyi Uzaklaştır"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-2 text-stone-600 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 hover:bg-stone-50 text-stone-600 transition-colors"
              title="Yakınlaştır"
              aria-label="Porteyi Yakınlaştır"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom !== 1 && (
              <button
                onClick={() => setZoom(1)}
                className="p-1.5 hover:bg-stone-50 text-stone-500 border-l border-stone-200 transition-colors"
                title="Sıfırla"
                aria-label="Yakınlaştırmayı Sıfırla"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Horizontally scrollable sheet-music canvas */}
      <div className="relative flex-1 overflow-x-auto overflow-y-hidden p-6 bg-[#fcfbf7] select-none">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            minHeight: '230px',
          }}
          className="inline-block transition-transform duration-100 ease-out"
        >
          <div
            ref={containerRef}
            className="score-svg-container"
            data-testid="vexflow-score-container"
          />
        </div>
      </div>

      {/* Synchronized Progression Strip Below Score */}
      <div className="border-t border-[#ece8df] bg-[#f7f5ee] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Akor Akışı ({chords.length})
            </span>
            {selectedChordId && (
              <button
                type="button"
                onClick={onOpenSubstitution}
                className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-md shadow-2xs transition-all animate-pulse"
                title="Seçili akor için alternatifler öner"
              >
                <span>✨ Akor Alternatifleri</span>
              </button>
            )}
          </div>
          <span className="text-xs text-stone-400">
            Seçmek için akora, aralık eklemek için + tuşuna tıklayın
          </span>
        </div>

        {chords.length === 0 ? (
          <div className="py-4 text-center text-xs text-stone-500 italic bg-white/60 rounded-lg border border-dashed border-stone-200">
            Henüz akor eklenmedi. Sol paneldeki TAB düzenleyicisinden tel perdelerini girip <strong>Akor Ekle</strong> butonuna basın veya Enter tuşuna dokunun.
          </div>
        ) : (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {chords.map((chord, idx) => {
              const isSelected = chord.id === selectedChordId;
              const measureNum = Math.floor(idx / 4) + 1;
              const beatNum = (idx % 4) + 1;
              const hasNext = idx < chords.length - 1;
              const isGapSelected = selectedGapAfterIndex === idx;

              return (
                <React.Fragment key={chord.id}>
                  <button
                    onClick={() => onSelectChord(chord.id)}
                    className={`flex flex-col items-center min-w-[76px] p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-white hover:bg-stone-50/80 border-stone-200/90 shadow-2xs'
                    }`}
                    aria-label={`${chord.effectiveChordName} akoru, Ölçü ${measureNum}, Vuruş ${beatNum}`}
                  >
                    <span className="text-[10px] text-stone-400 font-medium tracking-tight">
                      Ö{measureNum}:V{beatNum}
                    </span>
                    <span
                      className={`text-base font-bold my-0.5 tracking-tight ${
                        isSelected ? 'text-blue-700' : 'text-stone-800'
                      }`}
                    >
                      {chord.effectiveChordName}
                    </span>
                    <span className="text-[9px] font-mono text-stone-500 bg-stone-100/90 px-1 py-0.5 rounded">
                      {chord.strings.map((s) => (s === 'X' ? 'x' : s)).join(' ')}
                    </span>
                  </button>

                  {/* Passing Chord Gap Trigger between adjacent chords */}
                  {hasNext && (
                    <button
                      type="button"
                      onClick={() => onOpenPassingChord(idx)}
                      className={`px-1.5 py-2.5 rounded-md border text-[10px] font-bold transition-all shrink-0 flex flex-col items-center gap-0.5 ${
                        isGapSelected
                          ? 'bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-300'
                          : 'bg-stone-100/80 hover:bg-amber-50 hover:border-amber-300 text-stone-500 hover:text-amber-800 border-dashed border-stone-300'
                      }`}
                      title={`${chord.effectiveChordName} ile ${chords[idx + 1].effectiveChordName} arasına geçiş akoru öner`}
                      aria-label={`${chord.effectiveChordName} ve ${chords[idx + 1].effectiveChordName} arasına geçiş akoru öner`}
                    >
                      <span>+</span>
                      <span className="text-[9px] uppercase">Geçiş</span>
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
