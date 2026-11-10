"use client";

import { useEffect, useState } from "react";

type Documento = { id: string; titulo: string; disciplina: string | null; criado_em: string };
type Fonte = { numero: number; titulo: string; trecho: string; similaridade: number };
type Mensagem = { autor: "aluno" | "agente"; texto: string; fontes?: Fonte[] };

// Markdown mínimo da resposta do Gemini: **negrito**, `código` e itens de lista com "*" ou "-"
function TextoFormatado({ texto }: { texto: string }) {
  const inline = (linha: string) =>
    linha.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((parte, i) =>
      parte.startsWith("**") ? (
        <b key={i}>{parte.slice(2, -2)}</b>
      ) : parte.startsWith("`") ? (
        <code key={i} className="rounded bg-slate-200 px-1">{parte.slice(1, -1)}</code>
      ) : (
        parte
      ),
    );
  return (
    <>
      {texto.split("\n").map((linha, i) => {
        const item = linha.match(/^\s*[*-]\s+(.*)/);
        if (item) return <p key={i} className="ml-3">• {inline(item[1])}</p>;
        return linha.trim() ? <p key={i}>{inline(linha)}</p> : <div key={i} className="h-2" />;
      })}
    </>
  );
}

export default function Pagina() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [titulo, setTitulo] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [filtro, setFiltro] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pensando, setPensando] = useState(false);

  async function carregarDocumentos() {
    const r = await fetch("/api/documentos");
    const dados = await r.json();
    if (r.ok) setDocumentos(dados);
    else setAviso(dados.erro);
  }

  useEffect(() => {
    carregarDocumentos();
  }, []);

  async function lerArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setTexto(await arquivo.text());
    if (!titulo) setTitulo(arquivo.name.replace(/\.[^.]+$/, ""));
  }

  async function adicionarMaterial(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    const r = await fetch("/api/documentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, disciplina, texto }),
    });
    const dados = await r.json();
    setEnviando(false);
    if (!r.ok) return setAviso(dados.erro);
    setAviso(`Material adicionado: ${dados.trechos} trechos indexados.`);
    setTitulo("");
    setDisciplina("");
    setTexto("");
    carregarDocumentos();
  }

  async function enviarPergunta(e: React.FormEvent) {
    e.preventDefault();
    if (!pergunta.trim()) return;
    const atual = pergunta;
    setMensagens((m) => [...m, { autor: "aluno", texto: atual }]);
    setPergunta("");
    setPensando(true);
    const r = await fetch("/api/perguntar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: atual, documentoId: filtro || null }),
    });
    const dados = await r.json();
    setPensando(false);
    setMensagens((m) => [
      ...m,
      r.ok
        ? { autor: "agente", texto: dados.resposta, fontes: dados.fontes }
        : { autor: "agente", texto: `Erro: ${dados.erro}` },
    ]);
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[360px_1fr] md:p-8">
      <header className="md:col-span-2">
        <h1 className="text-2xl font-bold">📚 Agente de Estudos Fatec</h1>
        <p className="text-slate-600">
          Envie o material da aula e pergunte. O agente responde só com base no que você enviou e mostra as fontes.
        </p>
      </header>

      <section className="space-y-4">
        <form onSubmit={adicionarMaterial} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Adicionar material</h2>
          <input
            className="w-full rounded-lg border p-2"
            placeholder="Título (ex.: Aula 3 – Tokenização)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border p-2"
            placeholder="Disciplina (opcional)"
            value={disciplina}
            onChange={(e) => setDisciplina(e.target.value)}
          />
          <textarea
            className="h-40 w-full rounded-lg border p-2 text-sm"
            placeholder="Cole aqui o texto da aula…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            required
          />
          <input
            type="file"
            accept=".txt,.md"
            className="block w-full text-sm"
            onChange={(e) => lerArquivo(e.target.files?.[0])}
          />
          <button
            disabled={enviando}
            className="w-full rounded-lg bg-indigo-600 p-2 font-medium text-white disabled:opacity-50"
          >
            {enviando ? "Indexando…" : "Adicionar"}
          </button>
          {aviso && <p className="text-sm text-slate-700">{aviso}</p>}
        </form>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Meus materiais</h2>
          {documentos.length === 0 && <p className="text-sm text-slate-500">Nenhum material ainda.</p>}
          <ul className="space-y-1 text-sm">
            {documentos.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.titulo}</span>
                {d.disciplina && <span className="text-slate-500"> · {d.disciplina}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex min-h-[70vh] flex-col rounded-xl bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <label className="text-sm text-slate-600" htmlFor="filtro">
            Perguntar sobre:
          </label>
          <select
            id="filtro"
            className="flex-1 rounded-lg border p-1 text-sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          >
            <option value="">Todos os materiais</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {mensagens.length === 0 && (
            <p className="text-sm text-slate-500">Ex.: “O que é lematização e qual a diferença para stemming?”</p>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={m.autor === "aluno" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-xl p-3 text-left text-sm ${
                  m.autor === "aluno" ? "bg-indigo-600 text-white" : "bg-slate-100"
                }`}
              >
                {m.autor === "agente" ? <TextoFormatado texto={m.texto} /> : m.texto}
              </div>
              {m.fontes && m.fontes.length > 0 && (
                <details className="mt-1 text-xs text-slate-600">
                  <summary className="cursor-pointer">Fontes ({m.fontes.length})</summary>
                  {m.fontes.map((f) => (
                    <p key={f.numero} className="mt-1 rounded bg-slate-50 p-2">
                      <b>
                        [{f.numero}] {f.titulo}
                      </b>{" "}
                      (similaridade {f.similaridade}) — {f.trecho}
                    </p>
                  ))}
                </details>
              )}
            </div>
          ))}
          {pensando && <p className="text-sm text-slate-500">Pensando…</p>}
        </div>

        <form onSubmit={enviarPergunta} className="flex gap-2 border-t p-4">
          <input
            className="flex-1 rounded-lg border p-2"
            placeholder="Faça uma pergunta sobre o material"
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
          />
          <button disabled={pensando} className="rounded-lg bg-indigo-600 px-4 font-medium text-white disabled:opacity-50">
            Enviar
          </button>
        </form>
      </section>
    </main>
  );
}
