import { describe, expect, it, vi } from "vitest";
import {
  DatabricksError,
  missingDatabricksSecrets,
  parseStatementResponse,
  readDatabricksConfig,
  runDatabricksQuery,
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

  it("explica acesso recusado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(runDatabricksQuery("SELECT 1", [], { config, fetchImpl })).rejects.toThrow(
      /recusou o acesso/,
    );
  });
});
