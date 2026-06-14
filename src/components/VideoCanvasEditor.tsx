import React, { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, FastForward, Volume2, RotateCcw, Filter,
  Type, Download, Trash2, Sliders, Scissors, Crop, Sparkles, Check, Bookmark, Loader2, ArrowLeft
} from 'lucide-react';
import { VideoProject, EditorState, TextOverlay, VideoFilterType } from '../types';
import { VIDEO_FILTERS } from '../lib/filters';
import { saveProject } from '../lib/db';

interface VideoCanvasEditorProps {
  project: VideoProject;
  onBackToDashboard: () => void;
  onProjectUpdated: () => void;
}

export default function VideoCanvasEditor({
  project,
  onBackToDashboard,
  onProjectUpdated
}: VideoCanvasEditorProps) {
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [editorState, setEditorState] = useState<EditorState>({
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1.0,
    trim: { start: 0, end: project.duration },
    activeFilter: 'none',
    overlays: [],
    selectedOverlayId: null,
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    volume: 1.0,
    aspectRatio: 'original',
    maskUrlBar: false
  });

  // Track panel options
  const [activeTab, setActiveTab] = useState<'filters' | 'overlays' | 'adjust' | 'crop'>('filters');

  // Overlay text creator state
  const [newText, setNewText] = useState('My Custom Text');
  const [newTextSize, setNewTextSize] = useState(32);
  const [newTextColor, setNewTextColor] = useState('#ffffff');
  const [newTextStart, setNewTextStart] = useState(0);
  const [newTextEnd, setNewTextEnd] = useState(project.duration);
  const [newTextX, setNewTextX] = useState(50); // percentage
  const [newTextY, setNewTextY] = useState(50); // percentage

  // Export states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResolution, setExportResolution] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [exportTimeRemaining, setExportTimeRemaining] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderLoopRef = useRef<number | null>(null);

  // Initialize URL source from videoBlob
  useEffect(() => {
    const url = URL.createObjectURL(project.blob);
    setVideoUrl(url);
    
    // Set initial trim end to actual duration
    setEditorState(prev => ({
      ...prev,
      trim: { start: 0, end: project.duration },
      currentTime: 0
    }));

    // Reset overlay form defaults to fit constraints
    setNewTextEnd(project.duration);

    return () => {
      URL.revokeObjectURL(url);
      if (renderLoopRef.current) {
        cancelAnimationFrame(renderLoopRef.current);
      }
    };
  }, [project]);

  // Handle Play/Pause synchronize
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (editorState.isPlaying) {
      videoRef.current.pause();
    } else {
      // Loop if at or past end trim limit
      if (editorState.currentTime >= editorState.trim.end || editorState.currentTime < editorState.trim.start) {
        videoRef.current.currentTime = editorState.trim.start;
      }
      videoRef.current.play().catch(e => console.warn(e));
    }
  };

  // Canvas context drawer loop
  useEffect(() => {
    const draw = () => {
      if (!videoRef.current || !previewCanvasRef.current) {
        renderLoopRef.current = requestAnimationFrame(draw);
        return;
      }

      const video = videoRef.current;
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Update Playtime hook
      setEditorState(prev => {
        const time = video.currentTime;
        // Trim loop check during normal playback
        if (prev.isPlaying && time >= prev.trim.end) {
          video.currentTime = prev.trim.start;
          return { ...prev, currentTime: prev.trim.start };
        }
        return { ...prev, currentTime: time };
      });

      // Maintain internal Canvas resolutions to match aspect ratios or source bounding boxes
      let renderWidth = project.width;
      let renderHeight = project.height;

      if (editorState.aspectRatio === '16-9') {
        renderWidth = 1920;
        renderHeight = 1080;
      } else if (editorState.aspectRatio === '9-16') {
        renderWidth = 1080;
        renderHeight = 1920;
      } else if (editorState.aspectRatio === '1-1') {
        renderWidth = 1080;
        renderHeight = 1080;
      }

      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
      }

      // Clear layout
      ctx.fillStyle = '#0f172a'; // slate-900 background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Setup styles filters
      const selectedFilter = VIDEO_FILTERS.find(f => f.id === editorState.activeFilter);
      const filterStr = selectedFilter ? selectedFilter.cssFilter : 'none';
      
      // Merge with custom adjustments brightness & contrast
      const brightnessPct = Math.round(editorState.brightness * 100);
      const contrastPct = Math.round(editorState.contrast * 100);
      const saturationPct = Math.round(editorState.saturation * 100);
      
      const filtersCombined = `${filterStr === 'none' ? '' : filterStr} brightness(${brightnessPct}%) contrast(${contrastPct}%) saturate(${saturationPct}%)`;
      ctx.filter = filtersCombined;

      // Render centering video
      const aspectVideo = video.videoWidth / video.videoHeight;
      const aspectCanvas = canvas.width / canvas.height;
      let targetW = canvas.width;
      let targetH = canvas.height;
      let offsetX = 0;
      let offsetY = 0;

      if (aspectVideo > aspectCanvas) {
        // Source is wider than frame - fit height or pillarbox
        targetH = canvas.width / aspectVideo;
        offsetY = (canvas.height - targetH) / 2;
      } else {
        // Source is taller than frame - fit width or letterbox
        targetW = canvas.height * aspectVideo;
        offsetX = (canvas.width - targetW) / 2;
      }

      ctx.drawImage(video, offsetX, offsetY, targetW, targetH);

      // Disable filters for overlays rendering so text remains crisp and highly legible
      ctx.filter = 'none';

      // Draw URL/Header masking bar if requested
      if (editorState.maskUrlBar) {
        ctx.save();
        ctx.fillStyle = '#1e293b'; // solid professional slate-800 cover
        const maskHeight = targetH * 0.09; // 9% of video height covers browser URL area
        ctx.fillRect(offsetX, offsetY, targetW, maskHeight);
        
        // Draw a neat subtle text or indicator on the bar
        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒 URL BAR MASKED (SENSITIVE INFO SECURED)', offsetX + targetW / 2, offsetY + maskHeight / 2);
        ctx.restore();
      }

      // Draw Subtitles / Text Overlays
      const currTime = video.currentTime;
      editorState.overlays.forEach((overlay) => {
        if (currTime >= overlay.startTime && currTime <= overlay.endTime) {
          ctx.save();
          
          ctx.font = `bold ${overlay.fontSize}px "Inter", sans-serif`;
          ctx.fillStyle = overlay.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Draw shadow / border accent
          ctx.shadowColor = overlay.shadowColor || 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;

          // Convert percentage positions (0-100) back to actual pixel layout
          const pxX = (overlay.positionX / 100) * canvas.width;
          const pxY = (overlay.positionY / 100) * canvas.height;
          
          ctx.fillText(overlay.text, pxX, pxY);
          ctx.restore();
        }
      });

      renderLoopRef.current = requestAnimationFrame(draw);
    };

    renderLoopRef.current = requestAnimationFrame(draw);

    return () => {
      if (renderLoopRef.current) {
        cancelAnimationFrame(renderLoopRef.current);
      }
    };
  }, [editorState.activeFilter, editorState.aspectRatio, editorState.brightness, editorState.contrast, editorState.saturation, editorState.overlays, editorState.maskUrlBar, project]);

  // Synchronize playback events
  const handlePlayEvent = () => {
    setEditorState(prev => ({ ...prev, isPlaying: true }));
  };

  const handlePauseEvent = () => {
    setEditorState(prev => ({ ...prev, isPlaying: false }));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setEditorState(prev => ({ ...prev, volume: vol }));
    if (videoRef.current) videoRef.current.volume = vol;
  };

  const handleProgressBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSec = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = targetSec;
      setEditorState(prev => ({ ...prev, currentTime: targetSec }));
    }
  };

  // Add caption text overlay helper
  const handleAddTextOverlay = () => {
    if (!newText.trim()) return;
    const item: TextOverlay = {
      id: `text_${Date.now()}`,
      text: newText,
      fontSize: newTextSize,
      color: newTextColor,
      shadowColor: 'rgba(0,0,0,0.85)',
      positionX: newTextX,
      positionY: newTextY,
      startTime: newTextStart,
      endTime: newTextEnd
    };

    setEditorState(prev => ({
      ...prev,
      overlays: [...prev.overlays, item],
      selectedOverlayId: item.id
    }));
    
    // reset label field slightly
    setNewText('Custom Watermark');
  };

  const handleDeleteOverlay = (id: string) => {
    setEditorState(prev => ({
      ...prev,
      overlays: prev.overlays.filter(o => o.id !== id),
      selectedOverlayId: prev.selectedOverlayId === id ? null : prev.selectedOverlayId
    }));
  };

  // Update original project title inside library
  const handleSaveProjectDetails = async () => {
    const updatedProject = {
      ...project,
      name: project.name // keep existing name or fetch new title
    };
    await saveProject(updatedProject);
    onProjectUpdated();
  };

  const handleRenameProject = async () => {
    const newName = prompt('Enter a new title for this capture project:', project.name);
    if (newName && newName.trim()) {
      const updated = { ...project, name: newName.trim() };
      await saveProject(updated);
      project.name = newName.trim(); // Live mutate
      onProjectUpdated();
    }
  };

  // Standard output format selection
  const exportResolutionMap = {
    '720p': { w: 1280, h: 720 },
    '1080p': { w: 1920, h: 1080 },
    '4k': { w: 3845, h: 2160 }
  };

  // MASTER EXPORT COMPILATION ENGINE
  const handleStartExport = async () => {
    if (!videoRef.current) return;
    
    setIsExporting(true);
    setExportProgress(1);

    const sourceVideo = videoRef.current;
    
    // Pause any current play state before compiling
    sourceVideo.pause();

    // 1. Setup target resolution bounds
    const res = exportResolutionMap[exportResolution];
    let expWidth = res.w;
    let expHeight = res.h;

    if (editorState.aspectRatio === '9-16') {
      expWidth = res.h; // Vertical configuration inverse
      expHeight = res.w;
    } else if (editorState.aspectRatio === '1-1') {
      expWidth = res.h; // Square configuration
      expHeight = res.h;
    }

    // Create high-resolution offline renderer canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = expWidth;
    exportCanvas.height = expHeight;
    const expCtx = exportCanvas.getContext('2d');
    
    if (!expCtx) {
      alert('Your browser does not support offline canvas generation.');
      setIsExporting(false);
      return;
    }

    // 2. Setup Recording Target stream & container matching VP9/VP8 standards
    const EXPORT_FPS = project.duration > 120 ? 30 : 60; // optimize frames for longer clips to keep RAM usage perfect
    const canvasStream = exportCanvas.captureStream(EXPORT_FPS);
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioContext.createMediaStreamDestination();

    // Grab or build system playback audio track
    let exportAudioTrack: MediaStreamTrack | null = null;
    try {
      if ((sourceVideo as any).captureStream) {
        const videoNativeStream = (sourceVideo as any).captureStream();
        if (videoNativeStream.getAudioTracks().length > 0) {
          const streamSource = audioContext.createMediaStreamSource(videoNativeStream);
          streamSource.connect(dest);
          exportAudioTrack = dest.stream.getAudioTracks()[0];
        }
      }
    } catch (e) {
      console.warn('Audio track separation denied in sandbox, exporting silent sequence content.', e);
    }

    const combinedTracks = [canvasStream.getVideoTracks()[0]];
    if (exportAudioTrack) {
      combinedTracks.push(exportAudioTrack);
    }

    const exportStream = new MediaStream(combinedTracks);
    
    // Bits-per-second multiplier: High quality 12-25 Mbps profiles for pristine exports
    const bpsRate = exportResolution === '4k' ? 25000000 : exportResolution === '1080p' ? 12000000 : 7000000;

    let recOptions = { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: bpsRate };
    if (!MediaRecorder.isTypeSupported(recOptions.mimeType)) {
      recOptions = { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: bpsRate };
    }
    if (!MediaRecorder.isTypeSupported(recOptions.mimeType)) {
      recOptions = { mimeType: 'video/webm', videoBitsPerSecond: bpsRate };
    }

    const exportChunks: Blob[] = [];
    const exportRecorder = new MediaRecorder(exportStream, recOptions);

    exportRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        exportChunks.push(event.data);
      }
    };

    // 3. Prepare seek limits
    const startTrim = editorState.trim.start;
    const endTrim = editorState.trim.end;
    const renderDuration = endTrim - startTrim;

    let isCompiling = true;

    exportRecorder.onstop = () => {
      setIsExporting(false);
      setExportProgress(100);
      setExportTimeRemaining(null);
      audioContext.close().catch(() => {});

      const finalBlob = new Blob(exportChunks, { type: 'video/webm' });
      
      // Trigger instant browser download trigger
      const link = document.createElement('a');
      link.href = URL.createObjectURL(finalBlob);
      // Replace non-ascii and replace spacers
      const safeName = project.name.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
      link.download = `${safeName}_edited_${exportResolution}.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Return original status layout
      sourceVideo.currentTime = startTrim;
    };

    sourceVideo.currentTime = startTrim;

    // Await seeking completion before triggering record
    sourceVideo.onseeked = () => {
      if (!isCompiling) return;
      
      // Start recording process
      exportRecorder.start();
      sourceVideo.play().catch(e => console.error('Play initialization broken', e));

      const runExportRender = () => {
        if (!isCompiling) return;

        const currTime = sourceVideo.currentTime;
        const playedOffset = currTime - startTrim;
        const rawProgress = Math.min(99, Math.round((playedOffset / renderDuration) * 100));
        setExportProgress(rawProgress > 0 ? rawProgress : 1);

        // Calculate and set estimated remaining time (seconds)
        const playbackRate = sourceVideo.playbackRate || 1.0;
        const remainingSecs = Math.max(0, renderDuration - playedOffset) / playbackRate;
        setExportTimeRemaining(remainingSecs);

        // Frame check boundary
        if (currTime >= endTrim || sourceVideo.paused || sourceVideo.ended) {
          isCompiling = false;
          sourceVideo.pause();
          exportRecorder.stop();
          return;
        }

        // Draw Frame to High Resolution offline Context
        expCtx.fillStyle = '#090d16'; // Absolute deep pitch backdrop
        expCtx.fillRect(0, 0, expWidth, expHeight);

        // Apply same filters
        const activePreset = VIDEO_FILTERS.find(f => f.id === editorState.activeFilter);
        const filterStr = activePreset ? activePreset.cssFilter : 'none';
        
        const brightnessPct = Math.round(editorState.brightness * 100);
        const contrastPct = Math.round(editorState.contrast * 100);
        const saturationPct = Math.round(editorState.saturation * 100);
        
        expCtx.filter = `${filterStr === 'none' ? '' : filterStr} brightness(${brightnessPct}%) contrast(${contrastPct}%) saturate(${saturationPct}%)`;

        // Render centering video at Target high resolution bounds
        const aspectVideo = sourceVideo.videoWidth / sourceVideo.videoHeight;
        const aspectCanvas = expWidth / expHeight;
        let targetW = expWidth;
        let targetH = expHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (aspectVideo > aspectCanvas) {
          targetH = expWidth / aspectVideo;
          offsetY = (expHeight - targetH) / 2;
        } else {
          targetW = expHeight * aspectVideo;
          offsetX = (expWidth - targetW) / 2;
        }

        expCtx.drawImage(sourceVideo, offsetX, offsetY, targetW, targetH);
        expCtx.filter = 'none';

        // Draw URL/Header masking bar if requested
        if (editorState.maskUrlBar) {
          expCtx.save();
          expCtx.fillStyle = '#1e293b'; // solid professional slate-800 cover
          const maskHeight = targetH * 0.09; // 9% of video height
          expCtx.fillRect(offsetX, offsetY, targetW, maskHeight);
          
          expCtx.fillStyle = '#94a3b8'; // slate-400 text
          const densityScaleRatio = expWidth / (previewCanvasRef.current?.width || 1280);
          const scaledFontSize = Math.max(10, Math.round(11 * densityScaleRatio));
          expCtx.font = `bold ${scaledFontSize}px "JetBrains Mono", monospace`;
          expCtx.textAlign = 'center';
          expCtx.textBaseline = 'middle';
          expCtx.fillText('🔒 URL BAR MASKED (SENSITIVE INFO SECURED)', offsetX + targetW / 2, offsetY + maskHeight / 2);
          expCtx.restore();
        }

        // Draw Timing-dependent watermarks / texts scaled precisely to the resolution boundaries
        editorState.overlays.forEach((overlay) => {
          if (currTime >= overlay.startTime && currTime <= overlay.endTime) {
            expCtx.save();
            
            // Upscale font sizes relative to the scaling ratios from previews to matches the high-output canvas density perfectly
            const densityScaleRatio = expWidth / (previewCanvasRef.current?.width || 1280);
            const scaledFontSize = Math.max(16, Math.round(overlay.fontSize * densityScaleRatio));

            expCtx.font = `bold ${scaledFontSize}px "Inter", sans-serif`;
            expCtx.fillStyle = overlay.color;
            expCtx.textAlign = 'center';
            expCtx.textBaseline = 'middle';
            
            expCtx.shadowColor = overlay.shadowColor || 'rgba(0,0,0,0.85)';
            expCtx.shadowBlur = Math.round(8 * densityScaleRatio);
            expCtx.shadowOffsetX = Math.round(2 * densityScaleRatio);
            expCtx.shadowOffsetY = Math.round(2 * densityScaleRatio);

            const pxX = (overlay.positionX / 100) * expWidth;
            const pxY = (overlay.positionY / 100) * expHeight;
            
            expCtx.fillText(overlay.text, pxX, pxY);
            expCtx.restore();
          }
        });

        requestAnimationFrame(runExportRender);
      };

      requestAnimationFrame(runExportRender);
    };
  };

  // Time stamp formatter helper
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    const millis = Math.floor((secs % 1) * 10);
    return `${mins}:${String(remainingSecs).padStart(2, '0')}.${millis}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
      {/* EXPORT OVERLAY VIEW */}
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl relative animate-scale-up">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>

            <h3 className="text-xl font-bold font-display text-slate-100 tracking-tight mt-4 flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse animate-duration-1000" />
              Compiling HD Export
            </h3>
            <p className="text-xs text-slate-400 mt-2 mb-5">
              Processing visual filters, active crop streams, watermarks, and timing layouts into a high-fidelity WebM sequence.
            </p>

            {/* Dynamic Step Detail */}
            <div className="mb-4 bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 text-left">
              <span className="text-[9px] text-slate-500 font-mono block uppercase tracking-widest font-bold">ACTIVE PIPELINE STATUS</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {exportProgress <= 10 ? "Preparing master stream & audio mix..." :
                   exportProgress <= 35 ? "Seeking active frame buffers..." :
                   exportProgress <= 65 ? "Processing lightning & color grades..." :
                   exportProgress <= 85 ? "Rendering watermark text overlays..." :
                   "Muxing WebM output file container..."}
                </span>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="w-full bg-slate-950 rounded-full h-3 text-[1px] border border-slate-800 p-0.5 overflow-hidden">
              <div
                style={{ width: `${exportProgress}%` }}
                className="h-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-cyan-400 rounded-full transition-all duration-300"
              />
            </div>

            {/* Metas: Percentage & Remaining Times */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800/60 text-left">
              <div className="flex flex-col bg-slate-950/60 p-3 rounded-xl border border-slate-800/40">
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">RENDER SPEED</span>
                <span className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{exportProgress}%</span>
              </div>
              <div className="flex flex-col bg-slate-950/60 p-3 rounded-xl border border-slate-800/40">
                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">TIME REMAINING</span>
                <span className="text-lg font-bold font-mono text-indigo-400 mt-0.5">
                  {exportTimeRemaining !== null ? (
                    exportTimeRemaining < 0.2 ? "Wrapping up..." :
                    exportTimeRemaining < 1 ? "< 1 sec" :
                    `${Math.round(exportTimeRemaining)}s`
                  ) : "Estimating..."}
                </span>
              </div>
            </div>

            <div className="mt-5 text-[10px] font-mono text-slate-500 flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800/40">
              <span className="flex items-center gap-1">
                ⚙️ {exportResolution} Output Aspect
              </span>
              <span>
                Please keep this tab prioritized
              </span>
            </div>
          </div>
        </div>
      )}

      {/* LEFT: MASTER PREVIEW STAGE (8 COLS) */}
      <div className="lg:col-span-8 flex flex-col gap-4 bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
        {/* Stage Header Controls */}
        <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
          <button
            onClick={onBackToDashboard}
            className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-100 bg-slate-950/60 border border-slate-800/50 hover:bg-slate-950 px-3 py-1.5 rounded-xl cursor-pointer transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>

          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold font-display text-slate-200 select-all tracking-tight truncate max-w-[200px]" title={project.name}>
              {project.name}
            </h3>
            <button
              onClick={handleRenameProject}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono underline bg-transparent"
            >
              Rename
            </button>
          </div>

          <div className="text-[10px] bg-slate-950 text-slate-500 font-mono px-2 py-1 rounded border border-slate-800">
            Source: {project.width}x{project.height} | {formatTime(project.duration)}
          </div>
        </div>

        {/* Video Stage Frame Canvas */}
        <div className="relative bg-slate-950/60 border border-slate-800/40 rounded-2xl flex items-center justify-center p-2 min-h-[300px] max-h-[480px] overflow-hidden group">
          <canvas
            ref={previewCanvasRef}
            className="max-w-full max-h-[450px] object-contain rounded shadow-2xl transition bg-[#090d16]"
          />

          {/* Hidden reference Video block */}
          <video
            ref={videoRef}
            src={videoUrl || undefined}
            onPlay={handlePlayEvent}
            onPause={handlePauseEvent}
            playsInline
            muted={editorState.volume === 0}
            referrerPolicy="no-referrer"
            className="hidden"
          />

          {/* Quick Floating Play Hover button */}
          {!editorState.isPlaying && (
            <button
              onClick={togglePlay}
              className="absolute p-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-full shadow-2xl scale-120 opacity-0 group-hover:opacity-100 focus:opacity-100 transition duration-200 hover:rotate-12 cursor-pointer"
            >
              <Play className="w-6 h-6 fill-slate-950 stroke-none ml-0.5" />
            </button>
          )}
        </div>

        {/* Playback Controls & Timings */}
        <div className="flex flex-col gap-3">
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono font-medium text-slate-400 w-10 text-right">
              {formatTime(editorState.currentTime)}
            </span>
            <div className="flex-grow relative h-8 flex items-center group">
              {/* Highlight active Trim Window in background */}
              <div
                style={{
                  left: `${(editorState.trim.start / project.duration) * 100}%`,
                  width: `${((editorState.trim.end - editorState.trim.start) / project.duration) * 100}%`
                }}
                className="absolute h-1.5 bg-emerald-500/10 border-x border-emerald-500/40 animate-pulse pointer-events-none rounded-sm"
              />
              <input
                type="range"
                min="0"
                max={project.duration}
                step="0.05"
                value={editorState.currentTime}
                onChange={handleProgressBarChange}
                className="w-full accent-emerald-500 cursor-pointer h-1 rounded bg-slate-950"
              />
            </div>
            <span className="text-[10px] font-mono font-medium text-slate-400 w-10">
              {formatTime(project.duration)}
            </span>
          </div>

          {/* Main Action buttons Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className={`p-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  editorState.isPlaying
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                {editorState.isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-amber-400 stroke-none" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-emerald-400 stroke-none" />
                    Play Clip
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = editorState.trim.start;
                    setEditorState(prev => ({ ...prev, currentTime: editorState.trim.start }));
                  }
                }}
                className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition"
                title="Restart Trim"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Start
              </button>
            </div>

            {/* Split / Scissors controls */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                <Scissors className="w-3 h-3 text-cyan-400" /> TIMELINE CRADLE (TRIM)
              </span>
              <div className="flex items-center gap-1 text-slate-300">
                <input
                  type="number"
                  min="0"
                  max={editorState.trim.end - 0.5}
                  step="0.5"
                  value={editorState.trim.start}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setEditorState(prev => ({ ...prev, trim: { ...prev.trim, start: val } }));
                  }}
                  className="w-14 bg-slate-900 border border-slate-800 text-xs font-mono font-bold p-1 rounded focus:border-indigo-500 text-center text-emerald-400"
                />
                <span className="text-slate-600 font-bold">to</span>
                <input
                  type="number"
                  min={editorState.trim.start + 0.5}
                  max={project.duration}
                  step="0.5"
                  value={editorState.trim.end}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || project.duration;
                    setEditorState(prev => ({ ...prev, trim: { ...prev.trim, end: val } }));
                  }}
                  className="w-14 bg-slate-900 border border-slate-800 text-xs font-mono font-bold p-1 rounded focus:border-indigo-500 text-center text-red-400"
                />
                <span className="text-[10px] text-slate-500 font-mono">sec</span>
              </div>
            </div>

            {/* Volume Mixer in player */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-slate-500" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={editorState.volume}
                onChange={handleVolumeChange}
                className="w-20 accent-indigo-500 cursor-pointer h-1 rounded bg-slate-800"
              />
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: EDITOR HANDLERS & TOOLS (4 COLS) */}
      <div className="lg:col-span-4 flex flex-col gap-4 bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow-xl">
        <h2 className="text-sm font-semibold font-display text-slate-100 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" /> Video Editor Panel
        </h2>

        {/* Feature Tab buttons */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
          {[
            { id: 'filters', label: 'Filters', icon: Filter },
            { id: 'overlays', label: 'Overlays', icon: Type },
            { id: 'adjust', label: 'Bright', icon: Sliders },
            { id: 'crop', label: 'Cut & Crop', icon: Crop },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center justify-center py-2 rounded-lg text-[10px] font-bold font-display cursor-pointer transition ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-indigo-300 border border-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mb-1" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Detail Contents */}
        <div className="flex-grow max-h-[350px] overflow-y-auto pr-1 flex flex-col gap-4">
          {activeTab === 'filters' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-slate-400 font-mono">PRESET LUT FILTERS</span>
              <div className="grid grid-cols-2 gap-2">
                {VIDEO_FILTERS.map((lut) => (
                  <button
                    key={lut.id}
                    onClick={() => setEditorState(prev => ({ ...prev, activeFilter: lut.id }))}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer group ${
                      editorState.activeFilter === lut.id
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-950/80 hover:border-slate-800'
                    }`}
                  >
                    <span className="text-xs font-semibold flex items-center justify-between">
                      {lut.name}
                      {editorState.activeFilter === lut.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </span>
                    <span className="text-[9px] text-slate-500 font-normal leading-snug">
                      {lut.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'overlays' && (
            <div className="flex flex-col gap-3">
              <span className="text-xs text-slate-400 font-mono">ADD WATERMARK TEXT OVERLAY</span>
              
              <div className="flex flex-col gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Watermark contents..."
                  className="w-full bg-slate-900 border border-slate-800 text-xs px-3 py-2 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-mono">Font Size (px)</label>
                    <input
                      type="number"
                      value={newTextSize}
                      onChange={(e) => setNewTextSize(parseInt(e.target.value) || 24)}
                      className="bg-slate-900 border border-slate-800 text-xs p-1.5 rounded text-slate-200"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-mono">Text Color</label>
                    <div className="flex gap-1.5 items-center bg-slate-900 border border-slate-800 p-1 rounded">
                      <input
                        type="color"
                        value={newTextColor}
                        onChange={(e) => setNewTextColor(e.target.value)}
                        className="w-6 h-6 border-0 p-0 rounded cursor-pointer bg-transparent"
                      />
                      <span className="text-[10px] font-mono text-slate-400">{newTextColor}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-mono">Start (s)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={newTextStart}
                      onChange={(e) => setNewTextStart(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="bg-slate-900 border border-slate-800 text-xs p-1.5 rounded text-indigo-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-mono">End (s)</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={newTextEnd}
                      onChange={(e) => setNewTextEnd(Math.max(0.5, parseFloat(e.target.value) || project.duration))}
                      className="bg-slate-900 border border-slate-800 text-xs p-1.5 rounded text-indigo-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-mono">Pos X: {newTextX}%</label>
                    <input
                      type="range"
                      min="5"
                      max="95"
                      value={newTextX}
                      onChange={(e) => setNewTextX(parseInt(e.target.value))}
                      className="accent-indigo-500 cursor-pointer h-1 rounded"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-mono">Pos Y: {newTextY}%</label>
                    <input
                      type="range"
                      min="5"
                      max="95"
                      value={newTextY}
                      onChange={(e) => setNewTextY(parseInt(e.target.value))}
                      className="accent-indigo-500 cursor-pointer h-1 rounded"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddTextOverlay}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-indigo-300 font-bold py-2 rounded-lg border border-slate-800 transition text-xs mt-1"
                >
                  Burn text on Timeline
                </button>
              </div>

              {/* Active list of tags */}
              {editorState.overlays.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-mono font-medium">BURNT WATERMARKS</span>
                  <div className="flex flex-col gap-1.5">
                    {editorState.overlays.map(overlay => (
                      <div
                        key={overlay.id}
                        className="flex items-center justify-between text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800/80"
                      >
                        <div className="flex flex-col overflow-hidden max-w-[80%]">
                          <span className="text-slate-200 font-semibold truncate">"{overlay.text}"</span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            Runs: {overlay.startTime}s - {overlay.endTime}s | Size: {overlay.fontSize}px
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteOverlay(overlay.id)}
                          className="p-1 hover:bg-slate-900 rounded text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'adjust' && (
            <div className="flex flex-col gap-4 p-1">
              <span className="text-xs text-slate-400 font-mono">CUSTOM LIGHT CORRECTIONS</span>
              
              {/* Brightness slider */}
              <div className="flex flex-col gap-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Exposure / Brightness</span>
                  <span className="font-mono text-emerald-400 font-bold">{Math.round(editorState.brightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={editorState.brightness}
                  onChange={(e) => setEditorState(prev => ({ ...prev, brightness: parseFloat(e.target.value) }))}
                  className="w-full accent-emerald-400 cursor-pointer h-1 rounded"
                />
              </div>

              {/* Contrast slider */}
              <div className="flex flex-col gap-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Contrast punch</span>
                  <span className="font-mono text-emerald-400 font-bold">{Math.round(editorState.contrast * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={editorState.contrast}
                  onChange={(e) => setEditorState(prev => ({ ...prev, contrast: parseFloat(e.target.value) }))}
                  className="w-full accent-emerald-400 cursor-pointer h-1 rounded"
                />
              </div>

              {/* Saturation slider */}
              <div className="flex flex-col gap-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Color Saturation</span>
                  <span className="font-mono text-emerald-400 font-bold">{Math.round(editorState.saturation * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={editorState.saturation}
                  onChange={(e) => setEditorState(prev => ({ ...prev, saturation: parseFloat(e.target.value) }))}
                  className="w-full accent-emerald-400 cursor-pointer h-1 rounded"
                />
              </div>

              <button
                onClick={() => setEditorState(prev => ({ ...prev, brightness: 1.0, contrast: 1.0, saturation: 1.0 }))}
                className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[10px] text-slate-500 hover:text-slate-300 font-mono py-1.5 rounded duration-150"
              >
                Reset Adjustments
              </button>
            </div>
          )}

          {activeTab === 'crop' && (
            <div className="flex flex-col gap-4">
              {/* SENSITIVE INFO CONTROLS */}
              <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono font-medium tracking-wider">🔒 SENSITIVE INFO PROTECTION</span>
                <label className="flex items-start gap-2.5 cursor-pointer select-none group mt-1">
                  <input
                    type="checkbox"
                    checked={editorState.maskUrlBar}
                    onChange={(e) => setEditorState(prev => ({ ...prev, maskUrlBar: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-slate-800 bg-slate-900 text-indigo-500 focus:ring-0 cursor-pointer accent-indigo-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition">
                      Mask Browser URL bar
                    </span>
                    <span className="text-[10px] text-slate-500 leading-normal mt-0.5">
                      Covers the top 9% header of the recording window to safely hide address bars, bookmarks, and confidential account page info.
                    </span>
                  </div>
                </label>
              </div>

              {/* ACTION QUICK CUTS */}
              <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono font-medium tracking-wider">✂️ INSTANT TRIM & CUT HEAD / TAIL</span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Play the video to a specific timeframe, then click below to chop off preceding or succeeding parts instantly.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => {
                      const cur = editorState.currentTime;
                      if (cur < editorState.trim.end - 0.5) {
                        setEditorState(prev => ({
                          ...prev,
                          trim: { ...prev.trim, start: cur }
                        }));
                      } else {
                        alert('Cannot cut starting part past the end trimmer limits!');
                      }
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold p-2 rounded-lg border border-slate-800 text-[10px] transition cursor-pointer text-center"
                    title="Chops off everything before current frame pointer"
                  >
                    Cut First Part (Before Playhead)
                  </button>
                  <button
                    onClick={() => {
                      const cur = editorState.currentTime;
                      if (cur > editorState.trim.start + 0.5) {
                        setEditorState(prev => ({
                          ...prev,
                          trim: { ...prev.trim, end: cur }
                        }));
                      } else {
                        alert('Cannot cut ending part before the start trimmer limits!');
                      }
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-red-400 font-bold p-2 rounded-lg border border-slate-800 text-[10px] transition cursor-pointer text-center"
                    title="Chops off everything after current frame pointer"
                  >
                    Cut Last Part (After Playhead)
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-slate-900">
                  <span className="text-[9px] text-slate-500 font-mono py-1">Quick chops:</span>
                  <button
                    onClick={() => setEditorState(prev => {
                      const newStart = Math.min(prev.trim.end - 0.5, prev.trim.start + 3);
                      return { ...prev, trim: { ...prev.trim, start: newStart } };
                    })}
                    className="text-[9px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-1.5 py-1 rounded"
                  >
                    +3s Head
                  </button>
                  <button
                    onClick={() => setEditorState(prev => {
                      const newStart = Math.min(prev.trim.end - 0.5, prev.trim.start + 5);
                      return { ...prev, trim: { ...prev.trim, start: newStart } };
                    })}
                    className="text-[9px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-1.5 py-1 rounded"
                  >
                    +5s Head
                  </button>
                  <button
                    onClick={() => setEditorState(prev => {
                      const newEnd = Math.max(prev.trim.start + 0.5, prev.trim.end - 3);
                      return { ...prev, trim: { ...prev.trim, end: newEnd } };
                    })}
                    className="text-[9px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-1.5 py-1 rounded"
                  >
                    -3s Tail
                  </button>
                  <button
                    onClick={() => setEditorState(prev => {
                      const newEnd = Math.max(prev.trim.start + 0.5, prev.trim.end - 5);
                      return { ...prev, trim: { ...prev.trim, end: newEnd } };
                    })}
                    className="text-[9px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-1.5 py-1 rounded"
                  >
                    -5s Tail
                  </button>
                  <button
                    onClick={() => setEditorState(prev => ({
                      ...prev,
                      trim: { start: 0, end: project.duration }
                    }))}
                    className="text-[9px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 px-1.5 py-1 rounded ml-auto font-bold"
                  >
                    Reset Trim
                  </button>
                </div>
              </div>

              {/* ASPECT RATIO CROP FRAMES */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-400 font-mono">ASPECT RATIO CROP FRAMES</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'original', label: 'Original size', desc: 'Retains capture box aspect' },
                    { id: '16-9', label: 'Widescreen 16:9', desc: 'Sleek Cinematic ratio' },
                    { id: '9-16', label: 'TikTok/Shorts 9:16', desc: 'Sleek vertical mobile crop' },
                    { id: '1-1', label: 'Square 1:1', desc: 'Classic post layout feed' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setEditorState(prev => ({ ...prev, aspectRatio: preset.id as any }))}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 cursor-pointer transition ${
                        editorState.aspectRatio === preset.id
                          ? 'bg-slate-500/5 border-slate-500/40 text-slate-200'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-950/80 hover:border-slate-800'
                      }`}
                    >
                      <span className="text-xs font-semibold flex items-center justify-between">
                        {preset.label}
                        {editorState.aspectRatio === preset.id && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                      </span>
                      <span className="text-[10px] text-slate-500 leading-snug">{preset.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Master High Resolution Export settings */}
        <div className="border-t border-slate-800/80 pt-4 mt-auto flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 font-mono font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" /> TARGET EXPORT FORMAT
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: '720p', label: '720p HD' },
                { id: '1080p', label: '1080p FHD' },
                { id: '4k', label: '4K Ultra' }
              ].map(res => (
                <button
                  key={res.id}
                  onClick={() => setExportResolution(res.id as any)}
                  className={`text-center py-2.5 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer ${
                    exportResolution === res.id
                      ? 'bg-slate-900 border border-slate-800/80 text-emerald-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartExport}
            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/25 hover:-translate-y-0.5 duration-150 cursor-pointer text-xs font-display tracking-wide"
            id="export-highres-button"
          >
            <Download className="w-4 h-4" /> Export High-Res Edited Video
          </button>
        </div>
      </div>
    </div>
  );
}
