import { create } from 'zustand';
import type { 
  CityStats, Weather, District, NeuralNode, TradeAsset, 
  Mission, Notification, AriaMessage, AIAgent, Qubit, ThemeMode, GameTime 
} from '@/types';
import { Language } from '@/i18n/translations';

interface NexusStore {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  
  cityStats: CityStats;
  updateCityStats: (stats: Partial<CityStats>) => void;
  
  weather: Weather;
  setWeather: (weather: Partial<Weather>) => void;
  
  districts: District[];
  updateDistrict: (id: string, data: Partial<District>) => void;
  
  neuralNodes: NeuralNode[];
  setNeuralNodes: (nodes: NeuralNode[]) => void;
  updateNode: (id: string, data: Partial<NeuralNode>) => void;
  
  tradeAssets: TradeAsset[];
  updateAsset: (id: string, data: Partial<TradeAsset>) => void;
  
  missions: Mission[];
  addMission: (mission: Mission) => void;
  updateMission: (id: string, data: Partial<Mission>) => void;
  
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
  
  ariaMessages: AriaMessage[];
  addAriaMessage: (message: Omit<AriaMessage, 'id' | 'timestamp'>) => void;
  
  aiAgents: AIAgent[];
  updateAgent: (id: string, data: Partial<AIAgent>) => void;
  
  qubits: Qubit[];
  setQubits: (qubits: Qubit[]) => void;
  
  gameTime: GameTime;
  setGameTime: (time: Partial<GameTime>) => void;
  
  activeView: string;
  setActiveView: (view: string) => void;
}

export const useNexusStore = create<NexusStore>((set) => ({
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
  language: 'en',
  setLanguage: (language) => set({ language }),

  cityStats: {
    population: 8472934,
    gdp: 2847,
    happiness: 72,
    pollution: 34,
    crime: 23,
    traffic: 56,
    energy: 78,
    water: 91,
    internet: 94,
    medical: 85,
  },
  updateCityStats: (stats) => set((state) => ({ 
    cityStats: { ...state.cityStats, ...stats } 
  })),

  weather: {
    temp: 23,
    humidity: 65,
    wind: 12,
    condition: 'clear',
    aqi: 42,
  },
  setWeather: (weather) => set((state) => ({ 
    weather: { ...state.weather, ...weather } 
  })),

  districts: [
    { id: 'd1', name: 'Neo Downtown', type: 'commercial', population: 420000, development: 95, status: 'normal' },
    { id: 'd2', name: 'Chrome Heights', type: 'residential', population: 890000, development: 78, status: 'normal' },
    { id: 'd3', name: 'Iron Works', type: 'industrial', population: 120000, development: 62, status: 'warning' },
    { id: 'd4', name: 'Black Zone', type: 'restricted', population: 0, development: 0, status: 'critical' },
    { id: 'd5', name: 'Silicon Valley II', type: 'commercial', population: 340000, development: 88, status: 'normal' },
    { id: 'd6', name: 'Green Sector', type: 'residential', population: 560000, development: 71, status: 'normal' },
  ],
  updateDistrict: (id, data) => set((state) => ({
    districts: state.districts.map(d => d.id === id ? { ...d, ...data } : d)
  })),

  neuralNodes: [],
  setNeuralNodes: (nodes) => set({ neuralNodes: nodes }),
  updateNode: (id, data) => set((state) => ({
    neuralNodes: state.neuralNodes.map(n => n.id === id ? { ...n, ...data } : n)
  })),

  tradeAssets: [
    { id: 'pwr', symbol: 'PWR', name: 'Power Grid', price: 847.32, change: 12.45, changePercent: 1.49, volume: 2847293, high: 852, low: 834, history: [] },
    { id: 'dat', symbol: 'DAT', name: 'Data Bandwidth', price: 234.18, change: -3.21, changePercent: -1.35, volume: 1928347, high: 238, low: 231, history: [] },
    { id: 'mat', symbol: 'MAT', name: 'Raw Materials', price: 156.72, change: 5.67, changePercent: 3.75, volume: 3847291, high: 158, low: 149, history: [] },
    { id: 'chp', symbol: 'CHP', name: 'Neural Chips', price: 1247.83, change: 23.45, changePercent: 1.91, volume: 947283, high: 1255, low: 1220, history: [] },
    { id: 'nrg', symbol: 'NRG', name: 'Energy Cells', price: 89.45, change: -1.23, changePercent: -1.36, volume: 5629384, high: 92, low: 88, history: [] },
  ],
  updateAsset: (id, data) => set((state) => ({
    tradeAssets: state.tradeAssets.map(a => a.id === id ? { ...a, ...data } : a)
  })),

  missions: [],
  addMission: (mission) => set((state) => ({ missions: [...state.missions, mission] })),
  updateMission: (id, data) => set((state) => ({
    missions: state.missions.map(m => m.id === id ? { ...m, ...data } : m)
  })),

  notifications: [],
  addNotification: (notification) => set((state) => ({
    notifications: [
      {
        ...notification,
        id: `notif-${Date.now()}`,
        timestamp: Date.now(),
        read: false,
      },
      ...state.notifications
    ].slice(0, 50)
  })),
  markAsRead: (id) => set((state) => ({
    notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
  })),
  clearNotifications: () => set({ notifications: [] }),

  ariaMessages: [],
  addAriaMessage: (message) => set((state) => ({
    ariaMessages: [
      ...state.ariaMessages,
      {
        ...message,
        id: `msg-${Date.now()}`,
        timestamp: Date.now(),
      }
    ]
  })),

  aiAgents: [
    { id: 'aria', name: 'ARIA', role: 'Central Intelligence', status: 'active', mood: 85, specialty: ['reasoning', 'creativity', 'analysis'], avatar: '🧠' },
    { id: 'atlas', name: 'ATLAS', role: 'Security Chief', status: 'active', mood: 72, specialty: ['threat_detection', 'surveillance', 'countermeasures'], avatar: '🛡️' },
    { id: 'economica', name: 'ECONOMICA', role: 'Economic Advisor', status: 'idle', mood: 90, specialty: ['market_analysis', 'resource_allocation', 'forecasting'], avatar: '📊' },
    { id: 'civitas', name: 'CIVITAS', role: 'Infrastructure Director', status: 'active', mood: 68, specialty: ['urban_planning', 'maintenance', 'utilities'], avatar: '🏗️' },
    { id: 'spectre', name: 'SPECTRE', role: 'Intelligence Chief', status: 'idle', mood: 55, specialty: ['reconnaissance', 'data_mining', 'espionage'], avatar: '👁️' },
  ],
  updateAgent: (id, data) => set((state) => ({
    aiAgents: state.aiAgents.map(a => a.id === id ? { ...a, ...data } : a)
  })),

  qubits: Array.from({ length: 8 }, (_, i) => ({
    id: i,
    state: (i % 3 === 0 ? 'superposition' : (i % 2 === 0 ? 0 : 1)) as 0 | 1 | 'superposition',
    entangled: i < 7 ? [i + 1] : [],
  })),
  setQubits: (qubits) => set({ qubits }),

  gameTime: { hour: 12, minute: 0, day: 1, speed: 1 },
  setGameTime: (time) => set((state) => ({ 
    gameTime: { ...state.gameTime, ...time } 
  })),

  activeView: 'dashboard',
  setActiveView: (view) => set({ activeView: view }),
}));
