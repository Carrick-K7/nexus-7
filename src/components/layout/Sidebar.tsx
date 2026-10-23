"use client";

import { useEffect, useRef } from "react";
import {
  ActivitySquare,
  Atom,
  BadgeCheck,
  BarChart3,
  Bot,
  Box,
  Brain,
  Cloud,
  Database,
  Factory,
  GitCommit,
  GitPullRequestArrow,
  Info,
  LayoutDashboard,
  LineChart,
  MapPinned,
  MessageSquare,
  Microscope,
  Moon,
  Newspaper,
  Satellite,
  ScrollText,
  Settings,
  Siren,
  Sun,
  Terminal,
  TerminalSquare,
  Trophy,
  Users,
  Vote,
  X,
  Zap,
} from "lucide-react";
import {
  motion,
} from "framer-motion";
import {
  useTranslation,
} from "@/hooks/useTranslation";
import type {
  TranslationKey,
} from "@/i18n/translations";
import {
  useNexusStore,
} from "@/stores/nexus-store";

const primaryItems = [
  { id: "research", labelKey: "researchStation", icon: Microscope },
  { id: "evolution", labelKey: "evolutionLog", icon: GitCommit },
  { id: "verification", labelKey: "verificationNav", icon: BadgeCheck },
  { id: "operations", labelKey: "operationsNav", icon: ActivitySquare },
  { id: "about", labelKey: "about", icon: Info },
] as const;

const researchItems = [
  { id: "observer", labelKey: "observer", icon: Microscope },
  { id: "experiments", labelKey: "experiments", icon: Database },
  { id: "iteration", labelKey: "iterationLabNav", icon: GitPullRequestArrow },
  { id: "participation", labelKey: "participationNav", icon: Vote },
] as const;

