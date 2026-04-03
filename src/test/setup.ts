import '@testing-library/jest-dom';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => children,
    button: ({ children, ...props }: any) => children,
    aside: ({ children, ...props }: any) => children,
    header: ({ children, ...props }: any) => children,
    main: ({ children, ...props }: any) => children,
    nav: ({ children, ...props }: any) => children,
    h1: ({ children, ...props }: any) => children,
    h2: ({ children, ...props }: any) => children,
    h3: ({ children, ...props }: any) => children,
    p: ({ children, ...props }: any) => children,
    span: ({ children, ...props }: any) => children,
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
