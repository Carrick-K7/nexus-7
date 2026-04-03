'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal as TerminalIcon, ChevronRight, AlertTriangle, Cpu, HardDrive, Wifi, Shield } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface HistoryEntry {
  type: 'input' | 'output' | 'error' | 'success';
  content: string;
  timestamp: Date;
}

const commands: Record<string, { description: string; execute: () => string }> = {
  help: { description: 'Show available commands', execute: () => 'Available commands: help, clear, status, scan, hack, whoami, date, matrix, exit' },
  status: { description: 'Show system status', execute: () => `[SYSTEM] Neural Network: ONLINE\n[SYSTEM] Defense Grid: ACTIVE\n[SYSTEM] Quantum Core: 88% capacity\n[SYSTEM] Network: SECURE` },
  scan: { description: 'Scan network for vulnerabilities', execute: () => {
    const vulns = Math.floor(Math.random() * 5) + 1;
    return `[SCAN] Network scan complete\n[FOUND] ${vulns} potential vulnerabilities\n[WARNING] Recommend immediate action`;
  }},
  whoami: { description: 'Display current user', execute: () => 'operator_07 | Clearance: ALPHA | Access: FULL' },
  date: { description: 'Show current date/time', execute: () => new Date().toISOString() },
  matrix: { description: 'Enter the matrix', execute: () => 'Wake up, Neo...' },
  clear: { description: 'Clear terminal', execute: () => 'CLEAR' },
  exit: { description: 'Close terminal', execute: () => 'Goodbye, Operator.' },
  hack: { description: 'Initiate hack sequence', execute: () => `[!] WARNING: Unauthorized access detected\n[!] Countermeasures activated\n[!] Trace initiated... IP LOCATED` },
};

export default function Terminal() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<HistoryEntry[]>([
    { type: 'output', content: 'NEXUS TERMINAL v3.7.1 - CYBERDYNE SYSTEMS', timestamp: new Date() },
    { type: 'output', content: t('typeHelp'), timestamp: new Date() },
    { type: 'output', content: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  const handleCommand = (cmd: string) => {
    const trimmedCmd = cmd.trim().toLowerCase();
    if (!trimmedCmd) return;

    setHistory(prev => [...prev, { type: 'input', content: `> ${trimmedCmd}`, timestamp: new Date() }]);
    setCommandHistory(prev => [...prev, trimmedCmd]);
    setHistoryIndex(-1);

    if (trimmedCmd === 'clear') {
      setHistory([]);
      return;
    }

    const command = commands[trimmedCmd];
    if (command) {
      const output = command.execute();
      if (output === 'CLEAR') {
        setHistory([]);
      } else {
        const lines = output.split('\n');
        lines.forEach(line => {
          const type: HistoryEntry['type'] = line.startsWith('[!]') ? 'error' : line.startsWith('[SYSTEM]') || line.startsWith('[SCAN]') || line.startsWith('[FOUND]') || line.startsWith('[WARNING]') ? 'success' : 'output';
          setHistory(prev => [...prev, { type, content: line, timestamp: new Date() }]);
        });
      }
    } else {
      setHistory(prev => [...prev, { type: 'error', content: `Command not found: ${trimmedCmd}. Type "help" for available commands.`, timestamp: new Date() }]);
    }
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-orbitron font-bold text-cyber-green cyber-text-glow">{t('terminal_title')}</h1>
        <p className="text-cyber-text-dim mt-1">{t('terminal_desc')}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        ref={terminalRef}
        className="bg-cyber-darker border border-cyber-green/30 rounded-xl overflow-hidden h-[500px] overflow-y-auto"
        onClick={() => inputRef.current?.focus()}>
        <div className="flex items-center gap-2 px-4 py-2 bg-cyber-dark/80 border-b border-cyber-green/20">
          <div className="w-3 h-3 rounded-full bg-cyber-red" />
          <div className="w-3 h-3 rounded-full bg-cyber-yellow" />
          <div className="w-3 h-3 rounded-full bg-cyber-green" />
          <span className="ml-2 text-xs text-cyber-text-dim font-mono">{t('operator')}@nexus:~</span>
        </div>
        <div className="p-4 font-mono text-sm space-y-1">
          {history.map((entry, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${
              entry.type === 'input' ? 'text-cyber-green' :
              entry.type === 'error' ? 'text-cyber-red' :
              entry.type === 'success' ? 'text-cyber-yellow' : 'text-cyber-text'
            }`}>
              {entry.content}
            </motion.div>
          ))}
          <div className="flex items-center">
            <span className="text-cyber-green mr-2">&gt;</span>
            <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent outline-none text-cyber-text caret-cyber-green" autoFocus />
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Cpu, label: t('cpu'), value: '47%', color: 'cyber-blue' },
          { icon: HardDrive, label: t('ram'), value: '12.4 GB', color: 'cyber-purple' },
          { icon: Wifi, label: t('networkConn'), value: '1.2 Gbps', color: 'cyber-green' },
          { icon: Shield, label: t('firewall'), value: t('activeStatus'), color: 'cyber-yellow' },
        ].map((sys, i) => (
          <motion.div key={sys.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-4 flex items-center gap-3">
            <sys.icon className={`w-8 h-8 text-${sys.color}`} />
            <div>
              <div className="text-xs text-cyber-text-dim">{sys.label}</div>
              <div className={`text-lg font-bold text-${sys.color}`}>{sys.value}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
