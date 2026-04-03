'use client';

import { useNexusStore } from '@/stores/nexus-store';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

const initialNotifications = [
  { id: 'n1', type: 'error' as const, title: 'Power Grid Failure', message: 'Iron Works district experiencing 40% power reduction', timestamp: Date.now() - 300000, read: false, source: 'GRID_MGMT' },
  { id: 'n2', type: 'warning' as const, title: 'High Traffic Alert', message: 'Neo Downtown traffic density at 87% capacity', timestamp: Date.now() - 600000, read: false, source: 'TRAFFIC_CTL' },
  { id: 'n3', type: 'info' as const, title: 'System Update', message: 'Neural network optimization complete. 12% efficiency gain.', timestamp: Date.now() - 1800000, read: true, source: 'NEXUS' },
  { id: 'n4', type: 'success' as const, title: 'Mission Completed', message: 'Medical Supply Run successfully delivered', timestamp: Date.now() - 3600000, read: true, source: 'MISSION_SYS' },
  { id: 'n5', type: 'warning' as const, title: 'Crime Spike', message: 'Unusual activity detected in Black Zone sector', timestamp: Date.now() - 7200000, read: false, source: 'SECURITY' },
  { id: 'n6', type: 'info' as const, title: 'Weather Update', message: 'Storm warning: Heavy rain expected in next 6 hours', timestamp: Date.now() - 10800000, read: true, source: 'WEATHER' },
  { id: 'n7', type: 'error' as const, title: 'Network Breach Attempt', message: 'Blocked 3 intrusion attempts from external sources', timestamp: Date.now() - 14400000, read: true, source: 'FIREWALL' },
];

export default function NotificationCenter() {
  const { notifications, markAsRead, clearNotifications } = useNexusStore();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'error' | 'warning' | 'info' | 'success'>('all');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const allNotifications = notifications.length > 0 ? notifications : initialNotifications;
  const filteredNotifications = allNotifications
    .filter(n => filter === 'all' || !n.read)
    .filter(n => selectedType === 'all' || n.type === selectedType);

  const getIcon = (type: string) => {
    switch (type) {
      case 'error': return <XCircle className="w-4 h-4 text-cyber-red" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-cyber-orange" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-cyber-green" />;
      default: return <Info className="w-4 h-4 text-cyber-blue" />;
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((now - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-yellow cyber-text-glow">NOTIFICATIONS</h1>
        <p className="text-cyber-text-dim mt-1">System alerts and event log</p>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: allNotifications.length, color: 'cyber-blue' },
          { label: 'Unread', value: allNotifications.filter(n => !n.read).length, color: 'cyber-red' },
          { label: 'Warnings', value: allNotifications.filter(n => n.type === 'warning').length, color: 'cyber-orange' },
          { label: 'Critical', value: allNotifications.filter(n => n.type === 'error').length, color: 'cyber-red' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4">
            <span className="text-xs text-cyber-text-dim">{stat.label}</span>
            <div className={`text-xl font-bold text-${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2">
        {(['all', 'unread'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === f ? 'bg-cyber-blue text-white' : 'bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => clearNotifications()}
          className="px-4 py-2 bg-cyber-red/20 border border-cyber-red/50 rounded-lg text-sm text-cyber-red hover:bg-cyber-red/30 transition-colors">
          Clear All
        </button>
      </div>

      <div className="flex gap-2">
        {(['all', 'error', 'warning', 'info', 'success'] as const).map((t) => (
          <button key={t} onClick={() => setSelectedType(t)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all capitalize ${selectedType === t ? 'bg-cyber-purple text-white' : 'bg-cyber-gray text-cyber-text-dim hover:bg-cyber-gray-light'}`}>
            {t === 'all' ? 'All Types' : t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {filteredNotifications.map((notif, i) => (
            <motion.div key={notif.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              onClick={() => markAsRead(notif.id)}
              className={`bg-cyber-dark/50 border rounded-xl p-4 cursor-pointer transition-all ${
                !notif.read ? 'border-cyber-blue/40 bg-cyber-blue/5' : 'border-cyber-blue/20'
              } hover:border-cyber-blue/60`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  notif.type === 'error' ? 'bg-cyber-red/10' :
                  notif.type === 'warning' ? 'bg-cyber-orange/10' :
                  notif.type === 'success' ? 'bg-cyber-green/10' : 'bg-cyber-blue/10'
                }`}>
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-cyber-text">{notif.title}</h3>
                    <span className="text-xs text-cyber-text-dim">{getTimeAgo(notif.timestamp)}</span>
                  </div>
                  <p className="text-sm text-cyber-text-dim mt-1">{notif.message}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs px-2 py-0.5 bg-cyber-gray rounded text-cyber-text-dim">{notif.source}</span>
                    {!notif.read && <span className="text-xs px-2 py-0.5 bg-cyber-blue/20 rounded text-cyber-blue">NEW</span>}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
