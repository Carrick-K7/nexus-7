import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '@/components/dashboard/Dashboard';
import { useNexusStore } from '@/stores/nexus-store';

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = useNexusStore.getState();
    store.updateCityStats({
      population: 8472934,
      energy: 78,
      traffic: 56,
      crime: 23,
      pollution: 34,
      medical: 85,
      internet: 94,
      water: 91,
    });
  });

  it('renders city overview heading', () => {
    render(<Dashboard />);
    expect(screen.getByText(/CITY OVERVIEW/i)).toBeInTheDocument();
  });

  it('renders population stat', () => {
    render(<Dashboard />);
    const popElement = screen.getByText(/8\.47M|8,472,934/);
    expect(popElement).toBeInTheDocument();
  });

  it('renders energy percentage', () => {
    render(<Dashboard />);
    const energyElements = screen.getAllByText(/78%/);
    expect(energyElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders district cards', () => {
    render(<Dashboard />);
    expect(screen.getByText('Neo Downtown')).toBeInTheDocument();
    expect(screen.getByText('Chrome Heights')).toBeInTheDocument();
  });
});

describe('useNexusStore', () => {
  it('should have required state properties', () => {
    const store = useNexusStore.getState();

    expect(store.theme).toBeDefined();
    expect(store.language).toBeDefined();
    expect(store.cityStats).toBeDefined();
    expect(store.districts).toBeDefined();
    expect(Array.isArray(store.districts)).toBe(true);
  });

  it('should update city stats', () => {
    const store = useNexusStore.getState();
    const initialEnergy = store.cityStats.energy;

    store.updateCityStats({ energy: initialEnergy + 10 });

    expect(useNexusStore.getState().cityStats.energy).toBe(initialEnergy + 10);
  });

  it('should change language', () => {
    const store = useNexusStore.getState();

    expect(store.language).toBe('en');

    store.setLanguage('zh');

    expect(useNexusStore.getState().language).toBe('zh');
  });

  it('should dispatch agent action and update cityStats', () => {
    const store = useNexusStore.getState();
    const initialCrime = store.cityStats.crime;

    store.dispatchAgentAction('atlas', { crime: Math.max(0, initialCrime - 2) });

    expect(useNexusStore.getState().cityStats.crime).toBeLessThanOrEqual(initialCrime);
  });

  it('should add agent logs', () => {
    const store = useNexusStore.getState();
    const initialLogCount = store.agentLogs.length;

    store.addAgentLog({ type: 'info', message: 'Test log', agentId: 'atlas' });

    expect(useNexusStore.getState().agentLogs.length).toBe(initialLogCount + 1);
  });
});
