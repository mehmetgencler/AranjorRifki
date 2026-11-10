import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  computePlateModes,
  createParticles,
  materialPresets,
  type MaterialKey,
  type Particle,
} from './chladni';

type AudioMode = 'idle' | 'microphone' | 'file';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatHz = (value: number) => `${value.toFixed(1)} Hz`;

export default function App() {
  const [material, setMaterial] = useState<MaterialKey>('aluminum');
  const [plateLength, setPlateLength] = useState(0.45);
  const [plateThickness, setPlateThickness] = useState(0.004);
  const [youngsModulus, setYoungsModulus] = useState(69e9);
  const [density, setDensity] = useState(2700);
  const [poissonRatio, setPoissonRatio] = useState(0.33);
  const [modalDamping, setModalDamping] = useState(0.028);
  const [inputGain, setInputGain] = useState(1.1);

  const [particleCount, setParticleCount] = useState(1800);
  const [particleSize, setParticleSize] = useState(1.8);
  const [friction, setFriction] = useState(0.08);
  const [restitution, setRestitution] = useState(0.72);
  const [gravity, setGravity] = useState(0.65);
  const [excitationX, setExcitationX] = useState(0.52);
  const [excitationY, setExcitationY] = useState(0.48);
  const [simSpeed, setSimSpeed] = useState(1.2);

  const [isRunning, setIsRunning] = useState(true);
  const [showNodalOverlay, setShowNodalOverlay] = useState(true);
  const [showDisplacement, setShowDisplacement] = useState(true);
  const [showIntensity, setShowIntensity] = useState(true);
  const [particleTrail, setParticleTrail] = useState(0.3);
  const [densityVisualization, setDensityVisualization] = useState(false);

  const [audioMode, setAudioMode] = useState<AudioMode>('idle');
  const [audioError, setAudioError] = useState('');
  const [peakAmplitude, setPeakAmplitude] = useState(0);
  const [rmsAmplitude, setRmsAmplitude] = useState(0);
  const [spectrum, setSpectrum] = useState<number[]>(new Array(64).fill(0));
  const [domFreqs, setDomFreqs] = useState<number[]>([]);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const uiUpdateRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const qRef = useRef({ q: [] as number[], qd: [] as number[], qdd: [] as number[] });
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const fileAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const materialPreset = materialPresets[material];

  const modes = useMemo(
    () =>
      computePlateModes({
        L: plateLength,
        thickness: plateThickness,
        E: youngsModulus,
        density,
        nu: poissonRatio,
        excitationX,
        excitationY,
      }),
    [plateLength, plateThickness, youngsModulus, density, poissonRatio, excitationX, excitationY]
  );

  useEffect(() => {
    qRef.current = {
      q: new Array(modes.length).fill(0),
      qd: new Array(modes.length).fill(0),
      qdd: new Array(modes.length).fill(0),
    };
  }, [modes]);

  useEffect(() => {
    const count = Math.max(200, Math.min(5000, particleCount));
    particlesRef.current = createParticles(count, plateLength, (particleSize + 0.2) * 10);
  }, [particleCount, plateLength, particleSize]);

  useEffect(() => {
    const resetAudioGraph = () => {
      if (fileAudioRef.current) {
        fileAudioRef.current.pause();
        fileAudioRef.current.src = '';
        fileAudioRef.current = null;
      }
      if (mediaSourceRef.current) {
        mediaSourceRef.current.disconnect();
        mediaSourceRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    };

    return () => resetAudioGraph();
  }, []);

  const buildAudioGraph = async () => {
    if (!audioContextRef.current) {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      audioContextRef.current = context;
      analyserRef.current = analyser;
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return analyserRef.current;
  };

  const stopAudioFile = () => {
    if (fileAudioRef.current) {
      fileAudioRef.current.pause();
      fileAudioRef.current.currentTime = 0;
      setAudioPosition(0);
    }
    setAudioMode('idle');
  };

  const stopMicrophone = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    setAudioMode('idle');
  };

  const stopAudio = () => {
    stopAudioFile();
    stopMicrophone();
    setAudioMode('idle');
  };

  const handleMicrophone = async () => {
    try {
      setAudioError('');
      const analyser = await buildAudioGraph();
      if (!analyser) return;

      stopAudioFile();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const source = audioContextRef.current!.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.connect(audioContextRef.current!.destination);
      micStreamRef.current = stream;
      setAudioMode('microphone');
      setIsRunning(true);
    } catch (error) {
      console.error(error);
      setAudioError('Microphone access was denied or is unavailable in this browser.');
      setAudioMode('idle');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setAudioError('');
      const analyser = await buildAudioGraph();
      if (!analyser) return;

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }

      const src = URL.createObjectURL(file);
      const audio = new Audio(src);
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';

      if (fileAudioRef.current) {
        fileAudioRef.current.pause();
      }

      if (mediaSourceRef.current) {
        mediaSourceRef.current.disconnect();
      }

      const source = audioContextRef.current!.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContextRef.current!.destination);
      mediaSourceRef.current = source;
      fileAudioRef.current = audio;

      audio.onloadedmetadata = () => setAudioDuration(audio.duration || 0);
      audio.ontimeupdate = () => setAudioPosition(audio.currentTime || 0);
      audio.onended = () => setAudioMode('idle');

      setAudioMode('file');
      setAudioPosition(0);
      setIsRunning(true);
      await audio.play();
    } catch (error) {
      console.error(error);
      setAudioError('The selected file could not be decoded or is not supported by this browser.');
      setAudioMode('idle');
    }
  };

  const handlePlayPauseFile = async () => {
    if (!fileAudioRef.current) return;
    if (fileAudioRef.current.paused) {
      await fileAudioRef.current.play();
      setAudioMode('file');
    } else {
      fileAudioRef.current.pause();
      setAudioMode('idle');
    }
  };

  const handleSeek = (value: number) => {
    if (!fileAudioRef.current) return;
    fileAudioRef.current.currentTime = value;
    setAudioPosition(value);
  };

  const resetParticles = () => {
    particlesRef.current = createParticles(
      Math.max(200, Math.min(5000, particleCount)),
      plateLength,
      (particleSize + 0.2) * 10 + 77
    );
    qRef.current = {
      q: new Array(modes.length).fill(0),
      qd: new Array(modes.length).fill(0),
      qdd: new Array(modes.length).fill(0),
    };
  };

  const evaluateField = (x: number, y: number) => {
    let displacement = 0;
    let acceleration = 0;
    let slopeX = 0;
    let slopeY = 0;

    for (let i = 0; i < modes.length; i += 1) {
      const mode = modes[i];
      const phi =
        Math.sin((mode.m * Math.PI * x) / plateLength) *
        Math.sin((mode.n * Math.PI * y) / plateLength);

      const dPhiDx =
        (mode.m * Math.PI / plateLength) *
        Math.cos((mode.m * Math.PI * x) / plateLength) *
        Math.sin((mode.n * Math.PI * y) / plateLength);

      const dPhiDy =
        (mode.n * Math.PI / plateLength) *
        Math.sin((mode.m * Math.PI * x) / plateLength) *
        Math.cos((mode.n * Math.PI * y) / plateLength);

      displacement += qRef.current.q[i] * phi;
      acceleration += qRef.current.qdd[i] * phi;
      slopeX += qRef.current.q[i] * dPhiDx;
      slopeY += qRef.current.q[i] * dPhiDy;
    }

    return { displacement, acceleration, slopeX, slopeY };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (time: number) => {
      const dt = Math.min(0.032, (time - lastFrameRef.current) / 1000 || 0.016) * simSpeed;
      lastFrameRef.current = time;

      const analyser = analyserRef.current;
      let rms = 0;
      let peak = 0;
      const currentPeaks: number[] = [];
      const currentSpectrum = new Array(64).fill(0);

      if (analyser && audioContextRef.current) {
        const timeData = new Uint8Array(analyser.fftSize);
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        let timeSum = 0;
        for (let i = 0; i < timeData.length; i += 1) {
          const normalized = (timeData[i] - 128) / 128;
          timeSum += normalized * normalized;
        }
        rms = Math.sqrt(timeSum / timeData.length);
        peak = Math.max(...Array.from(timeData).map((v) => Math.abs(v - 128) / 128));

        for (let i = 0; i < currentSpectrum.length; i += 1) {
          const index = Math.floor((i / currentSpectrum.length) * freqData.length);
          currentSpectrum[i] = freqData[index] / 255;
        }

        const sampleRate = audioContextRef.current.sampleRate;
        const binSize = sampleRate / analyser.fftSize;
        const bins: { freq: number; value: number }[] = [];

        for (let i = 1; i < freqData.length * 0.45; i += 1) {
          const val = freqData[i] / 255;
          if (val > 0.08) {
            bins.push({ freq: i * binSize, value: val });
          }
        }

        const sorted = [...bins].sort((a, b) => b.value - a.value).slice(0, 8);
        currentPeaks.push(...sorted.map((bin) => bin.freq));

        if (time - uiUpdateRef.current > 80) {
          setSpectrum(currentSpectrum);
          setDomFreqs(currentPeaks.slice(0, 6));
          setPeakAmplitude(peak);
          setRmsAmplitude(rms);
          uiUpdateRef.current = time;
        }
      }

      const amplitude = (rms * 1.6 + peak * 1.2) * inputGain;
      const modeSet = qRef.current;

      for (let i = 0; i < modes.length; i += 1) {
        const mode = modes[i];
        const coupling =
          Math.abs(
            Math.sin((mode.m * Math.PI * excitationX) / plateLength) *
              Math.sin((mode.n * Math.PI * excitationY) / plateLength)
          ) + 0.15;

        let modeWeight = 0;
        for (const peakFreq of currentPeaks) {
          const delta = Math.abs(mode.frequencyHz - peakFreq);
          modeWeight += Math.exp(-(delta * delta) / (Math.max(18, mode.frequencyHz * 0.18) ** 2));
        }

        const effectiveDrive = amplitude * coupling * (0.28 + modeWeight) * 0.9;
        const omega = mode.omega;
        const qdd =
          -2 * modalDamping * omega * modeSet.qd[i] -
          omega * omega * modeSet.q[i] +
          effectiveDrive * 26;

        if (!isRunning) {
          modeSet.qd[i] *= 1 - dt * 3.2;
          modeSet.q[i] *= 1 - dt * 2.6;
          modeSet.qdd[i] = 0;
        } else {
          modeSet.qd[i] += qdd * dt * 60;
          modeSet.q[i] += modeSet.qd[i] * dt * 60;
          modeSet.qdd[i] = qdd;
        }
      }

      const particleList = particlesRef.current;
      for (let i = 0; i < particleList.length; i += 1) {
        const p = particleList[i];
        const field = evaluateField(p.x, p.y);
        const localIntensity = Math.abs(field.acceleration) * 0.8 + Math.abs(field.displacement) * 4.5;
        const slopeStrength = Math.min(1.4, Math.abs(field.slopeX) + Math.abs(field.slopeY));

        let ax = (-field.slopeX * 240 * localIntensity) / (0.8 + slopeStrength);
        let ay = (-field.slopeY * 240 * localIntensity) / (0.8 + slopeStrength);

        if (p.z <= 0.06) {
          ax += (Math.random() - 0.5) * 0.03;
          ay += (Math.random() - 0.5) * 0.03;
          p.vx *= 1 - friction * dt * 1.6;
          p.vy *= 1 - friction * dt * 1.6;

          if (localIntensity < 0.15) {
            p.vx *= 0.96;
            p.vy *= 0.96;
          }
        }

        p.vx += ax * dt * 60;
        p.vy += ay * dt * 60;
        p.vz -= gravity * dt * 22;

        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.z += p.vz * dt * 60;

        if (p.x < 0 || p.x > plateLength) {
          p.x = clamp(p.x, 0, plateLength);
          p.vx *= -0.7;
        }
        if (p.y < 0 || p.y > plateLength) {
          p.y = clamp(p.y, 0, plateLength);
          p.vy *= -0.7;
        }

        if (p.z <= 0) {
          p.z = 0;
          p.vz = Math.abs(p.vz) * restitution * 0.65;
          if (Math.abs(p.vz) < 0.01) p.vz = 0;
        }

        const BOUNCE_HEIGHT = 0.12 + Math.abs(field.displacement) * 0.22;
        if (p.z < BOUNCE_HEIGHT && localIntensity > 0.2) {
          p.z = BOUNCE_HEIGHT;
          p.vz = Math.max(0.2, p.vz + Math.abs(field.acceleration) * 0.8);
        }
      }

      const width = canvas.width;
      const height = canvas.height;
      const pad = width * 0.1;
      const size = width - pad * 2;
      const platePx = size;
      const plateLeft = (width - platePx) / 2;
      const plateTop = (height - platePx) / 2;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0d1116';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#1d232b';
      ctx.fillRect(plateLeft, plateTop, platePx, platePx);
      ctx.strokeStyle = '#9ca9b6';
      ctx.lineWidth = 2;
      ctx.strokeRect(plateLeft, plateTop, platePx, platePx);

      if (showDisplacement) {
        const cells = 18;
        const cellSize = platePx / cells;
        const maxAmp = Math.max(0.0001, ...Array.from({ length: cells * cells }, (_, index) => {
          const cx = index % cells;
          const cy = Math.floor(index / cells);
          const x = (cx + 0.5) * cellSize + plateLeft;
          const y = (cy + 0.5) * cellSize + plateTop;
          return Math.abs(evaluateField((x - plateLeft) / platePx * plateLength, (y - plateTop) / platePx * plateLength).displacement);
        }));

        for (let ix = 0; ix < cells; ix += 1) {
          for (let iy = 0; iy < cells; iy += 1) {
            const px = plateLeft + ix * cellSize;
            const py = plateTop + iy * cellSize;
            const field = evaluateField(
              ((px - plateLeft) / platePx) * plateLength,
              ((py - plateTop) / platePx) * plateLength
            );
            const amt = clamp(Math.abs(field.displacement) / maxAmp, 0, 1);
            ctx.fillStyle = `rgba(${90 + amt * 120}, ${110 + amt * 90}, 180, ${0.18 + amt * 0.38})`;
            ctx.fillRect(px, py, cellSize, cellSize);
          }
        }
      }

      if (showIntensity) {
        const cells = 24;
        const cellSize = platePx / cells;
        for (let ix = 0; ix < cells; ix += 1) {
          for (let iy = 0; iy < cells; iy += 1) {
            const px = plateLeft + ix * cellSize;
            const py = plateTop + iy * cellSize;
            const field = evaluateField(
              ((px - plateLeft) / platePx) * plateLength,
              ((py - plateTop) / platePx) * plateLength
            );
            const active = Math.min(1, (Math.abs(field.acceleration) + Math.abs(field.displacement) * 3) * 0.7);
            ctx.fillStyle = `rgba(255, ${180 + active * 55}, ${120 + active * 90}, ${0.08 + active * 0.24})`;
            ctx.fillRect(px, py, cellSize, cellSize);
          }
        }
      }

      if (showNodalOverlay) {
        const cells = 20;
        const cellSize = platePx / cells;
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.38)';
        ctx.lineWidth = 1;
        for (let ix = 0; ix < cells; ix += 1) {
          for (let iy = 0; iy < cells; iy += 1) {
            const px = plateLeft + ix * cellSize;
            const py = plateTop + iy * cellSize;
            const center = evaluateField(
              ((px + cellSize / 2 - plateLeft) / platePx) * plateLength,
              ((py + cellSize / 2 - plateTop) / platePx) * plateLength
            );
            const val = Math.abs(center.displacement) * 0.2 + Math.abs(center.acceleration) * 0.8;
            if (val < 0.08) {
              ctx.beginPath();
              ctx.arc(px + cellSize * 0.5, py + cellSize * 0.5, 1.3, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(155, 240, 255, 0.5)';
              ctx.fill();
            }
          }
        }
      }

      const trailAlpha = clamp(particleTrail, 0, 1);
      if (trailAlpha > 0) {
        ctx.fillStyle = `rgba(9, 14, 18, ${Math.max(0.08, 0.92 - trailAlpha)})`;
        ctx.fillRect(plateLeft - 2, plateTop - 2, platePx + 4, platePx + 4);
      }

      const particleRadius = Math.max(1.2, particleSize);
      for (let i = 0; i < particleList.length; i += 1) {
        const p = particleList[i];
        const px = plateLeft + (p.x / plateLength) * platePx;
        const py = plateTop + (p.y / plateLength) * platePx;
        const local = evaluateField(p.x, p.y);
        const glow = clamp(Math.abs(local.acceleration) * 0.8 + Math.abs(local.displacement) * 2.6, 0, 1);

        ctx.beginPath();
        ctx.fillStyle = densityVisualization
          ? `rgba(${150 + glow * 80}, ${200 + glow * 35}, 255, ${0.8 + glow * 0.2})`
          : `rgba(230, 236, 242, ${0.9 - glow * 0.2})`;
        ctx.arc(px, py, particleRadius * (0.7 + glow * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      const rawAudio = analyser && audioContextRef.current ? `${rms.toFixed(3)} / ${peak.toFixed(3)}` : '0.000 / 0.000';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px sans-serif';
      ctx.fillText(rawAudio, plateLeft + 14, plateTop + 18);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [modes, material, isRunning, simSpeed, particleTrail, densityVisualization, particleSize, plateLength, friction, restitution, gravity, inputGain, excitationX, excitationY, showDisplacement, showIntensity, showNodalOverlay]);

  const activeModes = modes
    .map((mode, index) => ({ ...mode, index }))
    .filter((mode) => {
      const qAmp = Math.abs(qRef.current.q[mode.index]);
      return qAmp > 0.02;
    })
    .slice(0, 8);

  const primaryFrequencies = activeModes.map((mode) => mode.frequencyHz);

  return (
    <div className="min-h-screen bg-[#0a0d11] text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/50 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-400">Experimental plate dynamics</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Real-time Chladni particle simulator</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <button
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-cyan-300 hover:bg-cyan-500/20"
                onClick={handleMicrophone}
              >
                Microphone
              </button>
              <label className="cursor-pointer rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-violet-300 hover:bg-violet-500/20">
                Upload audio
                <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
              </label>
              <button
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 hover:bg-slate-700"
                onClick={() => setIsRunning((value) => !value)}
              >
                {isRunning ? 'Pause' : 'Resume'}
              </button>
              <button
                className="rounded-lg border border-rose-700/50 bg-rose-500/10 px-3 py-2 text-rose-300 hover:bg-rose-500/20"
                onClick={() => {
                  stopAudio();
                  setIsRunning(false);
                }}
              >
                Stop
              </button>
              <button
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 hover:bg-slate-700"
                onClick={resetParticles}
              >
                Reset particles
              </button>
            </div>
          </div>
        </header>

        <main className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)_320px]">
          <aside className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/50">
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Audio</h2>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Input level</span>
                    <span>{peakAmplitude.toFixed(3)}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500"
                      style={{ width: `${clamp(peakAmplitude * 100, 0, 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    <span>RMS</span>
                    <span>{rmsAmplitude.toFixed(3)}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-3 flex justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    <span>Spectrum</span>
                    <span>{audioMode}</span>
                  </div>
                  <div className="flex h-20 items-end gap-[2px]">
                    {spectrum.map((value, index) => (
                      <div
                        key={`${value}-${index}`}
                        className="w-full rounded-t-sm bg-gradient-to-t from-cyan-500 via-violet-500 to-fuchsia-500"
                        style={{ height: `${Math.max(8, value * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-300">
                    {domFreqs.length > 0 ? domFreqs.map(formatHz).join(' • ') : 'No strong peaks detected'}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <label className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-slate-400">Input gain</label>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.05"
                    value={inputGain}
                    onChange={(event) => setInputGain(Number(event.target.value))}
                    className="w-full accent-cyan-400"
                  />
                  <div className="mt-2 text-right text-xs text-slate-300">{inputGain.toFixed(2)}x</div>
                </div>

                {audioMode === 'file' && fileAudioRef.current && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      <span>Playback</span>
                      <span>{audioDuration ? `${(audioPosition / audioDuration) * 100 | 0}%` : '0%'}</span>
                    </div>
                    <div className="mb-2 flex gap-2">
                      <button
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                        onClick={handlePlayPauseFile}
                      >
                        {fileAudioRef.current.paused ? 'Play' : 'Pause'}
                      </button>
                      <button
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                        onClick={() => {
                          if (fileAudioRef.current) {
                            fileAudioRef.current.currentTime = 0;
                            setAudioPosition(0);
                          }
                        }}
                      >
                        Stop
                      </button>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={audioDuration || 0}
                      step="0.01"
                      value={audioPosition}
                      onChange={(event) => handleSeek(Number(event.target.value))}
                      className="w-full accent-violet-400"
                    />
                  </div>
                )}
              </div>
            </div>

            {audioError && (
              <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200">
                {audioError}
              </div>
            )}
          </aside>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-xl shadow-slate-950/50">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              <span>Plate</span>
              <span>{materialPreset.label}</span>
            </div>
            <div className="mx-auto aspect-square max-w-[860px] overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
              <canvas ref={canvasRef} width={900} height={900} className="block h-full w-full" />
            </div>
          </section>

          <aside className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/50">
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Plate properties</h2>
              <div className="space-y-3 text-xs text-slate-300">
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-400">Material</span>
                  <select
                    value={material}
                    onChange={(event) => {
                      const next = event.target.value as MaterialKey;
                      setMaterial(next);
                      const preset = materialPresets[next];
                      setYoungsModulus(preset.E);
                      setDensity(preset.density);
                      setPoissonRatio(preset.nu);
                    }}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-200"
                  >
                    {Object.entries(materialPresets).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                  </select>
                </label>

                <ControlRow label="Length" value={plateLength.toFixed(3)}>
                  <input type="range" min="0.20" max="0.90" step="0.01" value={plateLength} onChange={(e) => setPlateLength(Number(e.target.value))} className="w-full accent-cyan-400" />
                </ControlRow>
                <ControlRow label="Thickness" value={plateThickness.toFixed(4)}>
                  <input type="range" min="0.001" max="0.02" step="0.0005" value={plateThickness} onChange={(e) => setPlateThickness(Number(e.target.value))} className="w-full accent-cyan-400" />
                </ControlRow>
                <ControlRow label="E" value={`${youngsModulus / 1e9} GPa`}>
                  <input type="range" min="3" max="210" step="1" value={youngsModulus / 1e9} onChange={(e) => setYoungsModulus(Number(e.target.value) * 1e9)} className="w-full accent-cyan-400" />
                </ControlRow>
                <ControlRow label="Density" value={`${density.toFixed(0)} kg/m³`}>
                  <input type="range" min="1000" max="9000" step="50" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full accent-cyan-400" />
                </ControlRow>
                <ControlRow label="Poisson" value={poissonRatio.toFixed(2)}>
                  <input type="range" min="0.2" max="0.4" step="0.01" value={poissonRatio} onChange={(e) => setPoissonRatio(Number(e.target.value))} className="w-full accent-cyan-400" />
                </ControlRow>
                <ControlRow label="Damping" value={modalDamping.toFixed(3)}>
                  <input type="range" min="0.005" max="0.08" step="0.002" value={modalDamping} onChange={(e) => setModalDamping(Number(e.target.value))} className="w-full accent-cyan-400" />
                </ControlRow>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Simulation</h2>
              <div className="space-y-3 text-xs text-slate-300">
                <ControlRow label="Particle count" value={`${particleCount}`}>
                  <input type="range" min="500" max="4000" step="100" value={particleCount} onChange={(e) => setParticleCount(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Particle size" value={particleSize.toFixed(2)}>
                  <input type="range" min="1" max="4" step="0.2" value={particleSize} onChange={(e) => setParticleSize(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Friction" value={friction.toFixed(2)}>
                  <input type="range" min="0.01" max="0.4" step="0.01" value={friction} onChange={(e) => setFriction(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Restitution" value={restitution.toFixed(2)}>
                  <input type="range" min="0.2" max="0.95" step="0.02" value={restitution} onChange={(e) => setRestitution(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Gravity" value={gravity.toFixed(2)}>
                  <input type="range" min="0" max="1.5" step="0.05" value={gravity} onChange={(e) => setGravity(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Excit. X" value={excitationX.toFixed(2)}>
                  <input type="range" min="0.15" max="0.85" step="0.01" value={excitationX} onChange={(e) => setExcitationX(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Excit. Y" value={excitationY.toFixed(2)}>
                  <input type="range" min="0.15" max="0.85" step="0.01" value={excitationY} onChange={(e) => setExcitationY(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
                <ControlRow label="Speed" value={simSpeed.toFixed(2)}>
                  <input type="range" min="0.4" max="2.5" step="0.1" value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} className="w-full accent-violet-400" />
                </ControlRow>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Visualization</h2>
              <div className="space-y-2 text-xs text-slate-200">
                <ToggleRow label="Nodal overlay" checked={showNodalOverlay} onChange={setShowNodalOverlay} />
                <ToggleRow label="Displacement" checked={showDisplacement} onChange={setShowDisplacement} />
                <ToggleRow label="Intensity" checked={showIntensity} onChange={setShowIntensity} />
                <ControlRow label="Trail" value={particleTrail.toFixed(2)}>
                  <input type="range" min="0" max="1" step="0.05" value={particleTrail} onChange={(e) => setParticleTrail(Number(e.target.value))} className="w-full accent-pink-400" />
                </ControlRow>
                <ToggleRow label="Density map" checked={densityVisualization} onChange={setDensityVisualization} />
              </div>
            </div>
          </aside>
        </main>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/50">
          <div className="grid gap-4 lg:grid-cols-4">
            <Metric label="Detected audio peaks" value={domFreqs.length > 0 ? domFreqs.map((freq) => formatHz(freq)).join(', ') : 'None'} />
            <Metric label="Natural frequencies" value={modes.slice(0, 5).map((mode) => formatHz(mode.frequencyHz)).join(' · ')} />
            <Metric label="Activated modes" value={primaryFrequencies.length > 0 ? primaryFrequencies.map((freq) => formatHz(freq)).join(' · ') : 'Idle'} />
            <Metric label="Particles" value={`${particlesRef.current.length}`} />
          </div>
        </section>
      </div>
    </div>
  );
}

function ControlRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</span>
        <span className="font-mono text-[11px] text-slate-200">{value}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200">
      <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">{label}</span>
      <button
        type="button"
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full border transition ${checked ? 'border-cyan-500 bg-cyan-500/50' : 'border-slate-700 bg-slate-800'}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="text-sm text-slate-100">{value}</div>
    </div>
  );
}






























































































































































































































































































































































