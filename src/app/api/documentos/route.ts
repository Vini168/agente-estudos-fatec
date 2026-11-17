import { NextResponse } from "next/server";
import { adicionarDocumento } from "@/lib/agente";
import { exigirUsuario } from "@/lib/auth";
import { extrairTextoDoArquivo } from "@/lib/arquivos";
import { respostaDeErro } from "@/lib/http";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const LIMITE_CARACTERES = 300_000;

export async function GET() {
  try {
    const usuario = await exigirUsuario();
    const { data, error } = await supabase()
      .from("documentos")
      .select("id, titulo, disciplina, criado_em")
      .eq("usuario_id", usuario.id)
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return respostaDeErro(e);
  }
}

/** Aceita multipart (campo "arquivo": PDF, TXT ou MD) ou o texto colado no campo "texto". */
export async function POST(req: Request) {
  try {
    const usuario = await exigirUsuario();
    const form = await req.formData();
    const titulo = String(form.get("titulo") ?? "").trim();
    const disciplina = String(form.get("disciplina") ?? "").trim() || null;
    const arquivo = form.get("arquivo");
    let texto = String(form.get("texto") ?? "");

    if (arquivo instanceof File && arquivo.size > 0) texto = await extrairTextoDoArquivo(arquivo);

    if (!titulo || !texto.trim())
      return NextResponse.json({ erro: "Informe o título e o texto ou um arquivo" }, { status: 400 });
    if (texto.length > LIMITE_CARACTERES)
      return NextResponse.json({ erro: `Texto acima de ${LIMITE_CARACTERES} caracteres` }, { status: 413 });

    const resultado = await adicionarDocumento(usuario.id, titulo, disciplina, texto);
    return NextResponse.json({ ...resultado, caracteres: texto.length }, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const usuario = await exigirUsuario();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ erro: "Informe o id" }, { status: 400 });
    const { error } = await supabase().from("documentos").delete().eq("id", id).eq("usuario_id", usuario.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
