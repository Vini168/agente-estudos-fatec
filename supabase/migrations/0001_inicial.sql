-- Agente de Estudos Fatec — estrutura inicial (Parte 1)
-- Executar no Supabase: SQL Editor > colar tudo > Run

create extension if not exists vector;

-- Material de estudo enviado pelo aluno (texto já extraído)
create table if not exists documentos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  disciplina  text,
  conteudo    text not null,
  criado_em   timestamptz not null default now()
);

-- Trechos (chunks) do documento com o embedding usado na busca semântica
create table if not exists trechos (
  id            bigserial primary key,
  documento_id  uuid not null references documentos (id) on delete cascade,
  ordem         int  not null,
  conteudo      text not null,
  embedding     vector(768) not null
);

create index if not exists trechos_documento_idx on trechos (documento_id);
create index if not exists trechos_embedding_idx on trechos using hnsw (embedding vector_cosine_ops);

-- Busca semântica: devolve os trechos mais parecidos com a pergunta (similaridade de cosseno)
create or replace function buscar_trechos(
  consulta          vector(768),
  quantidade        int  default 5,
  filtro_documento  uuid default null
)
returns table (
  id            bigint,
  documento_id  uuid,
  titulo        text,
  ordem         int,
  conteudo      text,
  similaridade  float
)
language sql stable
as $$
  select t.id, t.documento_id, d.titulo, t.ordem, t.conteudo,
         1 - (t.embedding <=> consulta) as similaridade
  from trechos t
  join documentos d on d.id = t.documento_id
  where filtro_documento is null or t.documento_id = filtro_documento
  order by t.embedding <=> consulta
  limit quantidade;
$$;

-- RLS ligado e sem políticas: só o servidor (service role) acessa as tabelas.
-- Na Parte 2, com login do Supabase Auth, entram as políticas por usuário.
alter table documentos enable row level security;
alter table trechos    enable row level security;
