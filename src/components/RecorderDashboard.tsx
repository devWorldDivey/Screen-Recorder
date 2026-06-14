import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Video, Mic, Volume2, Monitor, AlertCircle, Sparkles, CheckCircle } from 'lucide-react';
import { RecordingSettings, VideoProject } from '../types';
import { saveProject } from '../lib/db';

interface RecorderDashboardProps {
  onRecordingComplete: (project: VideoProject) => void;
  settings: RecordingSettings;
  setSettings: React.Dispatch<React.SetStateAction<RecordingSettings>>;
  isWebcamActive: boolean;
  setIsWebcamActive: (active: boolean) => void;
}

export default function RecorderDashboard({
  onRecordingComplete,
  settings,
  setSettings,
  isWebcamActive,
  setIsWebcamActive
}: RecorderDashboardProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [browserCapabilities, setBrowserCapabilities] = useState<string[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Detect supported formats
    const formats = [];
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      formats.push('WebM VP9 High-Res');
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      formats.push('WebM VP8 Standard');
    } else {
      formats.push('WebM Default');
    }
    setBrowserCapabilities(formats);

    return () => {
      stopAllStreams();
      stopTimer();
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeElapsed(0);
  };

  const stopAllStreams = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicLevel(0);
  };

  const startAudioVisualizer = (micStream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(micStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setMicLevel(normalized);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn('Audio Context visualizer initialization failed', e);
    }
  };

  const handleStartRecording = async () => {
    setError(null);
    chunksRef.current = [];

    // Resolution preset configuration
    const resConfigMap = {
      '720p': { width: 1280, height: 720 },
      '1080p': { width: 1920, height: 1080 },
      '1440p': { width: 2560, height: 1440 },
      '4k': { width: 3840, height: 2160 }
    };

    const targetRes = resConfigMap[settings.resolution];

    try {
      // 1. Get display capture media stream
      const displayConstraints: DisplayMediaStreamOptions = {
        video: {
          width: { ideal: targetRes.width },
          height: { ideal: targetRes.height },
          frameRate: { ideal: settings.fps }
        },
        audio: settings.recordSystemAudio ? {
          echoCancellation: true,
          noiseSuppression: true
        } : false
      };

      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      
      let finalStream = displayStream;
      let micStream: MediaStream | null = null;

      // 2. Obtain mic audio if requested
      if (settings.recordMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          startAudioVisualizer(micStream);
        } catch (micErr) {
          console.warn('Microphone access denied or failed. Recording video without mic stream.', micErr);
          setError('Microphone permission denied. Continuing without vocal recording.');
        }
      }

      // 3. Audio Mixing Pipeline (system display audio + mic stream)
      const audioTracks: MediaStreamTrack[] = [];
      const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
      const hasMicAudio = micStream && micStream.getAudioTracks().length > 0;

      if (hasDisplayAudio || hasMicAudio) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const dest = audioCtx.createMediaStreamDestination();

          let masterInputNode: AudioNode = dest;

          // Configure professional-grade dynamic volume range limiter / make-up gain normalizer
          if (settings.autoNormalizeAudio) {
            // Master Compressor: smoothes out loud spikes, levels conversational voice and system audio
            const masterCompressor = audioCtx.createDynamicsCompressor();
            masterCompressor.threshold.setValueAtTime(-22, audioCtx.currentTime);
            masterCompressor.knee.setValueAtTime(25, audioCtx.currentTime);
            masterCompressor.ratio.setValueAtTime(8, audioCtx.currentTime);
            masterCompressor.attack.setValueAtTime(0.005, audioCtx.currentTime);
            masterCompressor.release.setValueAtTime(0.20, audioCtx.currentTime);

            // Master Gain: brings up signals evenly (makeup gain) to reach a solid, audible output level
            const masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(1.5, audioCtx.currentTime); // ~3.5dB makeup boost

            masterCompressor.connect(masterGain);
            masterGain.connect(dest);
            masterInputNode = masterCompressor;
          }

          if (hasDisplayAudio) {
            const displayAudioSource = audioCtx.createMediaStreamSource(new MediaStream([displayStream.getAudioTracks()[0]]));
            if (settings.autoNormalizeAudio) {
              const systemGain = audioCtx.createGain();
              // Prevent browser system audio from completely drowning the presenter's voice
              systemGain.gain.setValueAtTime(hasMicAudio ? 0.7 : 1.0, audioCtx.currentTime);
              displayAudioSource.connect(systemGain);
              systemGain.connect(masterInputNode);
            } else {
              displayAudioSource.connect(masterInputNode);
            }
          }

          if (hasMicAudio && micStream) {
            const micAudioSource = audioCtx.createMediaStreamSource(new MediaStream([micStream.getAudioTracks()[0]]));
            if (settings.autoNormalizeAudio) {
              // Standard professional 1.8x pre-amplifier booster for microphonic audio input
              const micGain = audioCtx.createGain();
              micGain.gain.setValueAtTime(1.8, audioCtx.currentTime);

              const micCompressor = audioCtx.createDynamicsCompressor();
              micCompressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
              micCompressor.knee.setValueAtTime(12, audioCtx.currentTime);
              micCompressor.ratio.setValueAtTime(4, audioCtx.currentTime);
              micCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
              micCompressor.release.setValueAtTime(0.08, audioCtx.currentTime);

              micAudioSource.connect(micGain);
              micGain.connect(micCompressor);
              micCompressor.connect(masterInputNode);
            } else {
              micAudioSource.connect(masterInputNode);
            }
          }

          audioTracks.push(...dest.stream.getAudioTracks());
        } catch (mixErr) {
          console.warn('Advanced audio mixing and normalization failed, falling back.', mixErr);
          // Fallback: put both tracks directly onto final stream
          if (hasDisplayAudio) audioTracks.push(displayStream.getAudioTracks()[0]);
          if (hasMicAudio && micStream) audioTracks.push(micStream.getAudioTracks()[0]);
        }
      }

      // 4. Combine Video Track and Mixed Audio Tracks
      const finalTracks = [
        displayStream.getVideoTracks()[0],
        ...audioTracks
      ];

      finalStream = new MediaStream(finalTracks);
      streamRef.current = finalStream;

      // 5. Setup MediaRecorder Options
      let options = { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 10000000 }; // 10Mbps ideal link
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 6000000 };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm', videoBitsPerSecond: 5000000 };
      }

      const recorder = new MediaRecorder(finalStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopTimer();
        stopAllStreams();
        setIsRecording(false);

        const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
        const recordDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
        
        // Setup metadata resolution
        let recWidth = targetRes.width;
        let recHeight = targetRes.height;

        // If possible, extract actual stream track settings
        try {
          const settingsObj = displayStream.getVideoTracks()[0]?.getSettings();
          if (settingsObj) {
            recWidth = settingsObj.width || recWidth;
            recHeight = settingsObj.height || recHeight;
          }
        } catch (e) {}

        const finalProject: VideoProject = {
          id: `proj_${Date.now()}`,
          name: `Capture recording_${new Date().toLocaleDateString()}`,
          createdAt: Date.now(),
          duration: recordDuration || 1,
          blob: videoBlob,
          width: recWidth,
          height: recHeight
        };

        // Save in indexedDB
        await saveProject(finalProject);
        onRecordingComplete(finalProject);
      };

      // Handle screen-sharing Stop Button in system tray
      displayStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };

      // 6. Launch Rec process!
      startTimeRef.current = Date.now();
      recorder.start(1000); // chunk slice trigger
      setIsRecording(true);
      
      // Start Recording Timer
      timerRef.current = setInterval(() => {
        setTimeElapsed((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Recording initialization error:', err);
      const isIframe = window.self !== window.top;
      if (err.name === 'NotAllowedError') {
        if (isIframe) {
          setError('Screen share was denied. Try opening the application in a new tab using the top-right arrow button to bypass frame sandboxing.');
        } else {
          setError('Screen share permission denied by user.');
        }
      } else if (err.message && (err.message.includes('permission') || err.message.includes('disallowed') || err.message.includes('policy'))) {
        setError('Display capture is restricted by the current iframe sandboxing. Please click the "Open in a new tab" button at the top-right corner of the browser preview to grant capture access!');
      } else {
        setError(`Capture error: ${err.message || 'Unknown device error'}`);
      }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTimerValue = (secs: number) => {
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
      {/* Absolute futuristic decoration lines */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-indigo-500/0 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-gradient-to-tr from-cyan-500/10 to-indigo-500/0 blur-2xl pointer-events-none" />

      {/* Grid structure */}
      <div className="relative flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Video className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-slate-100 tracking-tight">Record Workspace</h2>
              <p className="text-xs text-slate-400">Configure layout constraints for raw quality capture</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-[10px] bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400 font-mono font-medium">{browserCapabilities[0] || 'WebM Ready'}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-200 text-xs px-4 py-3 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Recording active visualization or configuration controls */}
        {isRecording ? (
          <div className="flex flex-col items-center justify-center py-6 gap-6 bg-slate-950/40 border border-slate-800/50 rounded-2xl relative">
            <div className="absolute top-3 right-4 flex items-center gap-2 font-mono text-[10px] text-slate-400">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span>CAPTURING HIGH-RES STREAM</span>
            </div>

            {/* Giant pulse display */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-24 h-24 rounded-full bg-red-500/10 border border-red-500/20 animate-ping duration-1000" />
              <div className="absolute w-18 h-18 rounded-full bg-red-500/20 border border-red-500/30 animate-pulse" />
              <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
                <Square className="w-5 h-5 text-white fill-white" />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-4xl font-mono font-bold tracking-tight text-slate-100">
                {formatTimerValue(timeElapsed)}
              </span>
              <p className="text-xs text-slate-400 max-w-[280px]">
                Currently capturing at <strong className="text-slate-300">{settings.resolution}</strong>, <strong className="text-slate-300">{settings.fps} FPS</strong>. Keep this tab open.
              </p>
            </div>

            {/* Real-time mic indicator */}
            {settings.recordMic && (
              <div className="w-full max-w-[280px] bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    <Mic className="w-3 h-3 text-emerald-400" /> Microphone Level
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">{micLevel}%</span>
                </div>
                <div className="h-2 w-full bg-slate-905 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${micLevel}%` }}
                    className="h-full bg-gradient-to-r from-teal-500 via-emerald-500 to-emerald-400 rounded-full transition-all duration-75"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleStopRecording}
              className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-medium px-8 py-3 rounded-xl shadow-lg shadow-red-600/10 hover:shadow-red-500/20 hover:-translate-y-0.5 duration-150 text-sm"
              id="stop-recording-button"
            >
              <Square className="w-4 h-4 fill-white" />
              Stop Recording & Edit
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Col: Setup configurations */}
            <div className="flex flex-col gap-4">
              {/* Resolution selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-mono font-medium flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-indigo-400" /> TARGET CAPTURE DIMENSION
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: '720p', label: 'HD 720p', details: '1280 × 720' },
                    { id: '1080p', label: 'Full HD 1080p', details: '1920 × 1080' },
                    { id: '1440p', label: '2K 1440p', details: '2560 × 1440' },
                    { id: '4k', label: 'Ultra HD 4K', details: '3840 × 2160' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSettings(prev => ({ ...prev, resolution: preset.id as any }))}
                      className={`text-left p-3 rounded-xl border flex flex-col gap-0.5 transition-all text-xs font-medium cursor-pointer ${
                        settings.resolution === preset.id
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200 shadow-md shadow-indigo-500/5'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-950/80 hover:border-slate-800'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{preset.details}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* FPS selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-mono font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> RECORDING FRAME RATE
                </label>
                <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, fps: 30 }))}
                    className={`flex-1 text-center py-2 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                      settings.fps === 30
                        ? 'bg-slate-900 border border-slate-800/80 text-emerald-400 font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    30 FPS (Standard Stream)
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, fps: 60 }))}
                    className={`flex-1 text-center py-2 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
                      settings.fps === 60
                        ? 'bg-slate-900 border border-slate-800/80 text-emerald-400 font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    60 FPS (Ultra-Smooth)
                  </button>
                </div>
              </div>
            </div>

            {/* Right Col: Audio inputs & triggers */}
            <div className="flex flex-col justify-between gap-4">
              {/* Audio Source Toggles */}
              <div className="flex flex-col gap-3">
                <span className="text-xs text-slate-400 font-mono font-medium">AUDIO STATIONS & MIXER</span>
                <div className="flex flex-col gap-2.5">
                  {/* Microphone */}
                  <label
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition ${
                      settings.recordMic
                        ? 'bg-emerald-500/5 border-emerald-500/30 text-slate-200'
                        : 'bg-slate-950 border-slate-800 hover:bg-slate-950/80 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Mic className={`w-4 h-4 ${settings.recordMic ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">Integrate Vocal Mic</span>
                        <span className="text-[10px] text-slate-500">Record physical voiceovers alongside screen</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.recordMic}
                      onChange={(e) => setSettings(prev => ({ ...prev, recordMic: e.target.checked }))}
                      className="accent-emerald-500 h-4 w-4 pointer-events-none"
                    />
                  </label>

                  {/* System Audio */}
                  <label
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition ${
                      settings.recordSystemAudio
                        ? 'bg-emerald-500/5 border-emerald-500/30 text-slate-200'
                        : 'bg-slate-950 border-slate-800 hover:bg-slate-950/80 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Volume2 className={`w-4 h-4 ${settings.recordSystemAudio ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">Capture System Audio</span>
                        <span className="text-[10px] text-slate-500">Includes browser tabs & system alerts audio</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.recordSystemAudio}
                      onChange={(e) => setSettings(prev => ({ ...prev, recordSystemAudio: e.target.checked }))}
                      className="accent-emerald-500 h-4 w-4 pointer-events-none"
                    />
                  </label>

                  {/* Auto-Normalize Audio */}
                  <label
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition ${
                      settings.autoNormalizeAudio
                        ? 'bg-indigo-500/5 border-indigo-500/30 text-slate-200'
                        : 'bg-slate-950 border-slate-800 hover:bg-slate-950/80 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sparkles className={`w-4 h-4 ${settings.autoNormalizeAudio ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          Auto-Normalize Sound
                          <span className="text-[8px] bg-indigo-500/15 text-indigo-400 px-1 rounded font-bold font-mono">SMART FX</span>
                        </span>
                        <span className="text-[10px] text-slate-500">Balance quiet voice mics and loud system audios automatically</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!settings.autoNormalizeAudio}
                      onChange={(e) => setSettings(prev => ({ ...prev, autoNormalizeAudio: e.target.checked }))}
                      className="accent-indigo-500 h-4 w-4 pointer-events-none"
                    />
                  </label>

                  {/* Camera overlay bubble trigger */}
                  <label
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition ${
                      isWebcamActive
                        ? 'bg-cyan-500/5 border-cyan-500/30 text-slate-200'
                        : 'bg-slate-950 border-slate-800 hover:bg-slate-950/80 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Video className={`w-4 h-4 ${isWebcamActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">Floating Presenter Bubble</span>
                        <span className="text-[10px] text-slate-500">Display facecam overlay circle at screen corner</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isWebcamActive}
                      onChange={(e) => setIsWebcamActive(e.target.checked)}
                      className="accent-cyan-400 h-4 w-4 pointer-events-none"
                    />
                  </label>
                </div>
              </div>

              {/* Master Start Button */}
              <button
                onClick={handleStartRecording}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/25 hover:-translate-y-0.5 duration-150 cursor-pointer text-sm font-display tracking-wide"
                id="start-rec-studio"
              >
                <Play className="w-4 h-4 fill-slate-950 stroke-none" />
                Initialize Capture Studio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
