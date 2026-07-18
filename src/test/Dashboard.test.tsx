import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '@/components/dashboard/Dashboard';
import { useNexusStore } from '@/stores/nexus-store';

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = useNexusStore.getState();
    store.resetSimulation();
    store.pauseSimulation();
    store.setLanguage('en');
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
    expect(store.simulation.world).toBeDefined();
  });

  it('advances only through simulation steps while paused', () => {
    const store = useNexusStore.getState();
    store.resetSimulation();
    store.pauseSimulation();
    const initialTick = useNexusStore.getState().simulation.world.tick;

    store.advanceSimulation();
    expect(useNexusStore.getState().simulation.world.tick).toBe(initialTick);

    store.stepSimulationOnce();
    expect(useNexusStore.getState().simulation.world.tick).toBe(initialTick + 1);
    expect(useNexusStore.getState().cityStatsHistory).toHaveLength(1);
  });

  it('should change language', () => {
    const store = useNexusStore.getState();

    expect(store.language).toBe('en');

    store.setLanguage('zh');

    expect(useNexusStore.getState().language).toBe('zh');
  });

  it('verifies replay for the current deterministic run', () => {
    const store = useNexusStore.getState();
    store.resetSimulation();
    store.pauseSimulation();
    store.stepSimulationOnce();
    store.stepSimulationOnce();
    store.verifySimulationReplay();

    expect(useNexusStore.getState().simulation.replay.status).toBe('verified');
  });
});
