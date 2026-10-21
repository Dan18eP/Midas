import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatParticleBackground } from '../components/copilot/ChatParticleBackground';
import { ChatConversation } from '../components/copilot/ChatConversation';
import { CopilotChatProvider } from '../components/copilot/CopilotChatContext';

describe('ChatParticleBackground — Aether Flow Ambient Canvas (Light Mode)', () => {
  beforeEach(() => {
    // Mock HTMLCanvasElement.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    // Mock getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 600,
      top: 0,
      left: 0,
      right: 400,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. Renderiza el contenedor con accesibilidad aria-hidden y role presentation', () => {
    render(<ChatParticleBackground />);
    const root = screen.getByTestId('chat-particle-background');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveAttribute('role', 'presentation');
    expect(root.className).toContain('pointer-events-none');
    expect(root.className).toContain('absolute');
  });

  it('2. El canvas interno está configurado sin bloquear eventos del usuario', () => {
    render(<ChatParticleBackground />);
    const root = screen.getByTestId('chat-particle-background');
    const canvas = root.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveClass('pointer-events-none');
  });

  it('3. Limpia cancelAnimationFrame y desconecta listeners al desmontarse', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = render(<ChatParticleBackground />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('4. Respeta prefers-reduced-motion y no programa bucles infinitos de animación', () => {
    const requestSpy = vi.spyOn(window, 'requestAnimationFrame');
    // Mock matchMedia returning prefers-reduced-motion: true
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<ChatParticleBackground />);
    // Con movimiento reducido, no se debe llamar a requestAnimationFrame en bucle
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('5. ChatConversation integra ChatParticleBackground en el fondo sin alterar el contenido interactivo', () => {
    render(
      <CopilotChatProvider>
        <ChatConversation />
      </CopilotChatProvider>
    );

    expect(screen.getByTestId('chat-conversation')).toBeInTheDocument();
    expect(screen.getByTestId('chat-particle-background')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-composer')).toBeInTheDocument();
  });
});
