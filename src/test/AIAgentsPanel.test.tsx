import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import AIAgentsPanel from '@/components/agents/AIAgentsPanel';
import { useNexusStore } from '@/stores/nexus-store';

describe('AIAgentsPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNexusStore.setState({
      agentLogs: [],
      aiAgents: useNexusStore.getInitialState().aiAgents,
    });
  });

  it('renders 4 agent cards', () => {
    render(<AIAgentsPanel />);
    expect(screen.getByText('ATLAS')).toBeInTheDocument();
    expect(screen.getByText('ECONOMICA')).toBeInTheDocument();
    expect(screen.getByText('CIVITAS')).toBeInTheDocument();
    expect(screen.getByText('SPECTRE')).toBeInTheDocument();
  });

  it('opens agent modal on card click', () => {
    render(<AIAgentsPanel />);
    fireEvent.click(screen.getByText('ATLAS'));
    expect(screen.getByRole('dialog', { name: /ATLAS/i })).toBeInTheDocument();
  });

  it('keeps the modal stable while unrelated store state updates', () => {
    render(<AIAgentsPanel />);
    fireEvent.click(screen.getByText('ATLAS'));

    act(() => {
      useNexusStore.setState((state) => ({
        cityStats: { ...state.cityStats, traffic: 81 },
        agentLogs: [
          ...state.agentLogs,
          {
            id: 'regression-log',
            timestamp: 0,
            type: 'info',
            message: 'ATLAS regression log',
            agentId: 'atlas',
          },
        ],
      }));
    });

    expect(screen.getByRole('dialog', { name: /ATLAS/i })).toBeInTheDocument();
    expect(screen.getByText('ATLAS regression log')).toBeInTheDocument();
  });

  it('displays agent status badges', () => {
    render(<AIAgentsPanel />);
    const activeBadges = screen.getAllByText(/active/i);
    expect(activeBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows efficiency values', () => {
    render(<AIAgentsPanel />);
    const efficiencyElements = screen.getAllByText(/EFFICIENCY/i);
    expect(efficiencyElements.length).toBeGreaterThanOrEqual(1);
  });
});
