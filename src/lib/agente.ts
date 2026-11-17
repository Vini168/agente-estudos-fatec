import type { Content, FunctionDeclaration } from "@google/genai";
import { contarPalavras, normalizarTexto, segmentarTexto } from "./chunking";
import { buscarTrechos, gerarQuiz, resumirDocumento, type Fonte, type QuestaoQuiz } from "./ferramentas";
import { chamarModelo, gerarEmbeddings } from "./gemini";
import { supabase } from "./supabase";

const MIN_PALAVRAS = 20;

/** Ingestão: normaliza, segmenta, gera embeddings e grava documento + trechos do usuário. */
export async function adicionarDocumento(usuarioId: string, titulo: string, disciplina: string | null, texto: string) {
  const conteudo = normalizarTexto(texto);
  const trechos = segmentarTexto(conteudo);
  // texto curto demais vira um vetor "genérico" que aparece em qualquer busca e polui as fontes
  if (contarPalavras(conteudo) < MIN_PALAVRAS)
    throw new Error(`O material precisa ter pelo menos ${MIN_PALAVRAS} palavras`);

  const embeddings = await gerarEmbeddings(trechos, "RETRIEVAL_DOCUMENT");

  const { data: doc, error } = await supabase()
    .from("documentos")
    .insert({ usuario_id: usuarioId, titulo, disciplina, conteudo })
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

// ---------------------------------------------------------------- agente

const INSTRUCAO_AGENTE = `Você é o Agente de Estudos da Fatec, um tutor que ajuda alunos a estudar o próprio material de aula.
Você tem ferramentas e decide qual usar:
- buscar_material: para QUALQUER pergunta sobre conteúdo. Sempre busque antes de responder; nunca responda de memória.
- resumir_material: quando o aluno pedir resumo de um material.
- gerar_quiz: quando o aluno pedir questões, exercícios, quiz ou simulado.
Regras:
- Responda em português do Brasil, de forma didática e objetiva.
- Use SOMENTE as informações devolvidas pelas ferramentas. Cite os trechos usados como [1], [2] logo após a frase.
- Se a busca não encontrar nada, ou só trechos que não tratam do assunto, diga claramente que o material enviado não cobre o assunto e sugira adicionar conteúdo. Nesse caso não cite nenhuma fonte.
- Chame gerar_quiz no máximo UMA vez por pedido. Não repita as questões no texto: elas aparecem na tela. Só apresente o quiz em uma frase.
- Nunca mostre ids de materiais ao aluno; refira-se aos materiais pelo título.
- Conversa fora de estudos (piadas, assuntos pessoais): responda brevemente e volte ao material.`;

const FERRAMENTAS: FunctionDeclaration[] = [
  {
    name: "buscar_material",
    description: "Busca semântica nos materiais do aluno. Devolve os trechos mais relevantes, numerados.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "o que procurar, reescrito como uma pergunta ou frase completa" },
      },
      required: ["consulta"],
    },
  },
  {
    name: "resumir_material",
    description: "Resume um material inteiro do aluno. Use o id do material selecionado ou um id da lista de materiais.",
    parametersJsonSchema: {
      type: "object",
      properties: { documento_id: { type: "string" } },
      required: ["documento_id"],
    },
  },
  {
    name: "gerar_quiz",
    description: "Gera questões de múltipla escolha para revisão, sobre um tema ou sobre um material inteiro.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tema: { type: "string", description: "assunto das questões (opcional se houver documento_id)" },
        documento_id: { type: "string" },
        quantidade: { type: "integer", minimum: 1, maximum: 10 },
      },
    },
  },
];

export type MensagemHistorico = { autor: "aluno" | "agente"; texto: string };
export type RespostaAgente = {
  resposta: string;
  fontes: Fonte[];
  quiz: QuestaoQuiz[] | null;
  ferramentas: string[]; // quais ferramentas o agente decidiu usar (mostrado na tela)
};

const MAX_PASSOS = 4;

