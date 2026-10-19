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
    <html lang="es" className="light">
      <body className="h-screen w-screen bg-[#FBF9F5] text-[#1C1E21] antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
