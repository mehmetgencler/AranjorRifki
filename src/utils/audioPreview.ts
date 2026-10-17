/**
 * Lightweight browser Web Audio synthesizer for guitar chord auditioning
 */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Play a guitar strum of the given sounding MIDI pitches
 */
export function playChordPitches(midiPitches: number[], duration = 1.4): void {
  const ctx = getAudioContext();
  if (!ctx || !midiPitches || midiPitches.length === 0) return;

  const now = ctx.currentTime;
  const sorted = [...midiPitches].sort((a, b) => a - b);

  sorted.forEach((midi, idx) => {
    const stringStrumDelay = idx * 0.035; // Slight guitar strum roll delay
    const noteTime = now + stringStrumDelay;
    const freq = midiToFrequency(midi);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Warm guitar-like harmonic timbre (triangle wave with subtle decay)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteTime);

    gain.gain.setValueAtTime(0, noteTime);
    gain.gain.linearRampToValueAtTime(0.18, noteTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteTime);
    osc.stop(noteTime + duration);
  });
}
