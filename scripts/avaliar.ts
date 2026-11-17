// Avaliação da recuperação (o "R" do RAG) e calibração do limiar de similaridade.
// Roda em memória (não grava nada no Supabase):
//   node --env-file=.env.local scripts/avaliar.ts
//
// Para cada tamanho de trecho, mede:
//  - acerto@1 e recall@5: o trecho com a resposta aparece em 1º lugar / entre os 5 primeiros
//  - MRR: média de 1/posição do trecho certo
// E testa limiares de similaridade para separar perguntas do material x fora do material.
import { readFileSync, writeFileSync } from "node:fs";
import { segmentarTexto } from "../src/lib/chunking.ts";
import { gerarEmbeddings } from "../src/lib/gemini.ts";

type Pergunta = { pergunta: string; esperado: string | null };

const raiz = new URL("../tests/fixtures/", import.meta.url);
const textos = ["aula-pre-processamento.txt", "aula-modelos-de-linguagem.txt"].map((f) =>
  readFileSync(new URL(f, raiz), "utf8"),
);
const { perguntas } = JSON.parse(readFileSync(new URL("perguntas-avaliacao.json", raiz), "utf8")) as {
  perguntas: Pergunta[];
};

const cosseno = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0); // vetores já normalizados
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const vetoresPerguntas = await gerarEmbeddings(perguntas.map((p) => p.pergunta), "RETRIEVAL_QUERY");
const dentro = perguntas.map((p, i) => ({ ...p, i })).filter((p) => p.esperado);
const fora = perguntas.map((p, i) => ({ ...p, i })).filter((p) => !p.esperado);

const relatorio: string[] = ["# Avaliação da recuperação", ""];
relatorio.push(`Perguntas: ${dentro.length} sobre o material e ${fora.length} fora do material.`, "");
relatorio.push("| Tamanho do trecho | Trechos | Acerto@1 | Recall@5 | MRR |", "|---|---|---|---|---|");

let melhoresSimilaridades: { dentro: number[]; fora: number[] } | null = null;

for (const maxPalavras of [60, 120, 180, 300]) {
  const trechos = textos.flatMap((t) => segmentarTexto(t, { maxPalavras, sentencasSobrepostas: 1 }));
  const vetoresTrechos = await gerarEmbeddings(trechos, "RETRIEVAL_DOCUMENT");

  let acerto1 = 0;
  let recall5 = 0;
  let somaRR = 0;
  const simDentro: number[] = [];
  const simFora: number[] = [];

  for (const p of perguntas.map((p, i) => ({ ...p, i }))) {
    const ranking = vetoresTrechos
      .map((v, j) => ({ j, sim: cosseno(vetoresPerguntas[p.i], v) }))
      .sort((a, b) => b.sim - a.sim);
    if (!p.esperado) {
      simFora.push(ranking[0].sim);
      continue;
    }
    simDentro.push(ranking[0].sim);
    const posicao = ranking.findIndex((r) => trechos[r.j].includes(p.esperado!));
    if (posicao === 0) acerto1++;
    if (posicao >= 0 && posicao < 5) recall5++;
    if (posicao >= 0) somaRR += 1 / (posicao + 1);
  }

  const n = dentro.length;
  relatorio.push(`| ${maxPalavras} palavras | ${trechos.length} | ${pct(acerto1 / n)} | ${pct(recall5 / n)} | ${(somaRR / n).toFixed(3)} |`);
  if (maxPalavras === 180) melhoresSimilaridades = { dentro: simDentro, fora: simFora };
  console.log(`${maxPalavras} palavras: ${trechos.length} trechos, acerto@1 ${pct(acerto1 / n)}, recall@5 ${pct(recall5 / n)}`);
}

// Calibração do limiar com o tamanho usado no app (180 palavras)
const { dentro: sd, fora: sf } = melhoresSimilaridades!;
relatorio.push("", "## Limiar de similaridade (trechos de 180 palavras)", "");
relatorio.push(
  `Maior similaridade do 1º trecho — perguntas do material: mín. ${Math.min(...sd).toFixed(3)}, média ${(sd.reduce((a, b) => a + b, 0) / sd.length).toFixed(3)}`,
  `Maior similaridade do 1º trecho — perguntas fora do material: máx. ${Math.max(...sf).toFixed(3)}, média ${(sf.reduce((a, b) => a + b, 0) / sf.length).toFixed(3)}`,
  "",
  "| Limiar | Respondidas (material) | Recusadas (fora) | Acurácia |",
  "|---|---|---|---|",
);
for (const limiar of [0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
  const respondidas = sd.filter((s) => s >= limiar).length;
  const recusadas = sf.filter((s) => s < limiar).length;
  relatorio.push(
    `| ${limiar.toFixed(2)} | ${respondidas}/${sd.length} | ${recusadas}/${sf.length} | ${pct((respondidas + recusadas) / (sd.length + sf.length))} |`,
  );
}

const saida = new URL("../docs/avaliacao.md", import.meta.url);
writeFileSync(saida, relatorio.join("\n") + "\n");
console.log("\n" + relatorio.join("\n"));
