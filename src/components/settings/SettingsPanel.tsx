"use client";

import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useNexusStore } from "@/stores/nexus-store";
import { useState } from "react";
import { 
  Settings, Monitor, Volume2, VolumeX, Bell, BellOff,
  Keyboard, Palette, Globe, Shield, Info, Save, RotateCcw
} from "lucide-react";

interface SettingsState {
  theme: "dark" | "hacker" | "matrix";
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  animationsEnabled: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
}

export default function SettingsPanel() {
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage } = useNexusStore();
  const [settings, setSettings] = useState<SettingsState>({
    theme: "dark",
    soundEnabled: true,
    notificationsEnabled: true,
    animationsEnabled: true,
    autoRefresh: true,
    refreshInterval: 5000,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setTheme(settings.theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings({
      theme: "dark",
      soundEnabled: true,
      notificationsEnabled: true,
      animationsEnabled: true,
      autoRefresh: true,
      refreshInterval: 5000,
    });
    setTheme("dark");
  };

  const shortcuts = [
    { key: "⌘K", action: "Open command palette" },
    { key: "⌘1-9", action: "Navigate to view 1-9" },
    { key: "ESC", action: "Close modal/panel" },
    { key: "⌘D", action: "Toggle dark mode" },
    { key: "⌘M", action: "Toggle matrix effect" },
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyber-purple/20 border border-cyber-purple/30">
            <Settings className="w-6 h-6 text-cyber-purple" />
          </div>
          <div>
            <h1 className="text-3xl font-orbitron font-bold text-cyber-purple cyber-text-glow">
              {t("settings_title")}
            </h1>
            <p className="text-cyber-text-dim mt-1">{t('customizeNexus')}</p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Palette className="w-5 h-5 text-cyber-blue" />
            <h2 className="text-lg font-orbitron font-bold text-cyber-text">{t("theme")}</h2>
          </div>
          
          <div className="space-y-3">
            {[
              { id: "dark", label: t('darkModeTheme'), color: "from-cyber-dark to-cyber-dark-light" },
              { id: "hacker", label: t('hackerTheme'), color: "from-cyber-green to-cyber-dark" },
              { id: "matrix", label: t('matrixTheme'), color: "from-cyber-green/50 to-cyber-dark" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setSettings(s => ({ ...s, theme: item.id as SettingsState["theme"] }))}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  settings.theme === item.id
                    ? "border-cyber-blue bg-cyber-blue/10"
                    : "border-cyber-gray/20 bg-cyber-dark/30 hover:border-cyber-gray/40"
                }`}
              >
                <div className={`w-full h-8 rounded bg-gradient-to-r ${item.color} mb-2`} />
                <div className="text-sm text-cyber-text">{item.label}</div>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-5 h-5 text-cyber-cyan" />
            <h2 className="text-lg font-orbitron font-bold text-cyber-text">{t("language")}</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setLanguage("en")}
              className={`p-4 rounded-lg border-2 transition-all ${
                language === "en"
                  ? "border-cyber-blue bg-cyber-blue/10"
                  : "border-cyber-gray/20 bg-cyber-dark/30 hover:border-cyber-gray/40"
              }`}
            >
              <div className="text-2xl mb-1">🇺🇸</div>
              <div className="text-sm text-cyber-text">English</div>
            </button>
            <button
              onClick={() => setLanguage("zh")}
              className={`p-4 rounded-lg border-2 transition-all ${
                language === "zh"
                  ? "border-cyber-blue bg-cyber-blue/10"
                  : "border-cyber-gray/20 bg-cyber-dark/30 hover:border-cyber-gray/40"
              }`}
            >
              <div className="text-2xl mb-1">🇨🇳</div>
              <div className="text-sm text-cyber-text">中文</div>
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Bell className="w-5 h-5 text-cyber-yellow" />
            <h2 className="text-lg font-orbitron font-bold text-cyber-text">{t("notifications")}</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.notificationsEnabled ? (
                  <Bell className="w-5 h-5 text-cyber-green" />
                ) : (
                  <BellOff className="w-5 h-5 text-cyber-gray" />
                )}
                <span className="text-cyber-text">{t("enableNotifications")}</span>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, notificationsEnabled: !s.notificationsEnabled }))}
                className={`w-12 h-6 rounded-full transition-all ${
                  settings.notificationsEnabled ? "bg-cyber-green" : "bg-cyber-gray"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.notificationsEnabled ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.soundEnabled ? (
                  <Volume2 className="w-5 h-5 text-cyber-green" />
                ) : (
                  <VolumeX className="w-5 h-5 text-cyber-gray" />
                )}
                <span className="text-cyber-text">{t("soundEffects")}</span>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
                className={`w-12 h-6 rounded-full transition-all ${
                  settings.soundEnabled ? "bg-cyber-green" : "bg-cyber-gray"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.soundEnabled ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-cyber-purple" />
                <span className="text-cyber-text">{t("animations")}</span>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, animationsEnabled: !s.animationsEnabled }))}
                className={`w-12 h-6 rounded-full transition-all ${
                  settings.animationsEnabled ? "bg-cyber-green" : "bg-cyber-gray"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.animationsEnabled ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Keyboard className="w-5 h-5 text-cyber-pink" />
            <h2 className="text-lg font-orbitron font-bold text-cyber-text">{t("keyboardShortcuts")}</h2>
          </div>
          
          <div className="space-y-2">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between py-2 border-b border-cyber-gray/10 last:border-0">
                <span className="text-cyber-text-dim">{shortcut.action}</span>
                <kbd className="px-2 py-1 bg-cyber-dark rounded text-xs font-mono text-cyber-blue">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex gap-4"
      >
        <button
          onClick={handleSave}
          className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-lg font-medium transition-all ${
            saved
              ? "bg-cyber-green text-white"
              : "bg-cyber-blue text-white hover:bg-cyber-blue/80"
          }`}
        >
          <Save className="w-5 h-5" />
          {saved ? "Saved!" : t("saveSettings")}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center justify-center gap-2 px-6 py-4 rounded-lg font-medium bg-cyber-gray text-cyber-text hover:bg-cyber-gray-light transition-all"
        >
          <RotateCcw className="w-5 h-5" />
          {t("reset")}
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-gradient-to-r from-cyber-purple/10 to-cyber-blue/10 border border-cyber-purple/20 rounded-xl p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Info className="w-5 h-5 text-cyber-purple" />
          <h2 className="text-lg font-orbitron font-bold text-cyber-text">{t("systemInformation")}</h2>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-cyber-text-dim">Version</div>
            <div className="text-cyber-text font-mono">NEXUS-7 v0.5.1</div>
          </div>
          <div>
            <div className="text-cyber-text-dim">Build</div>
            <div className="text-cyber-text font-mono">2087.04.03</div>
          </div>
          <div>
            <div className="text-cyber-text-dim">Components</div>
            <div className="text-cyber-text font-mono">18 Active</div>
          </div>
          <div>
            <div className="text-cyber-text-dim">Framework</div>
            <div className="text-cyber-text font-mono">Next.js 15</div>
          </div>
          <div>
            <div className="text-cyber-text-dim">State</div>
            <div className="text-cyber-text font-mono">Zustand</div>
          </div>
          <div>
            <div className="text-cyber-text-dim">Animation</div>
            <div className="text-cyber-text font-mono">Framer Motion</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
