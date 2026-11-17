-- Agente de Estudos Fatec — Parte 2: cada material pertence a um usuário (Supabase Auth)
-- Executar no Supabase: SQL Editor > colar tudo > Run

alter table documentos
  add column if not exists usuario_id uuid references auth.users (id) on delete cascade;

create index if not exists documentos_usuario_idx on documentos (usuario_id);

-- A busca passa a receber o usuário: um aluno nunca recebe trechos do material de outro.
drop function if exists buscar_trechos(vector, int, uuid);

create or replace function buscar_trechos(
  consulta          vector(768),
  filtro_usuario    uuid,
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
  where d.usuario_id = filtro_usuario
    and (filtro_documento is null or t.documento_id = filtro_documento)
  order by t.embedding <=> consulta
  limit quantidade;
$$;

-- A função só é chamada pelo servidor (service role); ninguém de fora executa.
revoke execute on function buscar_trechos(vector, uuid, int, uuid) from public, anon, authenticated;

-- Políticas para leitura direta por usuário logado (defesa extra; o app usa o servidor)
drop policy if exists "dono le documentos" on documentos;
create policy "dono le documentos" on documentos
  for select to authenticated using (usuario_id = auth.uid());

drop policy if exists "dono le trechos" on trechos;
create policy "dono le trechos" on trechos
  for select to authenticated
  using (exists (select 1 from documentos d where d.id = trechos.documento_id and d.usuario_id = auth.uid()));
