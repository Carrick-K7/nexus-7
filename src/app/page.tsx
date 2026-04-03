"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { useCitySimulation } from "@/hooks/useCitySimulation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import BackgroundEffects from "@/components/layout/BackgroundEffects";
import Dashboard from "@/components/dashboard/Dashboard";
import NeuralNetwork from "@/components/neural/NeuralNetwork";
import Trading from "@/components/trading/Trading";
import Terminal from "@/components/terminal/Terminal";
import Missions from "@/components/missions/Missions";
import AIAssistant from "@/components/ai-assistant/AIAssistant";
import Quantum from "@/components/quantum/Quantum";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import SatelliteControl from "@/components/satellite/SatelliteControl";
import HackerGame from "@/components/hacker/HackerGame";
import AIAgentsPanel from "@/components/agents/AIAgentsPanel";
import MatrixRain from "@/components/effects/MatrixRain";
import CityPreview3D from "@/components/city/CityPreview3D";
import DataAnalytics from "@/components/analytics/DataAnalytics";
import About from "@/components/about/About";
import NewsPanel from "@/components/news/NewsPanel";
import EmergencyResponse from "@/components/emergency/EmergencyResponse";
import WeatherPanel from "@/components/weather/WeatherPanel";
import SettingsPanel from "@/components/settings/SettingsPanel";
import AchievementsPanel from "@/components/achievements/AchievementsPanel";

const viewComponents: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  neural: NeuralNetwork,
  trading: Trading,
  terminal: Terminal,
  missions: Missions,
  "ai-assistant": AIAssistant,
  quantum: Quantum,
  notifications: NotificationCenter,
  satellite: SatelliteControl,
  hacker: HackerGame,
  agents: AIAgentsPanel,
  city3d: CityPreview3D,
  analytics: DataAnalytics,
  emergency: EmergencyResponse,
  weather: WeatherPanel,
  news: NewsPanel,
  achievements: AchievementsPanel,
  settings: SettingsPanel,
  about: About,
};

export default function Home() {
  const { activeView, theme } = useNexusStore();
  const ActiveComponent = viewComponents[activeView] || Dashboard;
  useCitySimulation();

  return (
    <div className="min-h-screen bg-cyber-black">
      <BackgroundEffects />
      {theme === 'matrix' && <MatrixRain enabled={true} opacity={0.7} />}
      <Sidebar />
      <Topbar />
      <main className="ml-64 pt-16 min-h-screen">
        <ActiveComponent />
      </main>
    </div>
  );
}