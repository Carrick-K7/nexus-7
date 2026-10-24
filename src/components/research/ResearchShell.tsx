"use client";

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
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
import ResearchStation from "@/components/research/ResearchStation";
import CityArchive from "@/components/archive/CityArchive";

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
  research: ResearchStation,
  "city-archive": CityArchive,
};

function subscribeToStoreHydration(onStoreChange: () => void) {
  const unsubscribeHydrate = useNexusStore.persist.onHydrate(onStoreChange);
  const unsubscribeFinish = useNexusStore.persist.onFinishHydration(onStoreChange);
  return () => { unsubscribeHydrate(); unsubscribeFinish(); };
}
function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
function queryView() {
  return new URLSearchParams(window.location.search).get("view");
}

/** The shared shell never advances the city while reading research or archives. */
export default function ResearchShell({ fixedView }: { fixedView?: "research" | "city-archive" }) {
  const { activeView, setActiveView, language, theme } = useNexusStore();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const locationView = useSyncExternalStore(subscribeToLocation, queryView, () => null);
  const requestedView = fixedView ?? locationView ?? activeView;
  const selectedView = Object.hasOwn(viewComponents, requestedView) ? requestedView : "research";
  const ActiveComponent = viewComponents[selectedView];
  const observing = ["symbiosis", "research", "city-archive"].includes(selectedView);
  const storeHydrated = useSyncExternalStore(subscribeToStoreHydration, () => useNexusStore.persist.hasHydrated(), () => false);
  useCitySimulation(!observing);

  const selectView = (view: string) => {
    setActiveView(view);
    if (fixedView) {
      if (view !== fixedView) router.push(view === "research" ? "/research" : `/?view=${encodeURIComponent(view)}`);
    } else if (view === "research") {
      // The bare home URL is now the human reading page, not this technical shell.
      router.push("/research");
    } else {
      window.history.replaceState(null, "", `/?view=${encodeURIComponent(view)}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = language === "zh" ? "zh-CN" : "en";
    root.dataset.themeSwitching = "true";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    void root.offsetWidth;
    const frame = window.requestAnimationFrame(() => { delete root.dataset.themeSwitching; });
    return () => { window.cancelAnimationFrame(frame); delete root.dataset.themeSwitching; };
  }, [language, theme]);

  return (
    <div data-theme={theme} data-surface={observing ? "observatory" : "cyberpunk"} className={`min-h-screen bg-cyber-black ${observing ? "observatory-shell" : "cyberpunk-shell"}`} onKeyDown={(event) => { if (event.key === "Escape") setMobileNavOpen(false); }}>
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-[60] rounded bg-cyber-darker p-3 text-cyber-blue focus:not-sr-only">{language === "zh" ? "跳到主要内容" : "Skip to main content"}</a>
      <BackgroundEffects enabled={!observing} />
      {mobileNavOpen && <button type="button" aria-label={language === "zh" ? "关闭导航" : "Close navigation"} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} themeReady={storeHydrated} selectedView={selectedView} onSelectView={selectView} />
      <Topbar onOpenMenu={() => setMobileNavOpen(true)} menuOpen={mobileNavOpen} themeReady={storeHydrated} selectedView={selectedView} />
      <main id="main-content" tabIndex={-1} className="relative z-10 min-h-screen pt-16 lg:ml-64"><ActiveComponent /></main>
    </div>
  );
}
