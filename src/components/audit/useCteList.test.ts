import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const fetchCtes = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => fetchCtes }));
vi.mock("@/lib/cte-source.functions", () => ({ listCtes: {} }));

import { defaultCtePeriod, sameCteFilters, useCteList, type CteSearchRequest } from "./useCteList";

const result = {
  configured: true,
  missingSecrets: [],
  records: [],
  truncated: false,
  checkedAt: "",
};
const period = { from: "2026-11-01", to: "2026-11-25" };

describe("Busca de CT-es com botão", () => {
  beforeEach(() => {
    fetchCtes.mockReset();
    fetchCtes.mockResolvedValue(result);
  });

  it("começa no mês corrente, no horário de Brasília", () => {
    expect(defaultCtePeriod(new Date("2026-12-01T02:00:00Z"))).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("detecta filtros alterados e ainda não aplicados", () => {
    expect(sameCteFilters(period, { ...period, search: "  " })).toBe(true);
    expect(sameCteFilters(period, { ...period, search: "279025" })).toBe(false);
    expect(sameCteFilters(period, { ...period, carrierCnpj: "19694199000123" })).toBe(false);
  });

  it("consulta só quando há um novo pedido de busca", async () => {
    const { result: state, rerender } = renderHook(
      ({ request, enabled }: { request: CteSearchRequest; enabled: boolean }) =>
        useCteList(request, enabled),
      { initialProps: { request: { input: period, nonce: 0 }, enabled: false } },
    );
    expect(fetchCtes).not.toHaveBeenCalled();

    rerender({ request: { input: period, nonce: 0 }, enabled: true });
    await waitFor(() => expect(state.current.result).toEqual(result));
    expect(fetchCtes).toHaveBeenCalledTimes(1);
    expect(fetchCtes).toHaveBeenCalledWith({ data: period });

    // Mesmo pedido (re-render sem clicar em Buscar): nenhuma consulta nova.
    rerender({ request: { input: period, nonce: 0 }, enabled: true });
    expect(fetchCtes).toHaveBeenCalledTimes(1);

    // Clique em Buscar, mesmo com os mesmos filtros: consulta de novo.
    rerender({ request: { input: period, nonce: 1 }, enabled: true });
    await waitFor(() => expect(fetchCtes).toHaveBeenCalledTimes(2));
  });

  it("mostra o erro da consulta sem manter resultado antigo", async () => {
    fetchCtes.mockRejectedValue(new Error("O Databricks recusou o acesso."));
    const { result: state } = renderHook(() => useCteList({ input: period, nonce: 0 }, true));
    await waitFor(() => expect(state.current.error).toBe("O Databricks recusou o acesso."));
    expect(state.current.result).toBeNull();
    expect(state.current.loading).toBe(false);
  });
});
