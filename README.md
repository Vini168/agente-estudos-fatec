# 📚 Agente de Estudos Fatec

Agente de IA para estudos (disciplina de Processamento de Linguagem Natural — Fatec Cotia).
O aluno envia o material da aula e faz perguntas. O agente encontra os trechos relevantes com busca
semântica e responde com o Gemini, **citando as fontes** e sem inventar o que não está no material (RAG).

Stack (a mesma do vídeo de referência): **Google Stitch** (layout) → **Google AI Studio / Gemini** (IA)
→ **Next.js** → **Supabase** (Postgres + pgvector) → **GitHub** → **Vercel**.

## Como funciona

```
Ingestão:  texto → normalização → sentenças → trechos (~180 palavras, 1 sentença de sobreposição)
           → embeddings (gemini-embedding-001, 768 dim.) → Supabase (tabela trechos)

Pergunta:  pergunta → embedding → buscar_trechos (cosseno, top 5, mínimo 0,55)
           → prompt com os trechos numerados → Gemini → resposta com citações [1], [2]
```

| Arquivo | O que faz |
|---|---|
| `src/lib/chunking.ts` | Pré-processamento e segmentação (PLN) |
| `src/lib/gemini.ts` | Embeddings e geração de texto com o Gemini |
| `src/lib/agente.ts` | Ingestão e o fluxo de pergunta (RAG) |
| `src/app/api/*` | Rotas `GET/POST /api/documentos` e `POST /api/perguntar` |
| `supabase/migrations/0001_inicial.sql` | Tabelas, índice vetorial e a função `buscar_trechos` |
| `tests/chunking.test.ts` | Testes da segmentação |

## Rodando localmente

1. Crie um projeto no [Supabase](https://supabase.com) e rode `supabase/migrations/0001_inicial.sql` no **SQL Editor**.
2. Pegue uma chave do Gemini em <https://aistudio.google.com/apikey>.
3. Copie `.env.example` para `.env.local` e preencha.
4. Rode:

```bash
npm install
npm test
npm run dev
```

## Deploy (igual ao vídeo)

Suba o repositório no GitHub, importe-o na Vercel (o framework Next.js é detectado sozinho) e cadastre as
variáveis do `.env.example` em **Environment Variables**.
