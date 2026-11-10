import { GoogleGenAI } from "@google/genai";

// Cliente do Gemini (Google AI Studio). Só roda no servidor: a chave nunca vai pro navegador.
export const MODELO = process.env.GEMINI_MODEL || "gemini-3.5-flash";
export const MODELO_EMBEDDING = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const DIMENSOES_EMBEDDING = 768; // precisa bater com vector(768) da migration

let cliente: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  cliente ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cliente;
}

type Tarefa = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Gera embeddings em lotes (a API aceita vários textos por chamada). */
export async function gerarEmbeddings(textos: string[], tarefa: Tarefa): Promise<number[][]> {
  const LOTE = 50;
  const vetores: number[][] = [];
  for (let i = 0; i < textos.length; i += LOTE) {
    const resposta = await gemini().models.embedContent({
      model: MODELO_EMBEDDING,
      contents: textos.slice(i, i + LOTE),
      config: { taskType: tarefa, outputDimensionality: DIMENSOES_EMBEDDING },
    });
    for (const e of resposta.embeddings ?? []) {
      if (!e.values) throw new Error("Embedding vazio retornado pelo Gemini");
      vetores.push(normalizarVetor(e.values));
    }
  }
  return vetores;
}

// Com dimensão reduzida (768) o gemini-embedding-001 não devolve o vetor normalizado;
// normalizar deixa a similaridade de cosseno consistente.
function normalizarVetor(v: number[]): number[] {
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norma);
}

// Se o modelo principal estiver sobrecarregado (503) ou no limite (429), tenta o próximo da lista.
const MODELOS_RESERVA = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

function sobrecarregado(erro: unknown): boolean {
  return /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(String((erro as Error)?.message ?? erro));
}

export async function gerarTexto(instrucaoSistema: string, prompt: string): Promise<string> {
  const modelos = [MODELO, ...MODELOS_RESERVA.filter((m) => m !== MODELO)];
  let ultimoErro: unknown;
  for (const modelo of modelos) {
    try {
      const resposta = await gemini().models.generateContent({
        model: modelo,
        contents: prompt,
        config: { systemInstruction: instrucaoSistema, temperature: 0.2 },
      });
      return resposta.text ?? "";
    } catch (erro) {
      if (!sobrecarregado(erro)) throw erro;
      ultimoErro = erro;
    }
  }
  throw ultimoErro;
}
