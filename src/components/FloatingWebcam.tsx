import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Move } from 'lucide-react';

interface FloatingWebcamProps {
  isEnabled: boolean;
  onClose: () => void;
}

export default function FloatingWebcam({ isEnabled, onClose }: FloatingWebcamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [position, setPosition] = useState({ x: 30, y: window.innerHeight - 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEnabled) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setError(null);
        })
        .catch((err) => {
          console.error('Webcam stream error:', err);
          setError('Camera block: Please grant permission');
        });
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isEnabled]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 180, e.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 180, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isEnabled) return null;

  return (
    <div
      style={{ left: position.x, top: position.y }}
      className={`fixed z-50 w-44 h-44 rounded-full border-4 border-emerald-500 shadow-2xl overflow-hidden bg-slate-900 group select-none transition-shadow ${
        isDragging ? 'shadow-emerald-500/30 ring-4 ring-emerald-500/20 cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* Cam Stream */}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center text-xs text-red-200">
          <CameraOff className="w-6 h-6 mb-1 text-red-400" />
          <span>{error}</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover pointer-events-none scale-x-[-1]"
        />
      )}

      {/* Control Overlay */}
      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3 select-none">
        <div className="flex justify-between items-center">
          <span className="text-[10px] bg-slate-900/80 text-emerald-400 font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
            LIVE
          </span>
          <button
            onClick={onClose}
            className="text-[10px] text-white bg-slate-900/85 hover:bg-red-600 px-1.5 py-0.5 rounded transition"
            title="Disable Webcam"
          >
            ✕
          </button>
        </div>

        <div
          onMouseDown={handleMouseDown}
          className="mx-auto bg-slate-900/80 p-1.5 rounded-full cursor-grab active:cursor-grabbing hover:bg-slate-900 duration-150"
          title="Drag camera stream anywhere"
        >
          <Move className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}
