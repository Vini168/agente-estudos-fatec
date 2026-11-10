import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agente de Estudos Fatec",
  description: "Tutor com IA que responde dúvidas a partir do seu material de aula",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
