import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Chamado 1x por dia pelo cron da Vercel (vercel.json). A consulta mantém o projeto
// gratuito do Supabase ativo: sem acesso por 7 dias ele é pausado.
export async function GET() {
  const { error } = await supabase().from("documentos").select("id", { head: true, count: "exact" });
  if (error) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true, verificado_em: new Date().toISOString() });
}
