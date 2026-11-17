// Cria um usuário no Supabase Auth (já confirmado) com senha aleatória.
//   node --env-file=.env.local scripts/criar-usuario.ts <email> [arquivo-de-saida]
// A senha é gravada no arquivo de saída (padrão .env.login-teste.local, ignorado pelo git) e não aparece no terminal.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [email, saida = ".env.login-teste.local"] = process.argv.slice(2);
if (!email) throw new Error("Uso: node --env-file=.env.local scripts/criar-usuario.ts <email>");

const senha = randomBytes(12).toString("base64url");
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
if (error) throw new Error(error.message);

writeFileSync(saida, `# Login de teste do Agente de Estudos (não versionar)\nLOGIN_EMAIL=${email}\nLOGIN_SENHA=${senha}\n`);
console.log(`Usuário criado: ${data.user.id} (${email}). Senha salva em ${saida}.`);
