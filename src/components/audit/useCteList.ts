import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listCtes, type CteListResult } from "@/lib/cte-source.functions";
import type { CteListInput } from "@/lib/cte-list-schema";
import { errorMessage } from "@/lib/audit-schemas";

export type CteListState = {
  loading: boolean;
  error: string;
  result: CteListResult | null;
};

/** Pedido de busca: os filtros aplicados e um número que muda a cada clique em Buscar. */
export type CteSearchRequest = { input: CteListInput; nonce: number };

/** Primeiro dia do mês corrente até hoje, no horário de Brasília (YYYY-MM-DD). */
export function defaultCtePeriod(now = new Date()): { from: string; to: string } {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Compara filtros ignorando campos vazios (para avisar que há filtros não aplicados). */
export function sameCteFilters(a: CteListInput, b: CteListInput): boolean {
  const norm = (v: CteListInput) =>
    JSON.stringify([v.from, v.to, v.search?.trim() || "", v.carrierCnpj || "", v.branchCnpj || ""]);
  return norm(a) === norm(b);
}

/**
 * Consulta a base original de CT-es somente quando um pedido é feito (abertura da tela
 * ou clique em Buscar). Mudar filtros sem buscar não consulta o Databricks.
 * `enabled` evita a chamada sem login, sem perfil ou fora da tela de CT-es.
 */
export function useCteList(request: CteSearchRequest, enabled: boolean): CteListState {
  const fetchCtes = useServerFn(listCtes);
  const [state, setState] = useState<CteListState>({ loading: false, error: "", result: null });
  const key = JSON.stringify(request);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState((old) => ({ ...old, loading: true, error: "" }));
    fetchCtes({ data: (JSON.parse(key) as CteSearchRequest).input })
      .then((result) => {
        if (!cancelled) setState({ loading: false, error: "", result });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ loading: false, error: errorMessage(error), result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled, fetchCtes]);
  return state;
}
