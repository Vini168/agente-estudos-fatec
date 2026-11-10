import { NextResponse } from "next/server";
import { perguntar } from "@/lib/agente";

export async function POST(req: Request) {
  try {
    const { pergunta, documentoId } = await req.json();
    if (typeof pergunta !== "string" || !pergunta.trim())
      return NextResponse.json({ erro: "Escreva uma pergunta" }, { status: 400 });
    return NextResponse.json(await perguntar(pergunta.trim(), documentoId || null));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
