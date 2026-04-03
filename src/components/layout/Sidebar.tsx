'use client';

import { useNexusStore } from '@/stores/nexus-store';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, Brain, LineChart, Terminal, 
  ScrollText, Bot, Atom, Satellite, Zap, TerminalSquare,
  Users, Box, BarChart3, Info, Newspaper, Siren, Cloud,
  Settings, Trophy, Factory
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { TranslationKey } from '@/i18n/translations';

const navItems = [
  { id: 'dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { id: 'neural', labelKey: 'neural', icon: Brain },
  { id: 'trading', labelKey: 'trading', icon: LineChart },
  { id: 'missions', labelKey: 'missions', icon: ScrollText },
  { id: 'terminal', labelKey: 'terminal', icon: Terminal },
  { id: 'ai-assistant', labelKey: 'aria', icon: Bot },
  { id: 'quantum', labelKey: 'quantum', icon: Atom },
  { id: 'satellite', labelKey: 'satellite', icon: Satellite },
  { id: 'hacker', labelKey: 'hacker', icon: TerminalSquare },
  { id: 'agents', labelKey: 'agents', icon: Users },
  { id: 'city3d', labelKey: 'city3d', icon: Box },
  { id: 'analytics', labelKey: 'analytics', icon: BarChart3 },
  { id: 'emergency', labelKey: 'emergency', icon: Siren },
  { id: 'weather', labelKey: 'weather', icon: Cloud },
  { id: 'resource', labelKey: 'resource', icon: Factory },
  { id: 'news', labelKey: 'news', icon: Newspaper },
  { id: 'achievements', labelKey: 'achievements', icon: Trophy },
  { id: 'settings', labelKey: 'settings', icon: Settings },
  { id: 'about', labelKey: 'about', icon: Info },
];

export default function Sidebar() {
  const { activeView, setActiveView, theme, setTheme, aiAgents } = useNexusStore();
  const { t } = useTranslation();

  return (
    <motion.aside 
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      className="fixed left-0 top-0 h-full w-64 bg-cyber-darker/95 border-r border-cyber-blue/20 flex flex-col z-50"
    >
      <div className="p-6 border-b border-cyber-blue/20">
        <motion.div 
          className="flex items-center gap-3"
          whileHover={{ scale: 1.02 }}
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyber-blue to-cyber-purple flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-orbitron text-lg font-bold text-cyber-blue cyber-text-glow">
              NEXUS
            </h1>
            <p className="text-xs text-cyber-text-dim">OMNIScient Control</p>
          </div>
        </motion.div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <motion.button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/50 shadow-[0_0_15px_rgba(0,240,255,0.3)]' 
                  : 'text-cyber-text-dim hover:bg-cyber-gray/50 hover:text-cyber-text'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-cyber-blue' : ''}`} />
              <span className="font-medium">{t(item.labelKey as TranslationKey)}</span>
              {isActive && (
                <motion.div 
                  layoutId="activeIndicator"
                  className="ml-auto w-2 h-2 rounded-full bg-cyber-blue"
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-cyber-blue/20">
        <div className="mb-4">
          <p className="text-xs text-cyber-text-dim mb-2">AI AGENTS</p>
          <div className="space-y-2">
            {aiAgents.slice(1).map((agent) => (
              <div key={agent.id} className="flex items-center gap-2 text-xs">
                <span>{agent.avatar}</span>
                <span className="text-cyber-text-dim">{agent.name}</span>
                <div className={`ml-auto w-2 h-2 rounded-full ${
                  agent.status === 'active' ? 'bg-cyber-green animate-pulse' : 
                  agent.status === 'idle' ? 'bg-cyber-yellow' : 'bg-cyber-red'
                }`} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {(['dark', 'hacker', 'matrix'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 py-2 px-3 rounded text-xs font-medium transition-all ${
                theme === t 
                  ? 'bg-cyber-purple text-white' 
                  : 'bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}
