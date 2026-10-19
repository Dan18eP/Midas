import { createContext, useContext, ReactNode } from 'react';
import { CopilotChatController, useCopilotChat } from './useCopilotChat';

const CopilotChatContext = createContext<CopilotChatController | null>(null);

export function CopilotChatProvider({ children }: { children: ReactNode }) {
  const controller = useCopilotChat();
  return <CopilotChatContext.Provider value={controller}>{children}</CopilotChatContext.Provider>;
}

export function useCopilotChatContext(): CopilotChatController {
  const controller = useContext(CopilotChatContext);
  if (!controller) {
    throw new Error('useCopilotChatContext debe usarse dentro de <CopilotChatProvider>.');
  }
  return controller;
}
