import { describe, expect, it, vi } from "vitest";
import {
  buildCteListQuery,
  DatabricksError,
  listSourceCtes,
  missingDatabricksSecrets,
  parseStatementResponse,
  readDatabricksConfig,
  runDatabricksQuery,
  tokenHint,
} from "./databricks.server";

const config = { host: "adb-1.azuredatabricks.net", token: "t", warehouseId: "w" };

describe("Databricks — leitura da base de CT-es", () => {
  it("aponta os secrets que faltam e normaliza o host", () => {
    expect(missingDatabricksSecrets({ DATABRICKS_HOST: "x" })).toEqual([
      "DATABRICKS_TOKEN",
      "DATABRICKS_WAREHOUSE_ID",
    ]);
    expect(() => readDatabricksConfig({})).toThrow(DatabricksError);
    expect(
      readDatabricksConfig({
        DATABRICKS_HOST: " https://adb-1.azuredatabricks.net/sql/1.0 ",
        DATABRICKS_TOKEN: "t",
        DATABRICKS_WAREHOUSE_ID: "w",
      }).host,
    ).toBe("adb-1.azuredatabricks.net");
  });

  it("converte JSON_ARRAY em linhas nomeadas, preservando nulos", () => {
    const result = parseStatementResponse({
      status: { state: "SUCCEEDED" },
      manifest: {
        schema: {
          columns: [
            { name: "chave", type_name: "STRING" },
            { name: "emissao", type_name: "TIMESTAMP" },
          ],
        },
      },
      result: { data_array: [["351", null]] },
    });
    expect(result.rows).toEqual([{ chave: "351", emissao: null }]);
    expect(result.columns.map((c) => c.type)).toEqual(["STRING", "TIMESTAMP"]);
  });

  it("falha com a mensagem do Databricks quando a consulta não conclui", () => {
    expect(() =>
      parseStatementResponse({
        status: { state: "FAILED", error: { message: "TABLE_OR_VIEW_NOT_FOUND" } },
      }),
    ).toThrow(/TABLE_OR_VIEW_NOT_FOUND/);
  });

  it("envia SQL fixo com parâmetros nomeados e token só no cabeçalho", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: { state: "SUCCEEDED" }, manifest: {}, result: {} }), {
        status: 200,
      }),
    );
    await runDatabricksQuery("SELECT 1 WHERE x = :chave", [{ name: "chave", value: "351" }], {
      config,
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://adb-1.azuredatabricks.net/api/2.0/sql/statements");
    expect(init.headers.Authorization).toBe("Bearer t");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      warehouse_id: "w",
      statement: "SELECT 1 WHERE x = :chave",
      parameters: [{ name: "chave", value: "351", type: "STRING" }],
      disposition: "INLINE",
      format: "JSON_ARRAY",
    });
    expect(init.body).not.toContain('"t"');
  });

  it("monta a lista de CT-es com SQL fixo e filtros só como parâmetros", () => {
    const { statement, params, limit } = buildCteListQuery({
      from: "2026-11-01",
      to: "2026-11-25",
      search: "50%_x' OR 1=1",
      carrierCnpj: "19.694.199/0001-23",
      branchCnpj: "05916095000101",
      limit: 9999,
    });
    expect(limit).toBe(500);
    expect(statement).toContain("106_logistica_silver`.tb_fato_broker_cte_conhecimento_transporte");
    expect(statement).toContain("NOT fl_deleted");
    expect(statement).toContain("substr(nr_cnpj_cpf_tomador, 1, 8) IN (SELECT raiz FROM anc)");
    expect(statement).toContain("AS nf_fora_base_ancora");
    expect(statement).toContain("FROM prd_ancora.`003_broker_nfe_bronze`.cds_ancora");
    expect(statement).toContain("LIMIT 501");
    expect(statement).not.toContain("1=1");
    expect(statement).not.toContain("2026-11-01");
    expect(params).toEqual([
      { name: "from_date", value: "2026-11-01", type: "DATE" },
      { name: "to_date", value: "2026-11-25", type: "DATE" },
      { name: "search", value: "50%_x' OR 1=1" },
      { name: "search_like", value: "%50\\%\\_x' OR 1=1%" },
      { name: "carrier_cnpj", value: "19694199000123" },
      { name: "branch_cnpj", value: "05916095000101" },
    ]);
  });

  it("sem filtros opcionais, consulta só o período", () => {
    const { statement, params } = buildCteListQuery({ from: "2026-11-01", to: "2026-11-02" });
    expect(params.map((p) => p.name)).toEqual(["from_date", "to_date"]);
    expect(statement).not.toContain(":search");
    expect(statement).toContain("LIMIT 201");
  });

  it("indica quando há mais CT-es que o limite", async () => {
    const data_array = [["1"], ["2"], ["3"]];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: { state: "SUCCEEDED" },
          manifest: { schema: { columns: [{ name: "id_cte" }] } },
          result: { data_array },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const result = await listSourceCtes(
        { from: "2026-11-01", to: "2026-11-02", limit: 2 },
        config,
      );
      expect(result.rows).toEqual([{ id_cte: "1" }, { id_cte: "2" }]);
      expect(result.truncated).toBe(true);
      expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).row_limit).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("espera o SQL Warehouse ligar, consultando o andamento", async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ statement_id: "s1", status: { state: "PENDING" } }))
      .mockResolvedValueOnce(json({ statement_id: "s1", status: { state: "RUNNING" } }))
      .mockResolvedValueOnce(
        json({
          statement_id: "s1",
          status: { state: "SUCCEEDED" },
          manifest: { schema: { columns: [{ name: "x" }] } },
          result: { data_array: [["1"]] },
        }),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await runDatabricksQuery("SELECT 1", [], { config, fetchImpl, sleep });
    expect(result.rows).toEqual([{ x: "1" }]);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body).on_wait_timeout).toBe("CONTINUE");
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      "https://adb-1.azuredatabricks.net/api/2.0/sql/statements/s1",
    );
    expect(fetchImpl.mock.calls[1]![1].method).toBe("GET");
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("cancela e explica quando o warehouse não responde a tempo", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ statement_id: "s2", status: { state: "PENDING" } }), {
          status: 200,
        }),
    );
    await expect(
      runDatabricksQuery("SELECT 1", [], {
        config,
        fetchImpl,
        timeoutMs: 0,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/não respondeu a tempo/);
    expect(fetchImpl.mock.calls.at(-1)![0]).toBe(
      "https://adb-1.azuredatabricks.net/api/2.0/sql/statements/s2/cancel",
    );
  });

  it("mostra a resposta original do Databricks e orienta conforme a recusa", async () => {
    const refuse = (status: number, message: string) =>
      runDatabricksQuery("SELECT 1", [], {
        config,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ error_code: "X", message }), { status }),
          ),
      });
    await expect(
      refuse(403, "Source IP address: 1.2.3.4 is blocked by Databricks IP ACL for workspace: 1"),
    ).rejects.toThrow(/HTTP 403: Source IP address.*lista de IPs/);
    await expect(refuse(401, "Invalid access token.")).rejects.toThrow(/Token inválido/);
    await expect(refuse(403, "Provided OAuth token does not have required scopes")).rejects.toThrow(
      /escopo SQL completo/,
    );
  });

  it("limpa o token colado e não o expõe", () => {
    const env = {
      DATABRICKS_HOST: "adb-1.azuredatabricks.net",
      DATABRICKS_TOKEN: ' "Bearer dapi1234567890abcd"\n',
      DATABRICKS_WAREHOUSE_ID: "/sql/1.0/warehouses/c71807e4901a1982",
    };
    const parsed = readDatabricksConfig(env);
    expect(parsed.token).toBe("dapi1234567890abcd");
    expect(parsed.warehouseId).toBe("c71807e4901a1982");
    expect(tokenHint(parsed.token)).toBe("••••abcd");
  });

  it("explica acesso recusado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(runDatabricksQuery("SELECT 1", [], { config, fetchImpl })).rejects.toThrow(
      /recusou o acesso/,
    );
  });
});
