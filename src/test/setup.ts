import '@testing-library/jest-dom';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => children,
    button: ({ children }: { children: React.ReactNode }) => children,
    aside: ({ children }: { children: React.ReactNode }) => children,
    header: ({ children }: { children: React.ReactNode }) => children,
    main: ({ children }: { children: React.ReactNode }) => children,
    nav: ({ children }: { children: React.ReactNode }) => children,
    h1: ({ children }: { children: React.ReactNode }) => children,
    h2: ({ children }: { children: React.ReactNode }) => children,
    h3: ({ children }: { children: React.ReactNode }) => children,
    p: ({ children }: { children: React.ReactNode }) => children,
    span: ({ children }: { children: React.ReactNode }) => children,
  },
  useAnimation: () => ({
    start: vi.fn(),
  }),
  useMotionValue: () => ({ get: () => 0 }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
}));

// Global timeout for async tests
vi.setConfig({ testTimeout: 10000 });