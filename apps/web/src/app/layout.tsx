import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource/newsreader/400.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Nexo Assist', template: '%s · Nexo Assist' },
  description: 'Service desk de TI da Nexo — seu problema de TI, resolvido em uma conversa.',
};

export const viewport: Viewport = { themeColor: '#1d2733' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
