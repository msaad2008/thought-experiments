import type { GameId } from '../shared/progress';

export interface GameInfo {
  id: GameId;
  title: string;
  subtitle: string;
  from: string;
  to: string;
  accent: string;
  status: 'live' | 'soon';
  maxStars: number;
}

export const GAMES: GameInfo[] = [
  { id: 'relativity', title: 'Antidote Run', subtitle: 'Relativity', from: '#1c2e6e', to: '#0d1433', accent: '#5fd0ff', status: 'soon', maxStars: 0 },
  { id: 'gravity', title: 'Slingshot', subtitle: 'Gravity', from: '#6a2a1c', to: '#2a1236', accent: '#ff7a3d', status: 'soon', maxStars: 0 },
  { id: 'entanglement', title: 'Entangled Maze', subtitle: 'Entanglement', from: '#5a1a4a', to: '#1a1440', accent: '#ff5c8a', status: 'soon', maxStars: 0 },
  { id: 'uncertainty', title: 'Uncertain Fire', subtitle: 'Uncertainty', from: '#3a2a7a', to: '#140f38', accent: '#9b7bff', status: 'soon', maxStars: 0 },
  { id: 'collider', title: 'Collider', subtitle: 'Particles', from: '#0f4a5a', to: '#0d1433', accent: '#2ec4b6', status: 'soon', maxStars: 0 },
];
