import React, { memo } from 'react';
import { Wifi, WifiOff, RefreshCw, Radio } from 'lucide-react';
import { ConnectionStatus } from '@/types/telemetry';

interface TelemetryConnectionBannerProps {
  status: ConnectionStatus;
  lastEventTime?: string | null;
  reconnectAttempts?: number;
  onManualReconnect?: () => void;
  className?: string;
}

export const TelemetryConnectionBanner = memo(({
  status,
  lastEventTime,
  reconnectAttempts = 0,
  onManualReconnect,
  className = '',
}: TelemetryConnectionBannerProps) => {
  const getStatusDetails = () => {
    switch (status) {
      case 'CONNECTED':
        return {
          label: 'Telemetría SSE en Vivo',
          icon: Radio,
          badgeBg: 'bg-[#FFFFFF]',
          badgeBorder: 'border-[#E8E4DC]',
          textColor: 'text-[#4D7C0F]',
          dotColor: 'bg-[#4D7C0F]',
          pulse: true,
          subtext: lastEventTime ? `Último: ${new Date(lastEventTime).toLocaleTimeString()}` : 'Streaming activo',
        };
      case 'RECONNECTING':
        return {
          label: `Reconectando (Intento ${reconnectAttempts})...`,
          icon: RefreshCw,
          badgeBg: 'bg-[#FFF8F5]',
          badgeBorder: 'border-[#ECCFC5]',
          textColor: 'text-[#A8422B]',
          dotColor: 'bg-[#A8422B] animate-ping',
          pulse: false,
          subtext: 'Métricas en caché (posiblemente desactualizadas)',
        };
      case 'CONNECTING':
        return {
          label: 'Conectando con Hub...',
          icon: Wifi,
          badgeBg: 'bg-[#F7F7F5]',
          badgeBorder: 'border-[#F0EDE7]',
          textColor: 'text-[#787164]',
          dotColor: 'bg-[#787164] animate-pulse',
          pulse: false,
          subtext: 'Iniciando EventSource',
        };
      case 'DISCONNECTED':
      default:
        return {
          label: 'Telemetría Desconectada',
          icon: WifiOff,
          badgeBg: 'bg-[#FFF8F5]',
          badgeBorder: 'border-[#ECCFC5]',
          textColor: 'text-[#A8422B]',
          dotColor: 'bg-[#A8422B]',
          pulse: false,
          subtext: 'Flujo detenido · Datos estáticos preservados',
        };
    }
  };

  const config = getStatusDetails();
  const IconComponent = config.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Estado de telemetría: ${config.label}`}
      className={`flex items-center gap-2.5 rounded-lg border ${config.badgeBorder} ${config.badgeBg} px-3 py-1.5 shadow-xs backdrop-blur-md transition-all duration-300 ${className}`}
      data-testid="telemetry-connection-banner"
    >
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {config.pulse && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4D7C0F] opacity-75" />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotColor}`} />
        </span>
        <IconComponent
          className={`h-3.5 w-3.5 ${config.textColor} ${status === 'RECONNECTING' ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold leading-tight ${config.textColor}`}>
            {config.label}
          </span>
          {status === 'DISCONNECTED' && onManualReconnect && (
            <button
              onClick={onManualReconnect}
              className="rounded bg-rose-100 hover:bg-rose-200 border border-rose-300 px-1.5 py-0.5 text-[9px] font-mono text-rose-800 transition-colors"
              title="Reintentar conexión manual"
            >
              Reconectar
            </button>
          )}
        </div>
        <span className="text-[9px] font-mono text-[#787164] leading-tight">
          {config.subtext}
        </span>
      </div>
    </div>
  );
});

TelemetryConnectionBanner.displayName = 'TelemetryConnectionBanner';
