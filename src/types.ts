export interface RecordingSettings {
  resolution: '720p' | '1080p' | '1440p' | '4k';
  fps: 30 | 60;
  recordMic: boolean;
  recordSystemAudio: boolean;
  recordWebcam: boolean;
  autoNormalizeAudio?: boolean; // Auto-normalize audio levels for system and mic inputs
}

export interface TextOverlay {
  id: string;
  text: string;
  fontSize: number; // in pixels
  color: string;
  shadowColor: string;
  positionX: number; // 0 to 100 percentage
  positionY: number; // 0 to 100 percentage
  startTime: number; // in seconds
  endTime: number; // in seconds
}

export type VideoFilterType =
  | 'none'
  | 'grayscale'
  | 'sepia'
  | 'warm'
  | 'cool'
  | 'cyberpunk'
  | 'cinematic'
  | 'vintage'
  | 'invert'
  | 'highcontrast';

export interface VideoFilter {
  id: VideoFilterType;
  name: string;
  description: string;
  cssFilter: string;
}

export interface VideoProject {
  id: string;
  name: string;
  createdAt: number;
  duration: number; // in seconds
  blob: Blob;
  width: number;
  height: number;
}

export interface TrimSettings {
  start: number; // in seconds
  end: number; // in seconds
}

export interface EditorState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  trim: TrimSettings;
  activeFilter: VideoFilterType;
  overlays: TextOverlay[];
  selectedOverlayId: string | null;
  brightness: number; // 0.5 to 1.5
  contrast: number; // 0.5 to 1.5
  saturation: number; // 0 to 2
  volume: number; // 0 to 1
  aspectRatio: 'original' | '16-9' | '9-16' | '1-1';
  maskUrlBar: boolean; // Hide browser URL header with a block overlay
}
