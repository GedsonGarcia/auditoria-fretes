/**
 * Leitura da base original de CT-es no Databricks (SQL Statement Execution API).
 *
 * Somente leitura: as consultas são montadas aqui, sobre uma lista fixa de tabelas,
 * e os valores informados pelo usuário entram apenas como parâmetros nomeados.
 * Credenciais ficam nos Secrets do Lovable e nunca chegam ao navegador:
 *   DATABRICKS_HOST          ex.: adb-1234567890123456.7.azuredatabricks.net
 *   DATABRICKS_TOKEN         token de acesso (service principal com SELECT nas tabelas)
 *   DATABRICKS_WAREHOUSE_ID  ID do SQL Warehouse
 */

export const CTE_SOURCE_TABLES = {
  resumo: "prd_ancora.`003_broker_nfe_bronze`.cte_resumo",
  nfes: "prd_ancora.`003_broker_nfe_bronze`.cte_resumo_chaves_nfe_relacionadas",
  remetente: "prd_ancora.`003_broker_nfe_bronze`.cte_remetente",
} as const;
export type CteSourceTable = keyof typeof CTE_SOURCE_TABLES;

export const DATABRICKS_SECRETS = [
  "DATABRICKS_HOST",
  "DATABRICKS_TOKEN",
  "DATABRICKS_WAREHOUSE_ID",
] as const;

export type DatabricksConfig = { host: string; token: string; warehouseId: string };
export type QueryParam = { name: string; value: string | null; type?: "STRING" | "DATE" | "INT" };
export type QueryResult = {
  columns: { name: string; type: string }[];
  rows: Record<string, string | null>[];
  truncated: boolean;
};

export class DatabricksError extends Error {}

export function missingDatabricksSecrets(env: Record<string, string | undefined> = process.env) {
  return DATABRICKS_SECRETS.filter((name) => !env[name]?.trim());
}

export function readDatabricksConfig(
  env: Record<string, string | undefined> = process.env,
): DatabricksConfig {
  const missing = missingDatabricksSecrets(env);
  if (missing.length)
    throw new DatabricksError(`Secrets do Databricks não configurados: ${missing.join(", ")}.`);
  const host = env["DATABRICKS_HOST"]!.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  return {
    host,
    token: env["DATABRICKS_TOKEN"]!.trim(),
    warehouseId: env["DATABRICKS_WAREHOUSE_ID"]!.trim(),
  };
}

type StatementResponse = {
  status?: { state?: string; error?: { message?: string } };
  manifest?: {
    schema?: { columns?: { name: string; type_name?: string; type_text?: string }[] };
    truncated?: boolean;
  };
  result?: { data_array?: (string | null)[][] };
  message?: string;
};

/** Converte a resposta JSON_ARRAY do Databricks em linhas nomeadas. */
export function parseStatementResponse(body: StatementResponse): QueryResult {
  const state = body.status?.state;
  if (state !== "SUCCEEDED") {
    const reason = body.status?.error?.message ?? body.message ?? state ?? "resposta inválida";
    throw new DatabricksError(`Consulta ao Databricks não concluída: ${reason}`);
  }
  const columns = (body.manifest?.schema?.columns ?? []).map((c) => ({
    name: c.name,
    type: c.type_text ?? c.type_name ?? "",
  }));
  const rows = (body.result?.data_array ?? []).map((values) =>
    Object.fromEntries(columns.map((c, i) => [c.name, values[i] ?? null])),
  );
  return { columns, rows, truncated: Boolean(body.manifest?.truncated) };
}

export async function runDatabricksQuery(
  statement: string,
  params: QueryParam[] = [],
  options: {
    rowLimit?: number;
    config?: DatabricksConfig | undefined;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<QueryResult> {
  const config = options.config ?? readDatabricksConfig();
  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`https://${config.host}/api/2.0/sql/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouse_id: config.warehouseId,
        statement,
        parameters: params.map((p) => ({ name: p.name, value: p.value, type: p.type ?? "STRING" })),
        wait_timeout: "30s",
        on_wait_timeout: "CANCEL",
        disposition: "INLINE",
        format: "JSON_ARRAY",
        row_limit: options.rowLimit ?? 500,
      }),
    });
  } catch {
    throw new DatabricksError("Não foi possível alcançar o Databricks. Confira o DATABRICKS_HOST.");
  }
  if (response.status === 401 || response.status === 403)
    throw new DatabricksError(
      "O Databricks recusou o acesso. Confira o DATABRICKS_TOKEN e as permissões de SELECT nas tabelas.",
    );
  const body = (await response.json().catch(() => ({}))) as StatementResponse;
  if (!response.ok)
    throw new DatabricksError(
      `Databricks respondeu ${response.status}: ${body.message ?? "erro sem detalhe"}`,
    );
  return parseStatementResponse(body);
}

/** Colunas reais de uma tabela da fonte (DESCRIBE, sem linhas de partição). */
export async function describeSourceTable(table: CteSourceTable, config?: DatabricksConfig) {
  const result = await runDatabricksQuery(`DESCRIBE TABLE ${CTE_SOURCE_TABLES[table]}`, [], {
    config,
  });
  const columns: { name: string; type: string; comment: string }[] = [];
  for (const row of result.rows) {
    const name = row["col_name"]?.trim() ?? "";
    if (!name || name.startsWith("#")) break;
    columns.push({ name, type: row["data_type"] ?? "", comment: row["comment"] ?? "" });
  }
  return columns;
}

/** Poucas linhas de amostra, com textos longos encurtados. */
export async function sampleSourceTable(
  table: CteSourceTable,
  limit = 3,
  config?: DatabricksConfig,
) {
  const result = await runDatabricksQuery(
    `SELECT * FROM ${CTE_SOURCE_TABLES[table]} LIMIT ${Math.min(Math.max(limit, 1), 10)}`,
    [],
    { config, rowLimit: 10 },
  );
  return result.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v && v.length > 120 ? `${v.slice(0, 120)}…` : v]),
    ),
  );
}
