import { segmentarTexto, normalizarTexto } from "./chunking";
import { gerarEmbeddings, gerarTexto } from "./gemini";
import { supabase } from "./supabase";

export type Fonte = { numero: number; titulo: string; trecho: string; similaridade: number };

const SIMILARIDADE_MINIMA = 0.55; // abaixo disso consideramos que o material não fala do assunto

const INSTRUCAO_TUTOR = [
  "Você é o Agente de Estudos da Fatec, um tutor que ajuda alunos a estudar.",
  "Regras:",
  "- Responda em português do Brasil, de forma didática e objetiva.",
  "- Use SOMENTE as informações dos trechos de material fornecidos.",
  "- Cite as fontes usadas no formato [1], [2] logo após a frase correspondente.",
  "- Se os trechos não trazem a resposta, diga claramente que o material enviado não cobre o assunto.",
].join("\n");

/** Ingestão: normaliza, segmenta, gera embeddings e grava documento + trechos. */
export async function adicionarDocumento(titulo: string, disciplina: string | null, texto: string) {
  const conteudo = normalizarTexto(texto);
  const trechos = segmentarTexto(conteudo);
  if (trechos.length === 0) throw new Error("O texto enviado está vazio");

  const embeddings = await gerarEmbeddings(trechos, "RETRIEVAL_DOCUMENT");

  const { data: doc, error } = await supabase()
    .from("documentos")
    .insert({ titulo, disciplina, conteudo })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const linhas = trechos.map((t, i) => ({
    documento_id: doc.id,
    ordem: i,
    conteudo: t,
    embedding: JSON.stringify(embeddings[i]),
  }));
  const { error: erroTrechos } = await supabase().from("trechos").insert(linhas);
  if (erroTrechos) {
    await supabase().from("documentos").delete().eq("id", doc.id);
    throw new Error(erroTrechos.message);
  }
  return { id: doc.id as string, trechos: trechos.length };
}

type TrechoEncontrado = { titulo: string; conteudo: string; similaridade: number };

/** Pergunta → busca semântica (RAG) → resposta do Gemini com citações. */
export async function perguntar(pergunta: string, documentoId: string | null) {
  const [vetor] = await gerarEmbeddings([pergunta], "RETRIEVAL_QUERY");
  const { data, error } = await supabase().rpc("buscar_trechos", {
    consulta: JSON.stringify(vetor),
    quantidade: 5,
    filtro_documento: documentoId,
  });
  if (error) throw new Error(error.message);

  const relevantes = (data as TrechoEncontrado[]).filter((t) => t.similaridade >= SIMILARIDADE_MINIMA);

  if (relevantes.length === 0) {
    return {
      resposta:
        "Não encontrei esse assunto no material que você enviou. Tente reformular a pergunta ou adicionar o conteúdo.",
      fontes: [] as Fonte[],
    };
  }

  const fontes: Fonte[] = relevantes.map((t, i) => ({
    numero: i + 1,
    titulo: t.titulo,
    trecho: t.conteudo,
    similaridade: Number(t.similaridade.toFixed(3)),
  }));
  const contexto = fontes.map((f) => `[${f.numero}] (${f.titulo})\n${f.trecho}`).join("\n\n");
  const resposta = await gerarTexto(
    INSTRUCAO_TUTOR,
    `Trechos do material:\n${contexto}\n\nPergunta do aluno: ${pergunta}`,
  );
  return { resposta, fontes };
}
