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

/** Primeiro dia do mês corrente até hoje, no horário de Brasília (YYYY-MM-DD). */
export function defaultCtePeriod(now = new Date()): { from: string; to: string } {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/**
 * Consulta a base original de CT-es sob demanda. `enabled` evita a chamada sem login
 * ou fora da tela de CT-es; a busca por texto espera o usuário parar de digitar.
 */
export function useCteList(input: CteListInput, enabled: boolean): CteListState {
  const fetchCtes = useServerFn(listCtes);
  const [state, setState] = useState<CteListState>({ loading: false, error: "", result: null });
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setState((old) => ({ ...old, loading: true, error: "" }));
        fetchCtes({ data: JSON.parse(key) as CteListInput })
          .then((result) => {
            if (!cancelled) setState({ loading: false, error: "", result });
          })
          .catch((error: unknown) => {
            if (!cancelled) setState({ loading: false, error: errorMessage(error), result: null });
          });
      },
      input.search ? 400 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, fetchCtes]);
  return state;
}