export async function executarAgente(
  usuarioId: string,
  mensagem: string,
  historico: MensagemHistorico[],
  documentoSelecionado: string | null,
): Promise<RespostaAgente> {
  const { data: docs } = await supabase()
    .from("documentos")
    .select("id, titulo")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(30);
  const listaDocs = (docs ?? []).map((d) => `- ${d.titulo} (id: ${d.id})`).join("\n") || "(nenhum material)";
  const contexto =
    `Materiais do aluno:\n${listaDocs}\n` +
    (documentoSelecionado ? `Material selecionado na tela: ${documentoSelecionado}\n` : "Nenhum material selecionado.\n");

  const contents: Content[] = [
    ...historico.slice(-8).map((m) => ({
      role: m.autor === "aluno" ? "user" : "model",
      parts: [{ text: m.texto }],
    })),
    { role: "user", parts: [{ text: mensagem }] },
  ];

  const fontes: Fonte[] = [];
  const usadas: string[] = [];
  let quiz: QuestaoQuiz[] | null = null;
  let modelo: string | undefined;

  for (let passo = 0; passo < MAX_PASSOS; passo++) {
    const chamada = await chamarModelo(
      {
        contents,
        config: {
          systemInstruction: `${INSTRUCAO_AGENTE}\n\n${contexto}`,
          temperature: 0.2,
          tools: [{ functionDeclarations: FERRAMENTAS }],
        },
      },
      modelo,
    );
    modelo = chamada.modelo; // mantém o mesmo modelo até o fim (assinaturas de raciocínio)
    const resposta = chamada.resposta;
    const chamadas = resposta.functionCalls ?? [];

    if (chamadas.length === 0) {
      const texto = resposta.text ?? "";
      // mostra só as fontes que a resposta realmente cita ([1], [2]…)
      const citadas = new Set([...texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      return { resposta: texto, fontes: fontes.filter((f) => citadas.has(f.numero)), quiz, ferramentas: usadas };
    }

    // devolve ao modelo o conteúdo exatamente como veio (inclui as assinaturas de raciocínio)
    const conteudoModelo = resposta.candidates?.[0]?.content;
    if (conteudoModelo) contents.push(conteudoModelo);

    const respostasFerramentas = [];
    for (const c of chamadas) {
      const args = (c.args ?? {}) as Record<string, unknown>;
      usadas.push(c.name ?? "?");
      let saida: Record<string, unknown>;
      try {
        if (c.name === "buscar_material") {
          const trechos = await buscarTrechos(usuarioId, String(args.consulta ?? mensagem), documentoSelecionado);
          const novos = trechos.map((t) => ({
            numero: fontes.length + 1 + trechos.indexOf(t),
            titulo: t.titulo,
            trecho: t.conteudo,
            similaridade: Number(t.similaridade.toFixed(3)),
          }));
          fontes.push(...novos);
          saida = novos.length
            ? { trechos: novos.map((f) => ({ numero: f.numero, material: f.titulo, texto: f.trecho })) }
            : { trechos: [], aviso: "Nada relevante encontrado no material do aluno." };
        } else if (c.name === "resumir_material") {
          const id = String(args.documento_id ?? documentoSelecionado ?? "");
          saida = { resumo: await resumirDocumento(usuarioId, id) };
        } else if (c.name === "gerar_quiz" && quiz) {
          // o modelo às vezes pede um segundo quiz no mesmo pedido: cada chamada custa ~10 s
          saida = { questoes_geradas: quiz.length, observacao: "O quiz já foi gerado e está na tela." };
        } else if (c.name === "gerar_quiz") {
          quiz = await gerarQuiz(usuarioId, {
            tema: args.tema ? String(args.tema) : undefined,
            documentoId: args.documento_id ? String(args.documento_id) : documentoSelecionado,
            quantidade: Number(args.quantidade ?? 5),
          });
          saida = quiz.length
            ? { questoes_geradas: quiz.length, observacao: "As questões já aparecem na tela do aluno." }
            : { questoes_geradas: 0, aviso: "Não há material sobre esse tema para gerar questões." };
        } else {
          saida = { erro: "Ferramenta desconhecida" };
        }
      } catch (e) {
        saida = { erro: (e as Error).message };
      }
      respostasFerramentas.push({ functionResponse: { id: c.id, name: c.name, response: saida } });
    }
    contents.push({ role: "user", parts: respostasFerramentas });
  }

  return {
    resposta: "Não consegui concluir o pedido. Tente reformular a pergunta.",
    fontes,
    quiz,
    ferramentas: usadas,
  };
}
