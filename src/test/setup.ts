import '@testing-library/jest-dom';
import React from 'react';

const MOTION_ONLY_PROPS = new Set([
  'animate',
  'exit',
  'initial',
  'layoutId',
  'transition',
  'whileHover',
  'whileTap',
]);

const mockMotionElement = (tag: keyof React.JSX.IntrinsicElements) =>
  function MockMotionElement({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) {
    const domProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !MOTION_ONLY_PROPS.has(key)),
    );

    return React.createElement(tag, domProps, children);
  };

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: mockMotionElement('div'),
    button: mockMotionElement('button'),
    aside: mockMotionElement('aside'),
    header: mockMotionElement('header'),
    main: mockMotionElement('main'),
    nav: mockMotionElement('nav'),
    section: mockMotionElement('section'),
    h1: mockMotionElement('h1'),
    h2: mockMotionElement('h2'),
    h3: mockMotionElement('h3'),
    p: mockMotionElement('p'),
    span: mockMotionElement('span'),
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
