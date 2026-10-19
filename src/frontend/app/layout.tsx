import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Midas — Enterprise Active Lakehouse & Conversational Intelligence',
  description: 'Observabilidad del pipeline de datos en tiempo real, resiliencia activa y copiloto agéntico.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="h-screen w-screen bg-[#0B0F17] text-slate-100 antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
