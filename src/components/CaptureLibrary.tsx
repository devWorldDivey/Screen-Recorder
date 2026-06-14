import React, { useState, useEffect } from 'react';
import { Video, Film, Download, Trash2, Calendar, HardDriveUpload, CheckCircle, Sparkles, Inbox, RefreshCw } from 'lucide-react';
import { VideoProject } from '../types';
import { getAllProjects, deleteProject, saveProject } from '../lib/db';

interface CaptureLibraryProps {
  onSelectProject: (project: VideoProject) => void;
  activeProjectId?: string;
}

export default function CaptureLibrary({ onSelectProject, activeProjectId }: CaptureLibraryProps) {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    const data = await getAllProjects();
    setProjects(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this clip from your local library?')) {
      await deleteProject(id);
      fetchProjects();
    }
  };

  const handleDownloadRaw = (project: VideoProject, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(project.blob);
    link.download = `${project.name.replace(/\s+/g, '_')}_raw.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Drag and drop processing
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Unsupported format: Please upload a valid MP4, WebM or MOV video file.');
      return;
    }

    setIsLoading(true);
    setFeedback('Uploading and decoding stream...');

    try {
      // Setup HTML5 video tag briefly to calculate duration and resolution metadata
      const videoElement = document.createElement('video');
      videoElement.preload = 'metadata';
      videoElement.src = URL.createObjectURL(file);
      
      const loadMetadata = () => {
        return new Promise<{ duration: number; w: number; h: number }>((resolve) => {
          videoElement.onloadedmetadata = () => {
            resolve({
              duration: videoElement.duration || 5,
              w: videoElement.videoWidth || 1280,
              h: videoElement.videoHeight || 720
            });
          };
          videoElement.onerror = () => {
            resolve({ duration: 5, w: 1280, h: 720 });
          };
        });
      };

      const meta = await loadMetadata();
      URL.revokeObjectURL(videoElement.src);

      const importedProject: VideoProject = {
        id: `proj_${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, "") + ' (Imported)',
        createdAt: Date.now(),
        duration: Math.round(meta.duration),
        blob: file,
        width: meta.w,
        height: meta.h
      };

      await saveProject(importedProject);
      setFeedback('Success! File imported into timeline.');
      setTimeout(() => setFeedback(null), 3000);
      
      fetchProjects();
      onSelectProject(importedProject);

    } catch (err) {
      console.error('File import error:', err);
      alert('Failed to parse file metadata.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDurationStr = (secs: number) => {
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(Math.floor(secs % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <div className="flex flex-col gap-4 bg-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold font-display text-slate-100 tracking-tight">Capture Library</h2>
        </div>
        <button
          onClick={fetchProjects}
          className="p-1 bg-slate-950 hover:bg-slate-800 text-slate-500 hover:text-slate-300 rounded border border-slate-850 duration-150 transition"
          title="Refresh Library List"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs px-3 py-2 rounded-xl">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Drag & Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-4 text-center transition flex flex-col items-center justify-center gap-1.5 group cursor-pointer ${
          isDragging
            ? 'border-indigo-400 bg-indigo-500/5 text-indigo-300'
            : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-950/80'
        }`}
      >
        <HardDriveUpload className="w-5 h-5 text-indigo-400 group-hover:scale-110 duration-150" />
        <div>
          <p className="text-[11px] font-bold text-slate-300">Drag video clip here to edit</p>
          <p className="text-[9px] text-slate-500 mt-0.5">Supports MP4, WebM, MOV files</p>
        </div>
        
        <label className="text-[10px] bg-slate-900 hover:bg-slate-850 text-indigo-300 px-3 py-1 rounded-md border border-slate-800 cursor-pointer duration-150 transition">
          Browse Files
          <input
            type="file"
            accept="video/*"
            onChange={handleFileInputChange}
            className="hidden"
          />
        </label>
      </div>

      {/* Library Files List */}
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
        {isLoading && projects.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500">Retrieving offline indexes...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-2">
            <Inbox className="w-8 h-8 text-slate-700" />
            <div>
              <p className="text-xs font-semibold text-slate-400">Library Empty</p>
              <p className="text-[10px] text-slate-500 max-w-[180px] mx-auto leading-snug mt-1">
                Take your first screen capture or drag an external file above to start!
              </p>
            </div>
          </div>
        ) : (
          projects.map((proj) => {
            const isActive = activeProjectId === proj.id;
            return (
              <div
                key={proj.id}
                onClick={() => onSelectProject(proj)}
                className={`flex gap-3 p-3 rounded-xl border cursor-pointer select-none transition ${
                  isActive
                    ? 'bg-indigo-500/10 border-indigo-500/40 text-slate-200 shadow shadow-indigo-500/5'
                    : 'bg-slate-950 border-slate-850 hover:bg-slate-950/80 text-slate-450 hover:border-slate-800'
                }`}
              >
                {/* Thumbnail Sim */}
                <div className="w-12 h-12 bg-slate-900 rounded-lg shrink-0 flex items-center justify-center border border-slate-805 relative text-indigo-400">
                  <Video className="w-5 h-5 opacity-70" />
                  <span className="absolute bottom-1 right-1 text-[8px] bg-slate-950/90 text-slate-350 font-mono px-1 rounded">
                    {formatDurationStr(proj.duration)}
                  </span>
                </div>

                {/* Details col */}
                <div className="flex-grow flex flex-col justify-between overflow-hidden">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-slate-250 truncate leading-snug" title={proj.name}>
                      {proj.name}
                    </span>
                    <span className="text-[9px] text-slate-500 truncate leading-snug">
                      Dimensions: {proj.width}x{proj.height} | {formatBytes(proj.blob.size)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5 text-slate-600" />
                      {new Date(proj.createdAt).toLocaleDateString()}
                    </span>

                    {/* Operational download or delete */}
                    <div className="flex items-center gap-1 pr-1">
                      <button
                        onClick={(e) => handleDownloadRaw(proj, e)}
                        className="p-1 hover:bg-slate-900/60 rounded text-indigo-400 hover:text-indigo-300 duration-150 transition"
                        title="Download Raw WebM"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="p-1 hover:bg-slate-900/60 rounded text-red-400 hover:text-red-300 duration-150 transition"
                        title="Delete Capture"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
