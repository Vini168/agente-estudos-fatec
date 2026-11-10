import { NextResponse } from "next/server";
import { adicionarDocumento } from "@/lib/agente";
import { supabase } from "@/lib/supabase";

const LIMITE_CARACTERES = 200_000;

export async function GET() {
  try {
    const { data, error } = await supabase()
      .from("documentos")
      .select("id, titulo, disciplina, criado_em")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { titulo, disciplina, texto } = await req.json();
    if (typeof titulo !== "string" || !titulo.trim() || typeof texto !== "string" || !texto.trim())
      return NextResponse.json({ erro: "Informe título e texto" }, { status: 400 });
    if (texto.length > LIMITE_CARACTERES)
      return NextResponse.json({ erro: `Texto acima de ${LIMITE_CARACTERES} caracteres` }, { status: 413 });

    const resultado = await adicionarDocumento(titulo.trim(), disciplina?.trim() || null, texto);
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