const legacyItems = [
  { id: "symbiosis", labelKey: "symbiosisLens", icon: MapPinned },
  { id: "dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { id: "neural", labelKey: "neural", icon: Brain },
  { id: "trading", labelKey: "trading", icon: LineChart },
  { id: "missions", labelKey: "missions", icon: ScrollText },
  { id: "terminal", labelKey: "terminal", icon: Terminal },
  { id: "ai-assistant", labelKey: "aria", icon: Bot },
  { id: "quantum", labelKey: "quantum", icon: Atom },
  { id: "satellite", labelKey: "satellite", icon: Satellite },
  { id: "hacker", labelKey: "hacker", icon: TerminalSquare },
  { id: "agents", labelKey: "agents", icon: Users },
  { id: "city3d", labelKey: "city3d", icon: Box },
  { id: "analytics", labelKey: "analytics", icon: BarChart3 },
  { id: "emergency", labelKey: "emergency", icon: Siren },
  { id: "weather", labelKey: "weather", icon: Cloud },
  { id: "resource", labelKey: "resource", icon: Factory },
  { id: "social", labelKey: "socialHub", icon: MessageSquare },
  { id: "news", labelKey: "news", icon: Newspaper },
  { id: "achievements", labelKey: "achievements", icon: Trophy },
  { id: "settings", labelKey: "settings", icon: Settings },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  themeReady: boolean;
  selectedView?: string;
  onSelectView?: (view: string) => void;
}

export default function Sidebar({
  mobileOpen,
  onClose,
  themeReady,
  selectedView,
  onSelectView,
}: SidebarProps) {
  const {
    activeView,
    setActiveView,
    theme,
    setTheme,
    language,
  } = useNexusStore();
  const { t } = useTranslation();
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement;
    // The opening commit can still report the drawer as hidden. Move focus only
    // after the browser has applied its visible state, without scrolling the page.
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  const renderItems = (
    items: ReadonlyArray<{
      id: string;
      labelKey: string;
      icon: typeof MapPinned;
    }>,
  ) =>
    items.map((item) => {
      const Icon = item.icon;
      const isActive = (selectedView ?? activeView) === item.id;
      return (
        <motion.button
          key={item.id}
          type="button"
          onClick={() => {
            (onSelectView ?? setActiveView)(item.id);
            onClose();
          }}
          aria-current={isActive ? "page" : undefined}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-all ${
            isActive
              ? "border border-cyber-blue/50 bg-cyber-blue/20 text-cyber-blue shadow-[0_0_15px_rgba(0,240,255,0.2)]"
              : "text-cyber-text-dim hover:bg-cyber-gray/50 hover:text-cyber-text"
          }`}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="font-medium">
            {t(item.labelKey as TranslationKey)}
          </span>
          {isActive && (
            <span className="ml-auto h-2 w-2 rounded-full bg-cyber-blue" />
          )}
        </motion.button>
      );
    });

  return (
    <aside
      id="main-navigation"
      ref={drawer}
      onKeyDown={(event) => {
        if (!mobileOpen) return;
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const controls = Array.from(drawer.current?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),summary") ?? []).filter((node) => node.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      aria-label={language === "zh" ? "主导航" : "Main navigation"}
      className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-cyber-blue/20 bg-cyber-darker/97 transition-transform duration-300 lg:translate-x-0 ${
        mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible"
      }`}
    >
      <div className="border-b border-cyber-blue/20 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyber-blue to-cyber-purple">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-orbitron text-lg font-bold text-cyber-blue">
              NEXUS-7
            </p>
            <p className="text-xs leading-relaxed text-cyber-text-dim [overflow-wrap:anywhere]">
              {language === "zh" ? "反例驱动研究站" : "Counterexample-driven research station"}
            </p>
          </div>
          <button
            type="button"
            ref={closeButton}
            onClick={onClose}
            aria-label={language === "zh" ? "关闭导航" : "Close navigation"}
            className="ml-auto rounded-lg p-2 text-cyber-text-dim hover:bg-cyber-gray hover:text-cyber-text lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyber-text-dim">
          {language === "zh" ? "研究与可核验证据" : "Research & inspectable evidence"}
        </p>
        {renderItems(primaryItems)}
        <a href="/archive/city" aria-current={(selectedView ?? activeView) === "city-archive" ? "page" : undefined} className="flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm text-cyber-text-dim hover:bg-cyber-gray/50 hover:text-cyber-text">
          <MapPinned className="h-5 w-5 shrink-0" aria-hidden="true" />
          {language === "zh" ? "历史城市档案" : "Historical city archive"}
        </a>

        <details open className="group pt-2">
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-text-dim hover:bg-cyber-gray/40">
            {language === "zh" ? "研究与安全内核" : "Research & safety kernel"}
          </summary>
          <div className="mt-1 space-y-1 border-l border-cyber-purple/25 pl-2">
            {renderItems(researchItems)}
          </div>
        </details>

        <details data-testid="legacy-navigation" className="group">
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cyber-text-dim hover:bg-cyber-gray/40">
            {language === "zh" ? "兼容演示模块" : "Legacy demo modules"}
          </summary>
          <p className="px-3 py-2 text-[11px] leading-4 text-cyber-text-dim">
            {language === "zh"
              ? "保留旧观测与演示入口；历史停机与档案状态请查看城市档案。演示不改变共生城市。"
              : "Older observation and demo views remain available. See the archive for capture and stop evidence. Demos do not mutate the symbiosis city."}
          </p>
          <div className="space-y-1 border-l border-cyber-gray-light pl-2">
            {renderItems(legacyItems)}
          </div>
        </details>
      </nav>

      <div className="border-t border-cyber-blue/20 p-4">
        <div
          className="grid grid-cols-2 gap-2 rounded-xl border border-cyber-gray-light bg-cyber-dark/55 p-1.5"
          aria-label={language === "zh" ? "配色主题" : "Color theme"}
        >
          {([
            {
              id: "light",
              label: language === "zh" ? "浅色" : "Light",
              Icon: Sun,
            },
            {
              id: "dark",
              label: language === "zh" ? "深色" : "Dark",
              Icon: Moon,
            },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              disabled={!themeReady}
              aria-pressed={theme === id}
              className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition-all disabled:cursor-wait disabled:opacity-55 ${
                theme === id
                  ? "bg-gradient-to-r from-cyber-purple to-cyber-pink text-white shadow-[0_0_18px_color-mix(in_srgb,var(--cyber-purple)_32%,transparent)]"
                  : "text-cyber-text-dim hover:bg-cyber-gray hover:text-cyber-text"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
