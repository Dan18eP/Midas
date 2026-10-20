'use client';

import React, { useState } from 'react';
import { PipelineCanvas } from '@/components/canvas/PipelineCanvas';
import { CopilotChatDrawer, CopilotChatPanel, CopilotChatProvider, CopilotChatWidget } from '@/components/copilot';
import { ZeroTrustLens, type ZeroTrustRole } from '@/components/security/ZeroTrustLens';

export default function MidasConsolePage() {
  const [selectedRole, setSelectedRole] = useState<ZeroTrustRole>('admin');

  return (
    <CopilotChatProvider>
      <div className="flex h-screen w-screen flex-col bg-[#0B0F17]">
        <header className="flex h-14 w-full items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/20">
              <span className="text-sm font-black text-slate-950">M</span>
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-100">
                MIDAS
                <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-amber-400">
                  ACTIVE LAKEHOUSE
                </span>
              </h1>
              <p className="text-[10px] text-slate-400">Enterprise Observability & Real-Time Dataflow Canvas</p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Time-Travel Replay:</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-emerald-500/40 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
                ● LIVE
              </span>
              <span className="text-xs text-slate-600">|</span>
              <span className="cursor-not-allowed text-[10px] text-slate-500" title="Preparado para HU-FRONT-03">T0 Normal</span>
              <span className="cursor-not-allowed text-[10px] text-slate-500" title="Preparado para HU-FRONT-03">T1 Incidente</span>
              <span className="cursor-not-allowed text-[10px] text-slate-500" title="Preparado para HU-FRONT-03">T2 Guardian</span>
              <span className="cursor-not-allowed text-[10px] text-slate-500" title="Preparado para HU-FRONT-03">T3 Publicado</span>
            </div>
          </div>

          <ZeroTrustLens role={selectedRole} onRoleChange={setSelectedRole} />
        </header>

        <main className="flex flex-1 overflow-hidden">
          <section aria-label="Topología del Pipeline Lakehouse" className="relative h-full w-full border-r border-slate-800/80">
            <PipelineCanvas securityRole={selectedRole} />
            <div className="absolute bottom-4 left-4 z-20">
              <ZeroTrustLens role={selectedRole} preview />
            </div>
          </section>
        </main>

        <CopilotChatWidget />
        <CopilotChatDrawer />
      </div>
    </CopilotChatProvider>
  );
}
