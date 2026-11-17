import { NextResponse } from "next/server";
import { entrar, sair, usuarioAtual } from "@/lib/auth";
import { respostaDeErro } from "@/lib/http";

export async function GET() {
  try {
    return NextResponse.json({ usuario: await usuarioAtual() });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function POST(req: Request) {
  try {
    const { email, senha } = await req.json();
    if (typeof email !== "string" || typeof senha !== "string" || !email || !senha)
      return NextResponse.json({ erro: "Informe e-mail e senha" }, { status: 400 });
    return NextResponse.json({ usuario: await entrar(email.trim(), senha) });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 401 });
  }
}

export async function DELETE() {
  await sair();
  return NextResponse.json({ ok: true });
}
