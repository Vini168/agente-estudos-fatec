import { test } from "node:test";
import assert from "node:assert/strict";
import { contarPalavras, dividirSentencas, normalizarTexto, segmentarTexto } from "../src/lib/chunking.ts";

test("normaliza hifenização de quebra de linha e espaços", () => {
  assert.equal(normalizarTexto("O proces-\nsamento   de\r\nlinguagem"), "O processamento de\nlinguagem");
});

test("não quebra sentença em abreviação nem em número decimal", () => {
  const s = dividirSentencas("O Prof. Silva explicou PLN. A nota foi 9.5 na prova! Certo?");
  assert.deepEqual(s, ["O Prof. Silva explicou PLN.", "A nota foi 9.5 na prova!", "Certo?"]);
});

test("parágrafos viram sentenças separadas mesmo sem ponto final", () => {
  assert.deepEqual(dividirSentencas("Título da aula\n\nPrimeira frase."), ["Título da aula", "Primeira frase."]);
});

test("segmenta respeitando o limite de palavras e com sobreposição", () => {
  const frase = (n: number) => `Esta é a frase número ${n} do texto de teste.`; // 9 palavras
  const texto = Array.from({ length: 10 }, (_, i) => frase(i + 1)).join(" ");
  const trechos = segmentarTexto(texto, { maxPalavras: 30, sentencasSobrepostas: 1 });

  assert.ok(trechos.length > 1);
  for (const t of trechos) assert.ok(contarPalavras(t) <= 30, `trecho grande demais: ${t}`);
  // a última frase de um trecho reaparece no começo do próximo
  for (let i = 1; i < trechos.length; i++) {
    const ultimaAnterior = dividirSentencas(trechos[i - 1]).at(-1)!;
    assert.ok(trechos[i].startsWith(ultimaAnterior));
  }
  // nenhuma frase se perde
  for (let n = 1; n <= 10; n++) assert.ok(trechos.some((t) => t.includes(frase(n))));
});

test("texto vazio não gera trechos", () => {
  assert.deepEqual(segmentarTexto("   \n\n  "), []);
});
