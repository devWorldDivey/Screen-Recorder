import React, { useState, useEffect } from 'react';
import { Video, Film, Settings, Sparkles, Monitor, Info, HelpCircle } from 'lucide-react';
import { RecordingSettings, VideoProject } from './types';
import RecorderDashboard from './components/RecorderDashboard';
import VideoCanvasEditor from './components/VideoCanvasEditor';
import CaptureLibrary from './components/CaptureLibrary';
import FloatingWebcam from './components/FloatingWebcam';
import { getAllProjects } from './lib/db';

export default function App() {
  const [settings, setSettings] = useState<RecordingSettings>({
    resolution: '1080p',
    fps: 30,
    recordMic: true,
    recordSystemAudio: false,
    recordWebcam: false,
    autoNormalizeAudio: true,
  });

  const [activeProject, setActiveProject] = useState<VideoProject | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Auto-load most recently captured clip on startup if any exists
  useEffect(() => {
    const initLoad = async () => {
      const items = await getAllProjects();
      if (items && items.length > 0) {
        setActiveProject(items[0]);
      }
    };
    initLoad();
  }, []);

  const handleRecordingComplete = (project: VideoProject) => {
    setActiveProject(project);
    setUpdateTrigger(prev => prev + 1);
  };

  const handleSelectProject = (project: VideoProject) => {
    setActiveProject(project);
  };

  const handleProjectUpdated = () => {
    setUpdateTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Floating webcam presenter loop */}
      <FloatingWebcam
        isEnabled={isWebcamActive}
        onClose={() => setIsWebcamActive(false)}
      />

      {/* Primary Top Nav Bar header */}
      <header className="border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/15 animate-pulse">
              <Video className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold font-display text-slate-100 tracking-tight">Studio Master Capture</h1>
                <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold font-mono">v1.2 PRO</span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">Professional screen recorder and timeline watermark video editor</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
            <span className="hidden sm:inline">GPU ACCELERATED CANVAS EXPORTS</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-400 font-bold">CLIENT OFFLINE ENGINE</span>
          </div>
        </div>
      </header>

      {/* Main Container Page Frame */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        
        {/* If a video clip is active for editing, center workspace layout spans 12 columns */}
        {activeProject ? (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Editor Console */}
            <VideoCanvasEditor
              project={activeProject}
              onBackToDashboard={() => setActiveProject(null)}
              onProjectUpdated={handleProjectUpdated}
            />

            {/* Quick-Swap library & drag-drop helper under timeline editor */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 border-t border-slate-800/50 pt-6">
              <div className="md:col-span-8 flex flex-col gap-3 bg-slate-900/40 p-4 border border-slate-850 rounded-2xl">
                <h3 className="text-xs font-bold font-mono text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-indigo-400" /> TIMELINE TIPS & GUIDES
                </h3>
                <ul className="text-[10px] text-slate-500 space-y-1 my-1 leading-normal list-disc pl-4 font-medium">
                  <li>Use the <strong>Cradle Trim Sliders</strong> to restrict video length for high-performance exports.</li>
                  <li>Click <strong>Burn text on Timeline</strong> to embed watermarks on top of the layout stream with custom color themes.</li>
                  <li>Select aspect ratio crops (like 16:9 widescreen or 9:16 vertical shorts) to easily align files for TikTok, Shorts or standard clips.</li>
                  <li>Your final compiled WebM file has <strong>perfect lossless multi-channel mixed audios</strong> ready for standard device exports.</li>
                </ul>
              </div>
              <div className="md:col-span-4" key={updateTrigger}>
                <CaptureLibrary
                  onSelectProject={handleSelectProject}
                  activeProjectId={activeProject.id}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Normal Capture Dashboard Welcome state */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in items-start">
            {/* Recorder console: Left block (8 columns) */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl flex items-start gap-4 shadow-xl relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/5 to-transparent blur-xl pointer-events-none" />
                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400 shrink-0">
                  <Monitor className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-bold font-display text-indigo-300">Infinite Capture Loop Capabilities</h2>
                  <p className="text-xs text-slate-400 leading-relaxed font-normal">
                    This suite operates entirely in your browser sandbox, supporting custom cropping, vocal mics and system loops to capture gameplay, tutorials, layouts or meetings. Since all computations remain local on your engine, you get 100% video privacy with zero cloud latency.
                  </p>
                </div>
              </div>

              <RecorderDashboard
                onRecordingComplete={handleRecordingComplete}
                settings={settings}
                setSettings={setSettings}
                isWebcamActive={isWebcamActive}
                setIsWebcamActive={setIsWebcamActive}
              />
            </div>

            {/* Previous lists sidebar: Right block (4 columns) */}
            <div className="lg:col-span-4" key={updateTrigger}>
              <CaptureLibrary
                onSelectProject={handleSelectProject}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer bar */}
      <footer className="border-t border-slate-800/80 py-4 px-6 bg-[#090d16]/50 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-500 font-mono font-bold">
          <span>DESIGNED FOR HIGH DEFINITION CAPTURES</span>
          <span>© 14-06-2026 SCREEN RECORDING STUDIO MASTER MODULES. ALL OPERATIONS OFFLINE.</span>
        </div>
      </footer>
    </div>
  );
}
