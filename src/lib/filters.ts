import { VideoFilter } from '../types';

export const VIDEO_FILTERS: VideoFilter[] = [
  {
    id: 'none',
    name: 'None',
    description: 'No filters applied, retaining source colors.',
    cssFilter: 'none'
  },
  {
    id: 'grayscale',
    name: 'Noir (Grayscale)',
    description: 'Timeless high-contrast black and white styling.',
    cssFilter: 'grayscale(100%)'
  },
  {
    id: 'sepia',
    name: 'Aged Sepia',
    description: 'Classic warm sepia nostalgic tone.',
    cssFilter: 'sepia(90%)'
  },
  {
    id: 'warm',
    name: 'Warm Sunset',
    description: 'Enhances warm tones, orange highlights, and cozy vibes.',
    cssFilter: 'sepia(30%) saturate(145%) hue-rotate(-10deg) brightness(102%)'
  },
  {
    id: 'cool',
    name: 'Cool Ocean',
    description: 'Brings out rich deep blues and ice-cold highlights.',
    cssFilter: 'saturate(115%) hue-rotate(15deg) brightness(104%) contrast(97%)'
  },
  {
    id: 'cyberpunk',
    name: 'Synthwave / Cyberpunk',
    description: 'Hyper-saturated magenta and clean electric blue highlights.',
    cssFilter: 'hue-rotate(285deg) saturate(190%) contrast(115%) brightness(105%)'
  },
  {
    id: 'cinematic',
    name: 'Teal & Orange (Cinematic)',
    description: 'Cool cinematic shadows coupled with rich skin highlights.',
    cssFilter: 'contrast(115%) saturate(125%) brightness(96%) hue-rotate(-5deg)'
  },
  {
    id: 'vintage',
    name: 'VHS Vintage',
    description: 'A matte 90s camcorder retro look with faded blacks.',
    cssFilter: 'sepia(45%) saturate(80%) contrast(85%) hue-rotate(-20deg) brightness(102%)'
  },
  {
    id: 'invert',
    name: 'Inverted Matrix',
    description: 'Inverts light & shade values for a spooky digital look.',
    cssFilter: 'invert(100%)'
  },
  {
    id: 'highcontrast',
    name: 'Sentry / High Contrast',
    description: 'Punches up readability and system UI indicators.',
    cssFilter: 'contrast(165%) brightness(105%) saturate(110%)'
  }
];
