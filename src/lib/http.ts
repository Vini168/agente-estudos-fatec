import { NextResponse } from "next/server";
import { NaoAutenticado } from "./auth";

/** Converte erros em JSON { erro } com o status certo (401 quando falta login). */
export function respostaDeErro(e: unknown) {
  const status = e instanceof NaoAutenticado ? 401 : 500;
  if (status === 500) console.error(e);
  return NextResponse.json({ erro: (e as Error).message }, { status });
}
