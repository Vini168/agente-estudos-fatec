import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

// Cliente do Gemini (Google AI Studio). Só roda no servidor: a chave nunca vai pro navegador.
// Ordem de preferência. O flash-lite é o padrão: responde em ~10 s e tem cota gratuita maior.
// O gemini-3.5-flash é mais lento (~48 s por resumo) e o plano gratuito só dá 20 pedidos/dia.
const MODELOS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
export const MODELO_EMBEDDING = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const DIMENSOES_EMBEDDING = 768; // precisa bater com vector(768) da migration

let cliente: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");
  // O padrão do SDK é tentar 5 vezes com espera de até 60 s: com o modelo sobrecarregado uma pergunta
  // levava minutos. Aqui: 2 tentativas rápidas e, se falhar, chamarModelo() troca para o modelo reserva.
  cliente ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 25_000, retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 2 } },
  });
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
export function normalizarVetor(v: number[]): number[] {
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norma);
}

// Se o modelo estiver sobrecarregado (503/504), no limite de cota (429) ou demorar demais, tenta o próximo.
function sobrecarregado(erro: unknown): boolean {
  return /"code":\s*(429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|INTERNAL|timed? ?out|aborted/i.test(
    String((erro as Error)?.message ?? erro),
  );
}

/**
 * Chama o modelo com troca automática em caso de sobrecarga.
 * Devolve também qual modelo respondeu, para o agente continuar a conversa com o mesmo modelo.
 */
export async function chamarModelo(
  parametros: Omit<GenerateContentParameters, "model">,
  modeloFixo?: string,
): Promise<{ resposta: GenerateContentResponse; modelo: string }> {
  const modelos = modeloFixo ? [modeloFixo] : MODELOS;
  let ultimoErro: unknown;
  for (const modelo of modelos) {
    try {
      // Raciocínio curto: escolher ferramenta, resumir e montar quiz não precisam de raciocínio longo,
      // e o nível padrão deixava resumo e quiz acima do limite de 60 s da Vercel.
      const config = { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, ...parametros.config };
      const resposta = await gemini().models.generateContent({ ...parametros, config, model: modelo });
      return { resposta, modelo };
    } catch (erro) {
      if (!sobrecarregado(erro)) throw erro;
      ultimoErro = erro;
    }
  }
  throw ultimoErro;
}

export async function gerarTexto(instrucaoSistema: string, prompt: string): Promise<string> {
  const { resposta } = await chamarModelo({
    contents: prompt,
    config: { systemInstruction: instrucaoSistema, temperature: 0.2 },
  });
  return resposta.text ?? "";
}

/** Geração com saída em JSON validada por um JSON Schema. */
export async function gerarJson<T>(instrucaoSistema: string, prompt: string, schema: object): Promise<T> {
  const { resposta } = await chamarModelo({
    contents: prompt,
    config: {
      systemInstruction: instrucaoSistema,
      temperature: 0.4,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    },
  });
  return JSON.parse(resposta.text ?? "{}") as T;
}
