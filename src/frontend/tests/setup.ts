import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  // Keep rendered components from leaking into the next test.
  cleanup();
});

// Mock ResizeObserver for React Flow in JSDOM environment
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock DOMMatrix / DOMRect if necessary for React Flow measurements
if (typeof window !== 'undefined') {
  window.DOMMatrixReadOnly = class DOMMatrixReadOnly {
    m11 = 1;
    m12 = 0;
    m21 = 0;
    m22 = 1;
    m41 = 0;
    m42 = 0;
  } as unknown as typeof DOMMatrixReadOnly;
}
