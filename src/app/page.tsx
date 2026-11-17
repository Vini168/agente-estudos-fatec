"use client";

import { useEffect, useRef, useState } from "react";

type Usuario = { id: string; email?: string };
type Documento = { id: string; titulo: string; disciplina: string | null; criado_em: string };
type Fonte = { numero: number; titulo: string; trecho: string; similaridade: number };
type Questao = { pergunta: string; alternativas: string[]; correta: number; explicacao: string };
type Mensagem = {
  autor: "aluno" | "agente";
  texto: string;
  fontes?: Fonte[];
  quiz?: Questao[] | null;
  ferramentas?: string[];
};

const NOMES_FERRAMENTAS: Record<string, string> = {
  buscar_material: "🔎 buscou no material",
  resumir_material: "📝 resumiu o material",
  gerar_quiz: "❓ gerou quiz",
};

// Markdown mínimo da resposta do Gemini: **negrito**, *itálico*, `código` e itens de lista com "*" ou "-"
function TextoFormatado({ texto }: { texto: string }) {
  const inline = (linha: string) =>
    linha.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/).map((parte, i) =>
      parte.startsWith("**") ? (
        <b key={i}>{parte.slice(2, -2)}</b>
      ) : parte.startsWith("*") && parte.length > 2 && parte.endsWith("*") ? (
        <i key={i}>{parte.slice(1, -1)}</i>
      ) : parte.startsWith("`") ? (
        <code key={i} className="rounded bg-slate-200 px-1">
          {parte.slice(1, -1)}
        </code>
      ) : (
        parte
      ),
    );
  return (
    <>
      {texto.split("\n").map((linha, i) => {
        const titulo = linha.match(/^#{1,4}\s+(.*)/);
        if (titulo) return <p key={i} className="mt-1 font-semibold">{inline(titulo[1])}</p>;
        const item = linha.match(/^\s*(?:[*-]|\d+\.)\s+(.*)/);
        if (item) return <p key={i} className="ml-3">• {inline(item[1])}</p>;
        return linha.trim() ? <p key={i}>{inline(linha)}</p> : <div key={i} className="h-2" />;
      })}
    </>
  );
}

function Quiz({ questoes }: { questoes: Questao[] }) {
  const [respostas, setRespostas] = useState<Record<number, number>>({});
  const [corrigido, setCorrigido] = useState(false);
  const acertos = questoes.filter((q, i) => respostas[i] === q.correta).length;

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-indigo-200 bg-white p-3 text-sm">
      {questoes.map((q, i) => (
        <div key={i}>
          <p className="font-medium">
            {i + 1}. {q.pergunta}
          </p>
          {q.alternativas.map((alt, j) => {
            const marcada = respostas[i] === j;
            const cor = !corrigido
              ? marcada
                ? "bg-indigo-100"
                : ""
              : j === q.correta
                ? "bg-green-100"
                : marcada
                  ? "bg-red-100"
                  : "";
            return (
              <label key={j} className={`mt-1 flex cursor-pointer gap-2 rounded p-1 ${cor}`}>
                <input
                  type="radio"
                  name={`q${i}`}
                  disabled={corrigido}
                  checked={marcada}
                  onChange={() => setRespostas((r) => ({ ...r, [i]: j }))}
                />
                {String.fromCharCode(65 + j)}) {alt}
              </label>
            );
          })}
          {corrigido && <p className="mt-1 text-xs text-slate-600">💡 {q.explicacao}</p>}
        </div>
      ))}
      {!corrigido ? (
        <button
          onClick={() => setCorrigido(true)}
          disabled={Object.keys(respostas).length < questoes.length}
          className="rounded-lg bg-indigo-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Corrigir
        </button>
      ) : (
        <p className="font-semibold">
          Você acertou {acertos} de {questoes.length}.
        </p>
      )}
    </div>
  );
}

