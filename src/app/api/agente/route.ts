import { NextResponse } from "next/server";
import { executarAgente, type MensagemHistorico } from "@/lib/agente";
import { exigirUsuario } from "@/lib/auth";
import { respostaDeErro } from "@/lib/http";

export const maxDuration = 60; // resumo e quiz de materiais grandes podem demorar

export async function POST(req: Request) {
  try {
    const usuario = await exigirUsuario();
    const { mensagem, historico, documentoId } = await req.json();
    if (typeof mensagem !== "string" || !mensagem.trim())
      return NextResponse.json({ erro: "Escreva uma mensagem" }, { status: 400 });
    if (mensagem.length > 2000)
      return NextResponse.json({ erro: "Mensagem muito longa (máx. 2000 caracteres)" }, { status: 400 });

    const hist: MensagemHistorico[] = Array.isArray(historico)
      ? historico
          .filter((m) => (m?.autor === "aluno" || m?.autor === "agente") && typeof m?.texto === "string")
          .map((m) => ({ autor: m.autor, texto: String(m.texto).slice(0, 4000) }))
      : [];
    return NextResponse.json(await executarAgente(usuario.id, mensagem.trim(), hist, documentoId || null));
  } catch (e) {
    return respostaDeErro(e);
  }
}
