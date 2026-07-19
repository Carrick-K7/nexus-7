'use client';

import { useNexusStore } from '@/stores/nexus-store';
import { motion } from 'framer-motion';
import { Bell, Search, Clock, Eye, Globe, Menu, Pause, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface TopbarProps {
  onOpenMenu: () => void;
}

export default function Topbar({ onOpenMenu }: TopbarProps) {
  const {
    gameTime,
    setSimulationSpeed,
    simulation,
    pauseSimulation,
    resumeSimulation,
    notifications,
    markAsRead,
    cityStats,
    language,
    setLanguage,
    activeView,
  } = useNexusStore();
  const { t } = useTranslation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;
  const observingSymbiosis = activeView === "symbiosis";

  const formatTime = (hour: number, minute: number) => {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const formatDay = (day: number) => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `DAY ${day} | ${months[Math.floor((day - 1) / 30) % 12]}`;
  };

  return (
    <motion.header 
      initial={{ y: -60 }}
      animate={{ y: 0 }}
      className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-cyber-blue/20 bg-cyber-darker/95 px-3 sm:px-4 lg:left-64 xl:px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-cyber-text-dim hover:bg-cyber-gray hover:text-cyber-text lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {observingSymbiosis ? (
          <div className="hidden items-center gap-2 text-sm text-cyber-text-dim sm:flex">
            <Eye className="h-4 w-4 text-cyber-green" />
            <span>
              {language === "zh" ? "活动城市观测" : "Live city observation"}
            </span>
          </div>
        ) : <div className="relative hidden 2xl:block">
          <Search className="w-4 h-4 text-cyber-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            aria-label={t('search')}
            placeholder={t('search')}
            className="w-64 pl-10 pr-4 py-2 bg-cyber-dark border border-cyber-blue/20 rounded-lg text-sm text-cyber-text placeholder-cyber-text-dim focus:outline-none focus:border-cyber-blue/50 transition-colors"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyber-text-dim bg-cyber-gray px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 xl:gap-5">
        {!observingSymbiosis && <div className="hidden items-center gap-3 text-sm md:flex">
          <div className="flex items-center gap-2 text-cyber-text-dim">
            <Clock className="w-4 h-4" />
            <span className="font-mono text-cyber-blue">{formatTime(gameTime.hour, gameTime.minute)}</span>
          </div>
          <div className="hidden text-cyber-text-dim lg:block">|</div>
          <div className="hidden text-cyber-text-dim lg:block">{formatDay(gameTime.day)}</div>
          <div className="hidden gap-1 xl:flex">
            <button
              type="button"
              onClick={simulation.status === 'running' ? pauseSimulation : resumeSimulation}
              aria-label={simulation.status === 'running' ? t('pauseSimulation') : t('resumeSimulation')}
              className="rounded p-1 text-cyber-text-dim hover:bg-cyber-gray hover:text-cyber-blue"
            >
              {simulation.status === 'running' ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            {[1, 2, 5, 10].map((speed) => (
              <button
                key={speed}
                onClick={() => setSimulationSpeed(speed as 1 | 2 | 5 | 10)}
                className={`px-2 py-1 text-xs rounded ${
                  gameTime.speed === speed 
                    ? 'bg-cyber-blue/20 text-cyber-blue' 
                    : 'text-cyber-text-dim hover:bg-cyber-gray'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>}

        {!observingSymbiosis && <div className="hidden items-center gap-4 xl:flex">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-cyber-green/10 border border-cyber-green/30 rounded">
            <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="text-xs text-cyber-green font-medium">
              {(cityStats.population / 1000000).toFixed(1)}M Citizens
            </span>
          </div>
        </div>}

        {observingSymbiosis && (
          <div className="hidden items-center gap-2 rounded-full border border-cyber-green/30 bg-cyber-green/5 px-3 py-1.5 text-xs text-cyber-green md:flex">
            <span className="h-2 w-2 rounded-full bg-cyber-green" />
            {language === "zh" ? "公共只读" : "PUBLIC READ-ONLY"}
          </div>
        )}

        {!observingSymbiosis && <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Open notifications"
            className="relative p-2 rounded-lg bg-cyber-gray hover:bg-cyber-gray-light transition-colors"
          >
            <Bell className="w-5 h-5 text-cyber-text-dim" />
            {unreadCount > 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-cyber-red text-xs font-bold text-cyber-black"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </motion.button>

          {showNotifications && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="fixed left-3 right-3 top-16 overflow-hidden rounded-xl border border-cyber-blue/30 bg-cyber-dark shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80"
            >
              <div className="p-3 border-b border-cyber-blue/20 flex items-center justify-between">
                <span className="text-sm font-medium text-cyber-text">{t('notificationsTitle')}</span>
                <button 
                  onClick={() => notifications.forEach(n => markAsRead(n.id))}
                  className="text-xs text-cyber-blue hover:underline"
                >
                  {t('markAllRead')}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-cyber-text-dim text-sm">
                    {t('noNotifications')}
                  </div>
                ) : (
                  notifications.slice(0, 5).map((notif) => (
                    <div 
                      key={notif.id}
                      className={`p-3 border-b border-cyber-blue/10 last:border-0 ${
                        notif.read ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 mt-1.5 rounded-full ${
                          notif.type === 'error' ? 'bg-cyber-red' :
                          notif.type === 'warning' ? 'bg-cyber-orange' :
                          notif.type === 'success' ? 'bg-cyber-green' : 'bg-cyber-blue'
                        }`} />
                        <div>
                          <p className="text-sm text-cyber-text">{notif.title}</p>
                          <p className="text-xs text-cyber-text-dim mt-0.5">{notif.message}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </div>}

        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setShowLangMenu(!showLangMenu)}
            aria-label="Change language"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyber-gray hover:bg-cyber-gray-light transition-colors"
          >
            <Globe className="w-4 h-4 text-cyber-text-dim" />
            <span className="text-sm text-cyber-text font-medium">{language.toUpperCase()}</span>
          </motion.button>

          {showLangMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-12 w-32 bg-cyber-dark border border-cyber-blue/30 rounded-xl shadow-xl overflow-hidden"
            >
              <button
                onClick={() => { setLanguage('en'); setShowLangMenu(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-cyber-gray/50 transition-colors ${
                  language === 'en' ? 'text-cyber-blue bg-cyber-blue/10' : 'text-cyber-text'
                }`}
              >
                English
              </button>
              <button
                onClick={() => { setLanguage('zh'); setShowLangMenu(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-cyber-gray/50 transition-colors ${
                  language === 'zh' ? 'text-cyber-blue bg-cyber-blue/10' : 'text-cyber-text'
                }`}
              >
                中文
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </motion.header>
  );
}
