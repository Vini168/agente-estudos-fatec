// Pré-processamento e segmentação (chunking) do material de estudo.
// É a etapa de PLN "clássico" do agente: normaliza o texto, separa em sentenças
// e agrupa as sentenças em trechos com sobreposição, que depois viram embeddings.

export type OpcoesSegmentacao = {
  /** tamanho máximo de cada trecho, em palavras */
  maxPalavras?: number;
  /** quantas sentenças do fim de um trecho se repetem no início do próximo */
  sentencasSobrepostas?: number;
};

// Abreviações comuns em português que terminam com ponto e não encerram a frase
const ABREVIACOES = [
  "sr", "sra", "srs", "dr", "dra", "prof", "profa", "etc", "ex", "obs", "pág", "pag",
  "p", "pp", "fig", "cap", "art", "vol", "nº", "n", "av", "tel", "aprox", "min", "máx",
];

/** Limpa o texto vindo de PDF/cópia: hifenização no fim da linha, espaços e quebras. */
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2") // "proces-\nsamento" -> "processamento"
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function contarPalavras(texto: string): number {
  const palavras = texto.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu);
  return palavras ? palavras.length : 0;
}

/** Divide o texto em sentenças, respeitando abreviações e parágrafos. */
export function dividirSentencas(texto: string): string[] {
  const sentencas: string[] = [];
  for (const paragrafo of normalizarTexto(texto).split(/\n\s*\n/)) {
    const linha = paragrafo.replace(/\n/g, " ").trim();
    if (!linha) continue;

    let inicio = 0;
    const fim = /[.!?…]+["”')\]]*(?=\s+|$)/g;
    let m: RegExpExecArray | null;
    while ((m = fim.exec(linha)) !== null) {
      const corte = m.index + m[0].length;
      const ultimaPalavra = linha.slice(inicio, m.index).split(/\s+/).pop() ?? "";
      const ehAbreviacao =
        m[0] === "." && ABREVIACOES.includes(ultimaPalavra.toLowerCase());
      const ehNumeroDecimal = m[0] === "." && /\d$/.test(ultimaPalavra) && /^\d/.test(linha.slice(corte).trim());
      if (ehAbreviacao || ehNumeroDecimal) continue;

      const sentenca = linha.slice(inicio, corte).trim();
      if (sentenca) sentencas.push(sentenca);
      inicio = corte;
    }
    const resto = linha.slice(inicio).trim();
    if (resto) sentencas.push(resto);
  }
  return sentencas;
}

/** Agrupa sentenças em trechos de até `maxPalavras`, repetindo as últimas sentenças no próximo trecho. */
export function segmentarTexto(texto: string, opcoes: OpcoesSegmentacao = {}): string[] {
  const maxPalavras = opcoes.maxPalavras ?? 180;
  const sobrepostas = opcoes.sentencasSobrepostas ?? 1;
  const sentencas = dividirSentencas(texto);

  const trechos: string[] = [];
  let atual: string[] = [];
  let palavrasAtual = 0;

  for (const sentenca of sentencas) {
    const palavras = contarPalavras(sentenca);
    if (atual.length > 0 && palavrasAtual + palavras > maxPalavras) {
      trechos.push(atual.join(" "));
      atual = sobrepostas > 0 ? atual.slice(-sobrepostas) : [];
      palavrasAtual = atual.reduce((soma, s) => soma + contarPalavras(s), 0);
      // se a sobreposição sozinha já estoura o limite, começa o trecho do zero
      if (palavrasAtual + palavras > maxPalavras) {
        atual = [];
        palavrasAtual = 0;
      }
    }
    atual.push(sentenca);
    palavrasAtual += palavras;
  }
  if (atual.length > 0) trechos.push(atual.join(" "));
  return trechos;
}
