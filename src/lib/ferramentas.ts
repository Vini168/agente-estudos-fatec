// Ferramentas que o agente pode usar. Cada uma recebe o id do usuário logado,
// então o agente só enxerga o material daquele aluno.
import { contarPalavras } from "./chunking";
import { gerarEmbeddings, gerarJson, gerarTexto } from "./gemini";
import { supabase } from "./supabase";

export const SIMILARIDADE_MINIMA = 0.55; // calibrada com scripts/avaliar.ts

export type Fonte = { numero: number; titulo: string; trecho: string; similaridade: number };

type TrechoEncontrado = { documento_id: string; titulo: string; ordem: number; conteudo: string; similaridade: number };

/** Busca semântica (RAG): embedding da consulta → trechos mais parecidos do usuário. */
export async function buscarTrechos(
  usuarioId: string,
  consulta: string,
  documentoId: string | null,
  quantidade = 5,
): Promise<TrechoEncontrado[]> {
  const [vetor] = await gerarEmbeddings([consulta], "RETRIEVAL_QUERY");
  const { data, error } = await supabase().rpc("buscar_trechos", {
    consulta: JSON.stringify(vetor),
    filtro_usuario: usuarioId,
    quantidade,
    filtro_documento: documentoId,
  });
  if (error) throw new Error(error.message);
  return (data as TrechoEncontrado[]).filter((t) => t.similaridade >= SIMILARIDADE_MINIMA);
}

async function trechosDoDocumento(usuarioId: string, documentoId: string) {
  const { data: doc, error } = await supabase()
    .from("documentos")
    .select("id, titulo")
    .eq("id", documentoId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!doc) throw new Error("Documento não encontrado");

  const { data: trechos, error: erroTrechos } = await supabase()
    .from("trechos")
    .select("ordem, conteudo")
    .eq("documento_id", documentoId)
    .order("ordem");
  if (erroTrechos) throw new Error(erroTrechos.message);
  return { titulo: doc.titulo as string, trechos: trechos as { ordem: number; conteudo: string }[] };
}

const INSTRUCAO_RESUMO =
  "Você resume material de estudo em português do Brasil. Use só o texto fornecido. " +
  "Organize em tópicos curtos com os conceitos principais e as definições importantes.";

/**
 * Sumarização map-reduce: textos curtos são resumidos de uma vez; textos longos são
 * resumidos em blocos (map) e os resumos parciais viram um resumo final (reduce).
 */
export async function resumirDocumento(usuarioId: string, documentoId: string): Promise<string> {
  const { titulo, trechos } = await trechosDoDocumento(usuarioId, documentoId);
  const LIMITE_BLOCO = 2500; // palavras por chamada

  const blocos: string[] = [];
  let atual: string[] = [];
  let palavras = 0;
  for (const t of trechos) {
    const n = contarPalavras(t.conteudo);
    if (atual.length && palavras + n > LIMITE_BLOCO) {
      blocos.push(atual.join("\n"));
      atual = [];
      palavras = 0;
    }
    atual.push(t.conteudo);
    palavras += n;
  }
  if (atual.length) blocos.push(atual.join("\n"));

  if (blocos.length === 1) return gerarTexto(INSTRUCAO_RESUMO, `Material "${titulo}":\n${blocos[0]}`);

  const parciais = await Promise.all(
    blocos.map((b, i) => gerarTexto(INSTRUCAO_RESUMO, `Parte ${i + 1} do material "${titulo}":\n${b}`)),
  );
  return gerarTexto(
    INSTRUCAO_RESUMO + " Junte os resumos parciais abaixo em um único resumo, sem repetir conceitos.",
    parciais.map((p, i) => `Resumo da parte ${i + 1}:\n${p}`).join("\n\n"),
  );
}

export type QuestaoQuiz = { pergunta: string; alternativas: string[]; correta: number; explicacao: string };

const SCHEMA_QUIZ = {
  type: "object",
  properties: {
    questoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pergunta: { type: "string" },
          alternativas: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correta: { type: "integer", minimum: 0, maximum: 3, description: "índice da alternativa correta" },
          explicacao: { type: "string" },
        },
        required: ["pergunta", "alternativas", "correta", "explicacao"],
      },
    },
  },
  required: ["questoes"],
};

/** Gera questões de múltipla escolha a partir de um tema (busca) ou de um documento inteiro. */
export async function gerarQuiz(
  usuarioId: string,
  opcoes: { tema?: string; documentoId?: string | null; quantidade?: number },
): Promise<QuestaoQuiz[]> {
  const quantidade = Math.min(Math.max(opcoes.quantidade ?? 5, 1), 10);
  let base: string;
  if (opcoes.tema) {
    // só os trechos mais próximos do tema, para as questões não fugirem do assunto pedido
    const trechos = await buscarTrechos(usuarioId, opcoes.tema, opcoes.documentoId ?? null, 3);
    if (trechos.length === 0) return [];
    base = trechos.map((t) => t.conteudo).join("\n\n");
  } else if (opcoes.documentoId) {
    base = (await trechosDoDocumento(usuarioId, opcoes.documentoId)).trechos.map((t) => t.conteudo).join("\n\n");
  } else {
    return [];
  }

  const { questoes } = await gerarJson<{ questoes: QuestaoQuiz[] }>(
    "Você cria questões de revisão para alunos, em português do Brasil, baseadas SOMENTE no texto fornecido. " +
      "Cada questão tem 4 alternativas, só uma correta, e as erradas devem ser plausíveis.",
    (opcoes.tema
      ? `Crie ${quantidade} questões especificamente sobre "${opcoes.tema}". Ignore partes do texto que não tratam desse tema.`
      : `Crie ${quantidade} questões cobrindo os principais conceitos do texto.`) +
      `\n\nTexto:\n${base.slice(0, 30000)}`,
    SCHEMA_QUIZ,
  );
  return questoes
    .filter((q) => q.alternativas?.length === 4 && q.correta >= 0 && q.correta <= 3)
    .slice(0, quantidade);
}
