import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabase } from "./supabase";

// Login com Supabase Auth feito pelo servidor. O token fica em cookie httpOnly,
// então o navegador nunca vê chave nenhuma e não precisamos de variáveis NEXT_PUBLIC_.

const COOKIE_ACESSO = "sb-acesso";
const COOKIE_RENOVACAO = "sb-renovacao";
const opcoesCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

// Cliente descartável para operações de sessão: signIn/refresh trocariam o token do cliente compartilhado.
function clienteAuth() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function salvarSessao(acesso: string, renovacao: string) {
  const jar = await cookies();
  jar.set(COOKIE_ACESSO, acesso, opcoesCookie);
  jar.set(COOKIE_RENOVACAO, renovacao, opcoesCookie);
}

export async function entrar(email: string, senha: string) {
  const { data, error } = await clienteAuth().auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) throw new Error("E-mail ou senha inválidos");
  await salvarSessao(data.session.access_token, data.session.refresh_token);
  return { id: data.user.id, email: data.user.email };
}

export async function sair() {
  const jar = await cookies();
  jar.delete(COOKIE_ACESSO);
  jar.delete(COOKIE_RENOVACAO);
}

export type Usuario = { id: string; email: string | undefined };

/** Usuário logado (renova o token se expirou) ou null. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const jar = await cookies();
  const acesso = jar.get(COOKIE_ACESSO)?.value;
  if (acesso) {
    const { data } = await supabase().auth.getUser(acesso);
    if (data.user) return { id: data.user.id, email: data.user.email };
  }
  const renovacao = jar.get(COOKIE_RENOVACAO)?.value;
  if (!renovacao) return null;
  const { data, error } = await clienteAuth().auth.refreshSession({ refresh_token: renovacao });
  if (error || !data.session || !data.user) return null;
  await salvarSessao(data.session.access_token, data.session.refresh_token);
  return { id: data.user.id, email: data.user.email };
}

export class NaoAutenticado extends Error {
  constructor() {
    super("Faça login para continuar");
  }
}

export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual();
  if (!usuario) throw new NaoAutenticado();
  return usuario;
}
