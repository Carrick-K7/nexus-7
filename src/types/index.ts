export interface CityStats {
  population: number;
  gdp: number;
  happiness: number;
  pollution: number;
  crime: number;
  traffic: number;
  energy: number;
  water: number;
  internet: number;
  medical: number;
}

export interface Weather {
  temp: number;
  humidity: number;
  wind: number;
  condition: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
  aqi: number;
}

export interface District {
  id: string;
  name: string;
  type: 'residential' | 'commercial' | 'industrial' | 'restricted';
  population: number;
  development: number;
  status: 'normal' | 'warning' | 'critical';
}

export interface NeuralNode {
  id: string;
  name: string;
  type: 'input' | 'hidden' | 'output';
  status: 'active' | 'idle' | 'overload' | 'offline';
  connections: string[];
  load: number;
  position: { x: number; y: number };
}

export interface TradeAsset {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  history: number[];
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: 'normal' | 'urgent' | 'hidden';
  difficulty: 1 | 2 | 3 | 4 | 5;
  reward: { type: string; amount: number };
  progress: number;
  deadline: number;
  status: 'available' | 'in_progress' | 'completed' | 'failed';
  assigned: boolean;
}

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  source: string;
}

export interface AriaMessage {
  id: string;
  role: 'user' | 'aria';
  content: string;
  timestamp: number;
}

export interface AIAgent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'error';
  mood: number;
  specialty: string[];
  avatar: string;
}

export interface Qubit {
  id: number;
  state: 0 | 1 | 'superposition';
  entangled: number[];
}

export interface TerminalCommand {
  command: string;
  description: string;
  aliases: string[];
}

export type ThemeMode = 'dark' | 'matrix' | 'hacker';

export interface GameTime {
  hour: number;
  minute: number;
  day: number;
  speed: 1 | 2 | 5 | 10;
}
