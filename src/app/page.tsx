"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
import CityPreview3D from "@/components/city/CityPreview3D";
import DataAnalytics from "@/components/analytics/DataAnalytics";
import About from "@/components/about/About";
import NewsPanel from "@/components/news/NewsPanel";
import EmergencyResponse from "@/components/emergency/EmergencyResponse";
import WeatherPanel from "@/components/weather/WeatherPanel";
import SettingsPanel from "@/components/settings/SettingsPanel";
import AchievementsPanel from "@/components/achievements/AchievementsPanel";
import ResourceManagement from "@/components/resource/ResourceManagement";
import SocialHub from "@/components/social/SocialHub";
import EvolutionLog from "@/components/evolution/EvolutionLog";
import ObserverDashboard from "@/components/observer/ObserverDashboard";
import ExperimentPlatform from "@/components/experiments/ExperimentPlatform";
import IterationLab from "@/components/iteration/IterationLab";
import VerificationCenter from "@/components/verification/VerificationCenter";
import OperationsCenter from "@/components/operations/OperationsCenter";
import ParticipationCenter from "@/components/participation/ParticipationCenter";
import HumanObservatory from "@/components/symbiosis/HumanObservatory";

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
  resource: ResourceManagement,
  social: SocialHub,
  evolution: EvolutionLog,
  observer: ObserverDashboard,
  experiments: ExperimentPlatform,
  iteration: IterationLab,
  verification: VerificationCenter,
  operations: OperationsCenter,
  participation: ParticipationCenter,
  symbiosis: HumanObservatory,
};

function subscribeToStoreHydration(onStoreChange: () => void) {
  const unsubscribeHydrate = useNexusStore.persist.onHydrate(onStoreChange);
  const unsubscribeFinish = useNexusStore.persist.onFinishHydration(onStoreChange);
  return () => {
    unsubscribeHydrate();
    unsubscribeFinish();
  };
}

function getStoreHydrationSnapshot() {
  return useNexusStore.persist.hasHydrated();
}

export default function Home() {
  const { activeView, theme } = useNexusStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const storeHydrated = useSyncExternalStore(
    subscribeToStoreHydration,
    getStoreHydrationSnapshot,
    () => false,
  );
  const ActiveComponent = viewComponents[activeView] || Dashboard;
  useCitySimulation(activeView !== "symbiosis");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const cyberpunkShell = activeView !== "symbiosis";

  return (
    <div
      data-theme={theme}
      data-surface={cyberpunkShell ? "cyberpunk" : "observatory"}
      className={`min-h-screen bg-cyber-black ${
        cyberpunkShell ? "cyberpunk-shell" : "observatory-shell"
      }`}
    >
      <BackgroundEffects enabled={cyberpunkShell} />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        themeReady={storeHydrated}
      />
      <Topbar
        onOpenMenu={() => setMobileNavOpen(true)}
        themeReady={storeHydrated}
      />
      <main className="relative z-10 min-h-screen pt-16 lg:ml-64">
        <ActiveComponent />
      </main>
    </div>
  );
}
