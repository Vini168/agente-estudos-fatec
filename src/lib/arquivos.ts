import { extractText, getDocumentProxy } from "unpdf";

const LIMITE_BYTES = 4 * 1024 * 1024; // a Vercel aceita corpo de até ~4,5 MB

/** Extrai o texto de PDF (página por página) ou lê TXT/MD direto. */
export async function extrairTextoDoArquivo(arquivo: File): Promise<string> {
  if (arquivo.size > LIMITE_BYTES) throw new Error("Arquivo acima de 4 MB");
  const nome = arquivo.name.toLowerCase();

  if (nome.endsWith(".pdf") || arquivo.type === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    const paginas = (text as string[]).map((p) => p.trim()).filter(Boolean);
    if (paginas.length === 0)
      throw new Error("Não encontrei texto no PDF (pode ser um PDF escaneado, só com imagens)");
    return paginas.join("\n\n");
  }
  if (/\.(txt|md)$/.test(nome) || arquivo.type.startsWith("text/")) return arquivo.text();
  throw new Error("Formato não suportado: envie PDF, TXT ou MD");
}
