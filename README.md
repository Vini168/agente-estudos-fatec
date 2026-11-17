# 📚 Agente de Estudos Fatec

Agente de IA para estudos (disciplina de Processamento de Linguagem Natural — Fatec Cotia).
O aluno envia o material da aula (PDF, TXT ou texto colado) e conversa com o agente. O agente decide
sozinho qual ferramenta usar: **buscar** no material e responder com citações, **resumir** um material
ou **gerar um quiz**. Ele responde só com o que está no material e diz quando o assunto não está lá (RAG).

**Site:** https://agente-estudos-fatec.vercel.app/ (precisa de login)

Stack (a mesma do vídeo de referência): **Google Stitch** (layout) → **Google AI Studio / Gemini** (IA)
→ **Next.js** → **Supabase** (Postgres + pgvector + Auth) → **GitHub** → **Vercel**.

## Como funciona

```
Ingestão:  PDF/TXT → extração de texto → normalização → sentenças → trechos (~180 palavras,
           1 sentença de sobreposição) → embeddings (gemini-embedding-001, 768 dim.) → Supabase

Agente:    mensagem + histórico → Gemini com 3 ferramentas (function calling), até 4 passos
             buscar_material   → busca vetorial (cosseno, top 5, similaridade ≥ 0,55) só nos materiais do aluno
             resumir_material  → resumo map-reduce (blocos de 2.500 palavras → resumo final)
             gerar_quiz        → questões de múltipla escolha em JSON validado por schema
           → resposta com citações [1], [2] + fontes + quiz interativo
```

| Arquivo | O que faz |
|---|---|
| `src/lib/chunking.ts` | Pré-processamento e segmentação (PLN) |
| `src/lib/arquivos.ts` | Extração de texto de PDF (unpdf), TXT e MD |
| `src/lib/gemini.ts` | Embeddings, geração de texto/JSON e troca de modelo em caso de sobrecarga |
| `src/lib/ferramentas.ts` | Ferramentas do agente: busca, resumo e quiz |
| `src/lib/agente.ts` | Ingestão e o laço do agente (function calling) |
| `src/lib/auth.ts` | Login com Supabase Auth (sessão em cookie httpOnly) |
| `src/app/api/*` | `sessao` (login), `documentos`, `agente`, `saude` (cron diário) |
| `supabase/migrations/` | Tabelas, índice vetorial, função `buscar_trechos` e dono de cada material |
| `scripts/avaliar.ts` | Avaliação da recuperação e calibração do limiar → `docs/avaliacao.md` |
| `scripts/criar-usuario.ts` | Cria um usuário de login com senha aleatória |
| `tests/` | Testes da segmentação e o conjunto de perguntas de avaliação |

## Rodando localmente

1. Crie um projeto no [Supabase](https://supabase.com) e rode os arquivos de `supabase/migrations/` em ordem no **SQL Editor**.
2. Pegue uma chave do Gemini em <https://aistudio.google.com/apikey>.
3. Copie `.env.example` para `.env.local` e preencha.
4. Crie um usuário: `node --env-file=.env.local scripts/criar-usuario.ts voce@exemplo.com`
   (a senha fica em `.env.login-teste.local`). Também dá para criar em Supabase → Authentication → Add user.
5. Rode:

```bash
npm install
npm test
npm run dev
```

Avaliação da busca (gasta poucas chamadas de embedding):

```bash
node --env-file=.env.local scripts/avaliar.ts
```

## Deploy (igual ao vídeo)

O repositório está ligado à Vercel: cada push na `main` publica uma versão nova. As variáveis do
`.env.example` ficam em **Settings → Environment Variables** da Vercel. O `vercel.json` agenda um
acesso diário a `/api/saude`, que impede o Supabase gratuito de pausar por inatividade.