function Login({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    const r = await fetch("/api/sessao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const dados = await r.json();
    setEntrando(false);
    if (!r.ok) return setErro(dados.erro);
    aoEntrar(dados.usuario);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">📚 Agente de Estudos Fatec</h1>
        <p className="text-sm text-slate-600">Entre para estudar com o seu material.</p>
        <input
          className="w-full rounded-lg border p-2"
          type="email"
          placeholder="E-mail"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border p-2"
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
        <button disabled={entrando} className="w-full rounded-lg bg-indigo-600 p-2 font-medium text-white disabled:opacity-50">
          {entrando ? "Entrando…" : "Entrar"}
        </button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </form>
    </main>
  );
}

export default function Pagina() {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/sessao")
      .then((r) => r.json())
      .then((d) => setUsuario(d.usuario ?? null))
      .catch(() => setUsuario(null));
  }, []);

  if (usuario === undefined) return <p className="p-8 text-slate-500">Carregando…</p>;
  if (!usuario) return <Login aoEntrar={setUsuario} />;
  return <AreaDeEstudo usuario={usuario} aoSair={() => setUsuario(null)} />;
}

function AreaDeEstudo({ usuario, aoSair }: { usuario: Usuario; aoSair: () => void }) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [titulo, setTitulo] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const [filtro, setFiltro] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pensando, setPensando] = useState(false);
  const fimConversa = useRef<HTMLDivElement>(null);

  async function carregarDocumentos() {
    const r = await fetch("/api/documentos");
    if (r.status === 401) return aoSair();
    const dados = await r.json();
    if (r.ok) setDocumentos(dados);
    else setAviso(dados.erro);
  }

  useEffect(() => {
    carregarDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fimConversa.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, pensando]);

  function escolherArquivo(f: File | undefined) {
    setArquivo(f ?? null);
    if (f && !titulo) setTitulo(f.name.replace(/\.[^.]+$/, ""));
  }

  async function adicionarMaterial(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setAviso(null);
    const form = new FormData();
    form.set("titulo", titulo);
    form.set("disciplina", disciplina);
    form.set("texto", texto);
    if (arquivo) form.set("arquivo", arquivo);
    const r = await fetch("/api/documentos", { method: "POST", body: form });
    const dados = await r.json().catch(() => ({ erro: `Erro ${r.status}` }));
    setEnviando(false);
    if (!r.ok) return setAviso(dados.erro);
    setAviso(`Material adicionado: ${dados.trechos} trechos indexados.`);
    setTitulo("");
    setDisciplina("");
    setTexto("");
    setArquivo(null);
    if (campoArquivo.current) campoArquivo.current.value = "";
    carregarDocumentos();
  }

  async function removerMaterial(id: string) {
    if (!confirm("Remover este material?")) return;
    await fetch(`/api/documentos?id=${id}`, { method: "DELETE" });
    if (filtro === id) setFiltro("");
    carregarDocumentos();
  }

  async function enviarMensagem(textoMensagem: string) {
    if (!textoMensagem.trim() || pensando) return;
    const historico = mensagens.map((m) => ({ autor: m.autor, texto: m.texto }));
    setMensagens((m) => [...m, { autor: "aluno", texto: textoMensagem }]);
    setPergunta("");
    setPensando(true);
    const r = await fetch("/api/agente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: textoMensagem, historico, documentoId: filtro || null }),
    });
    const dados = await r.json().catch(() => ({ erro: `Erro ${r.status}` }));
    setPensando(false);
    if (r.status === 401) return aoSair();
    setMensagens((m) => [
      ...m,
      r.ok
        ? { autor: "agente", texto: dados.resposta, fontes: dados.fontes, quiz: dados.quiz, ferramentas: dados.ferramentas }
        : { autor: "agente", texto: `Erro: ${dados.erro}` },
    ]);
  }

  async function sairDaConta() {
    await fetch("/api/sessao", { method: "DELETE" });
    aoSair();
  }

  const selecionado = documentos.find((d) => d.id === filtro);
  const atalhos = [
    { rotulo: "📝 Resumir", texto: selecionado ? `Resuma o material "${selecionado.titulo}".` : "Resuma o meu material mais recente." },
    { rotulo: "❓ Quiz", texto: selecionado ? `Crie um quiz de 5 questões sobre "${selecionado.titulo}".` : "Crie um quiz de 5 questões sobre o meu material." },
  ];

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[360px_1fr] md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-2 md:col-span-2">
        <div>
          <h1 className="text-2xl font-bold">📚 Agente de Estudos Fatec</h1>
          <p className="text-slate-600">
            Envie o material da aula e converse com o agente: ele busca, resume e cria quizzes só com o que você enviou.
          </p>
        </div>
        <div className="text-right text-sm text-slate-600">
          {usuario.email}
          <button onClick={sairDaConta} className="ml-2 underline">
            Sair
          </button>
        </div>
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
          <input
            ref={campoArquivo}
            type="file"
            accept=".pdf,.txt,.md"
            className="block w-full text-sm"
            onChange={(e) => escolherArquivo(e.target.files?.[0])}
          />
          {!arquivo && (
            <textarea
              className="h-32 w-full rounded-lg border p-2 text-sm"
              placeholder="…ou cole aqui o texto da aula"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          )}
          <button
            disabled={enviando || (!arquivo && !texto.trim())}
            className="w-full rounded-lg bg-indigo-600 p-2 font-medium text-white disabled:opacity-50"
          >
            {enviando ? "Lendo e indexando…" : "Adicionar"}
          </button>
          {aviso && <p className="text-sm text-slate-700">{aviso}</p>}
        </form>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">Meus materiais</h2>
          {documentos.length === 0 && <p className="text-sm text-slate-500">Nenhum material ainda.</p>}
          <ul className="space-y-1 text-sm">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-medium">{d.titulo}</span>
                  {d.disciplina && <span className="text-slate-500"> · {d.disciplina}</span>}
                </span>
                <button onClick={() => removerMaterial(d.id)} className="text-slate-400 hover:text-red-600" title="Remover">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex min-h-[75vh] flex-col rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <label className="text-sm text-slate-600" htmlFor="filtro">
            Material:
          </label>
          <select
            id="filtro"
            className="min-w-40 flex-1 rounded-lg border p-1 text-sm"
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
          {atalhos.map((a) => (
            <button
              key={a.rotulo}
              onClick={() => enviarMensagem(a.texto)}
              disabled={pensando || documentos.length === 0}
              className="rounded-lg border px-2 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {mensagens.length === 0 && (
            <p className="text-sm text-slate-500">
              Ex.: “O que é lematização?”, “Resuma a aula 3”, “Me faça 3 questões sobre stopwords”.
            </p>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={m.autor === "aluno" ? "text-right" : ""}>
              {m.ferramentas && m.ferramentas.length > 0 && (
                <p className="mb-1 text-xs text-slate-500">
                  {[...new Set(m.ferramentas)].map((f) => NOMES_FERRAMENTAS[f] ?? f).join(" · ")}
                </p>
              )}
              <div
                className={`inline-block max-w-[90%] rounded-xl p-3 text-left text-sm ${
                  m.autor === "aluno" ? "bg-indigo-600 text-white" : "bg-slate-100"
                }`}
              >
                {m.autor === "agente" ? <TextoFormatado texto={m.texto} /> : m.texto}
              </div>
              {m.quiz && m.quiz.length > 0 && <Quiz questoes={m.quiz} />}
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
          {pensando && <p className="text-sm text-slate-500">O agente está pensando…</p>}
          <div ref={fimConversa} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviarMensagem(pergunta);
          }}
          className="flex gap-2 border-t p-4"
        >
          <input
            className="flex-1 rounded-lg border p-2"
            placeholder="Pergunte, peça um resumo ou um quiz"
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
