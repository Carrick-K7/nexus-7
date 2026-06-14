import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AIAgentsPanel from '@/components/agents/AIAgentsPanel';
import { useNexusStore } from '@/stores/nexus-store';

describe('AIAgentsPanel Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByText(/Security Chief/i)).toBeInTheDocument();
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
