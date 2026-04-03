'use client';

import { useNexusStore } from '@/stores/nexus-store';
import { motion } from 'framer-motion';
import { Bell, Search, Clock, User, ChevronDown, Globe } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export default function Topbar() {
  const { gameTime, setGameTime, notifications, markAsRead, cityStats, language, setLanguage } = useNexusStore();
  const { t } = useTranslation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

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
      className="fixed top-0 left-64 right-0 h-16 bg-cyber-darker/95 border-b border-cyber-blue/20 flex items-center justify-between px-6 z-40"
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="w-4 h-4 text-cyber-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Search Nexus..."
            className="w-64 pl-10 pr-4 py-2 bg-cyber-dark border border-cyber-blue/20 rounded-lg text-sm text-cyber-text placeholder-cyber-text-dim focus:outline-none focus:border-cyber-blue/50 transition-colors"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cyber-text-dim bg-cyber-gray px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-cyber-text-dim">
            <Clock className="w-4 h-4" />
            <span className="font-mono text-cyber-blue">{formatTime(gameTime.hour, gameTime.minute)}</span>
          </div>
          <div className="text-cyber-text-dim">|</div>
          <div className="text-cyber-text-dim">{formatDay(gameTime.day)}</div>
          <div className="flex gap-1">
            {[1, 2, 5, 10].map((speed) => (
              <button
                key={speed}
                onClick={() => setGameTime({ speed: speed as 1 | 2 | 5 | 10 })}
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
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-cyber-green/10 border border-cyber-green/30 rounded">
            <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="text-xs text-cyber-green font-medium">
              {(cityStats.population / 1000000).toFixed(1)}M Citizens
            </span>
          </div>
        </div>

        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg bg-cyber-gray hover:bg-cyber-gray-light transition-colors"
          >
            <Bell className="w-5 h-5 text-cyber-text-dim" />
            {unreadCount > 0 && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-cyber-red rounded-full text-xs flex items-center justify-center text-white font-bold"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </motion.button>

          {showNotifications && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 top-12 w-80 bg-cyber-dark border border-cyber-blue/30 rounded-xl shadow-xl overflow-hidden"
            >
              <div className="p-3 border-b border-cyber-blue/20 flex items-center justify-between">
                <span className="text-sm font-medium text-cyber-text">Notifications</span>
                <button 
                  onClick={() => notifications.forEach(n => markAsRead(n.id))}
                  className="text-xs text-cyber-blue hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-cyber-text-dim text-sm">
                    No notifications
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
        </div>

        <motion.button 
          whileHover={{ scale: 1.05 }}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-cyber-gray transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-purple to-cyber-pink flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <ChevronDown className="w-4 h-4 text-cyber-text-dim" />
        </motion.button>

        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setShowLangMenu(!showLangMenu)}
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
