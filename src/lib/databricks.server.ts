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

/**
 * Fato silver de CT-es do Broker: já junta resumo, emitente, remetente, destinatário,
 * tomador, NF-es relacionadas, componentes e quantidades (uma linha por CT-e).
 */
export const CTE_SOURCE_TABLES = {
  conhecimentos: "prd_ancora.`106_logistica_silver`.tb_fato_broker_cte_conhecimento_transporte",
  remetente: "prd_ancora.`003_broker_nfe_bronze`.cte_remetente",
  destinatario: "prd_ancora.`003_broker_nfe_bronze`.cte_destinatario",
  nfeCabecalho: "prd_ancora.`003_broker_nfe_bronze`.nfe_cabecalho",
  nfeTransporte: "prd_ancora.`003_broker_nfe_bronze`.nfe_transporte",
  /** Lista oficial de CDs da Rede ANCORA no Broker: define quem é tomador auditado. */
  cdsAncora: "prd_ancora.`003_broker_nfe_bronze`.cds_ancora",
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
    token: cleanToken(env["DATABRICKS_TOKEN"]!),
    warehouseId: env["DATABRICKS_WAREHOUSE_ID"]!.trim().replace(/^.*\/warehouses\//, ""),
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
  error_code?: string;
  statement_id?: string;
};

/** Orientação conforme a recusa: IP bloqueado, token inválido ou falta de permissão. */
export function explainRefusal(status: number, detail: string): string {
  if (/ip acl|source ip|ip access list|blocked/i.test(detail))
    return "O Databricks da empresa bloqueia acessos de fora da rede: peça ao time de dados para liberar o acesso do app (lista de IPs do workspace).";
  if (status === 401 || /invalid access token|token.*(expired|invalid)|credential/i.test(detail))
    return "Token inválido ou expirado: gere outro no Databricks e atualize o Secret DATABRICKS_TOKEN.";
  if (/scope/i.test(detail))
    return "O token não tem o escopo necessário: gere um token com escopo SQL completo.";
  return "Confira se o token tem acesso ao SQL Warehouse informado e SELECT nas tabelas.";
}

/** Final do token para conferir qual está em uso, sem expor o valor. */
export function tokenHint(token: string): string {
  return token.length > 8 ? `••••${token.slice(-4)}` : "••••";
}

/** Limpa formatações comuns ao colar o token: espaços, quebras, aspas e "Bearer ". */
export function cleanToken(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer/i, "");
}

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

/** Tempo máximo de espera por uma consulta, incluindo o SQL Warehouse ligar. */
export const DATABRICKS_TIMEOUT_MS = 150_000;
const RUNNING_STATES = new Set(["PENDING", "RUNNING"]);

export async function runDatabricksQuery(
  statement: string,
  params: QueryParam[] = [],
  options: {
    rowLimit?: number;
    config?: DatabricksConfig | undefined;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    pollIntervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<QueryResult> {
  const config = options.config ?? readDatabricksConfig();
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (options.timeoutMs ?? DATABRICKS_TIMEOUT_MS);
  const base = `https://${config.host}/api/2.0/sql/statements`;
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };

  const call = async (url: string, init: RequestInit): Promise<StatementResponse> => {
    let response: Response;
    try {
      response = await doFetch(url, { ...init, headers });
    } catch {
      throw new DatabricksError(
        "Não foi possível alcançar o Databricks. Confira o DATABRICKS_HOST.",
      );
    }
    const raw = await response.text().catch(() => "");
    let body: StatementResponse = {};
    try {
      body = raw ? (JSON.parse(raw) as StatementResponse) : {};
    } catch {
      body = {};
    }
    // Resposta original do Databricks (sem o token), para diagnosticar recusas.
    const detail = (body.message ?? body.error_code ?? raw)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    if (response.status === 401 || response.status === 403)
      throw new DatabricksError(
        `O Databricks recusou o acesso (HTTP ${response.status}${detail ? `: ${detail}` : ""}). ${explainRefusal(response.status, detail)}`,
      );
    if (!response.ok)
      throw new DatabricksError(
        `Databricks respondeu ${response.status}: ${detail || "erro sem detalhe"}`,
      );
    return body;
  };

  // Espera até 30 s na própria chamada; se o warehouse ainda estiver ligando ou a consulta
  // rodando, continua consultando o andamento até o tempo máximo.
  let body = await call(base, {
    method: "POST",
    body: JSON.stringify({
      warehouse_id: config.warehouseId,
      statement,
      parameters: params.map((p) => ({ name: p.name, value: p.value, type: p.type ?? "STRING" })),
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      disposition: "INLINE",
      format: "JSON_ARRAY",
      row_limit: options.rowLimit ?? 500,
    }),
  });
  while (RUNNING_STATES.has(body.status?.state ?? "") && body.statement_id) {
    if (Date.now() >= deadline) {
      await call(`${base}/${body.statement_id}/cancel`, { method: "POST" }).catch(() => undefined);
      throw new DatabricksError(
        "O SQL Warehouse não respondeu a tempo (pode estar ligando). Aguarde um minuto e tente de novo.",
      );
    }
    await sleep(options.pollIntervalMs ?? 3000);
    body = await call(`${base}/${body.statement_id}`, { method: "GET" });
  }
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

/** Colunas lidas da fato silver para a Auditoria de CT-es. */
export const CTE_LIST_COLUMNS = [
  "id_cte",
  "nr_cte",
  "nr_chave_acesso_cte",
  "dt_emissao",
  "nm_emitente",
  "nr_cnpj_cpf_emitente",
  "nm_envolvido",
  "nm_tomador",
  "nr_cnpj_cpf_tomador",
  "nm_remetente",
  "nr_cnpj_cpf_remetente",
  "nm_destinatario",
  "nr_cnpj_cpf_destinatario",
  "nm_municipio_inicio",
  "sg_uf_inicio",
  "nm_municipio_termino",
  "sg_uf_termino",
  "cd_cfop",
  "vl_total_prestacao_servico",
  "vl_total_carga",
  "nr_notas_fiscais",
  "nr_chaves_acesso_notas",
  "ds_componentes_valor_prestacao",
  "ds_quantidades_carga",
] as const;

export type CteListFilters = {
  /** Emissão inicial (YYYY-MM-DD, horário de Brasília). */
  from: string;
  /** Emissão final, inclusiva (YYYY-MM-DD, horário de Brasília). */
  to: string;
  search?: string | undefined;
  carrierCnpj?: string | undefined;
  branchCnpj?: string | undefined;
  limit?: number | undefined;
};

export const CTE_LIST_MAX_ROWS = 500;

/**
 * Monta a consulta da lista de CT-es. O texto SQL é fixo; filtros entram só como
 * parâmetros nomeados. Registros apagados na origem (fl_deleted) ficam de fora.
 */
export function buildCteListQuery(filters: CteListFilters): {
  statement: string;
  params: QueryParam[];
  limit: number;
} {
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 200), 1), CTE_LIST_MAX_ROWS);
  const t = CTE_SOURCE_TABLES;
  const where = [
    "NOT fl_deleted",
    // Só CT-es com a Rede ANCORA como tomadora do frete: raiz do CNPJ do tomador
    // igual à de um CD da lista oficial (cobre as filiais de cada empresa).
    "substr(nr_cnpj_cpf_tomador, 1, 8) IN (SELECT DISTINCT substr(regexp_replace(cnpj, '[^0-9]', ''), 1, 8)" +
      ` FROM ${t.cdsAncora} WHERE cnpj IS NOT NULL)`,
    "dt_emissao >= to_utc_timestamp(:from_date, 'America/Sao_Paulo')",
    "dt_emissao < to_utc_timestamp(date_add(:to_date, 1), 'America/Sao_Paulo')",
  ];
  const params: QueryParam[] = [
    { name: "from_date", value: filters.from, type: "DATE" },
    { name: "to_date", value: filters.to, type: "DATE" },
  ];
  const search = filters.search?.trim();
  if (search) {
    where.push(
      "(nr_chave_acesso_cte = :search OR TRIM(LEADING '0' FROM nr_cte) = TRIM(LEADING '0' FROM :search)" +
        " OR nr_notas_fiscais LIKE :search_like OR nr_chaves_acesso_notas LIKE :search_like" +
        " OR upper(nm_destinatario) LIKE upper(:search_like))",
    );
    params.push({ name: "search", value: search });
    params.push({ name: "search_like", value: `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` });
  }
  const carrier = filters.carrierCnpj?.replace(/\D/g, "");
  if (carrier) {
    where.push("nr_cnpj_cpf_emitente = :carrier_cnpj");
    params.push({ name: "carrier_cnpj", value: carrier });
  }
  const branch = filters.branchCnpj?.replace(/\D/g, "");
  if (branch) {
    where.push(
      ":branch_cnpj IN (nr_cnpj_cpf_tomador, nr_cnpj_cpf_destinatario, nr_cnpj_cpf_remetente)",
    );
    params.push({ name: "branch_cnpj", value: branch });
  }
  // 1) CT-es do filtro na fato silver; 2) só para eles, dados das tabelas bronze:
  // e-mail e município do remetente, município do destinatário e peso bruto das NF-es.
  const statement = [
    `WITH base AS (SELECT ${CTE_LIST_COLUMNS.join(", ")} FROM ${t.conhecimentos}`,
    ` WHERE ${where.join(" AND ")} ORDER BY dt_emissao DESC, id_cte DESC LIMIT ${limit + 1}),`,
    " rem AS (SELECT r.id_cte_cabecalho AS id_cte,",
    " max_by(nullif(trim(r.email), ''), r.dh_insert) AS email,",
    " max_by(r.nome_municipio, r.dh_insert) AS municipio, max_by(r.uf, r.dh_insert) AS uf",
    ` FROM ${t.remetente} r JOIN base b ON r.id_cte_cabecalho = b.id_cte GROUP BY 1),`,
    " dst AS (SELECT d.id_cte_cabecalho AS id_cte,",
    " max_by(d.nome_municipio, d.dh_insert) AS municipio, max_by(d.uf, d.dh_insert) AS uf",
    ` FROM ${t.destinatario} d JOIN base b ON d.id_cte_cabecalho = b.id_cte GROUP BY 1),`,
    " nfk AS (SELECT DISTINCT id_cte, trim(k) AS chave_nfe FROM base",
    " LATERAL VIEW explode(split(nr_chaves_acesso_notas, '\\\\|')) x AS k",
    " WHERE nr_chaves_acesso_notas IS NOT NULL),",
    " nfp AS (SELECT c.chave_acesso, max(tr.peso_bruto) AS peso_bruto",
    ` FROM ${t.nfeCabecalho} c JOIN ${t.nfeTransporte} tr ON tr.id_nfe_cabecalho = c.id`,
    " WHERE c.chave_acesso IN (SELECT chave_nfe FROM nfk) GROUP BY 1),",
    " nf AS (SELECT k.id_cte, count(*) AS nf_total, count_if(p.peso_bruto > 0) AS nf_com_peso,",
    " sum(CASE WHEN p.peso_bruto > 0 THEN p.peso_bruto END) AS nf_peso_bruto",
    " FROM nfk k LEFT JOIN nfp p ON p.chave_acesso = k.chave_nfe GROUP BY 1)",
    " SELECT b.*, rem.email AS remetente_email, rem.municipio AS remetente_municipio,",
    " rem.uf AS remetente_uf, dst.municipio AS destinatario_municipio, dst.uf AS destinatario_uf,",
    " nf.nf_total, nf.nf_com_peso, nf.nf_peso_bruto",
    " FROM base b LEFT JOIN rem ON rem.id_cte = b.id_cte LEFT JOIN dst ON dst.id_cte = b.id_cte",
    " LEFT JOIN nf ON nf.id_cte = b.id_cte ORDER BY b.dt_emissao DESC, b.id_cte DESC",
  ].join("");
  return { statement, params, limit };
}

/** Lista de CT-es da origem (até `limit`; `truncated` indica que havia mais). */
export async function listSourceCtes(filters: CteListFilters, config?: DatabricksConfig) {
  const { statement, params, limit } = buildCteListQuery(filters);
  const result = await runDatabricksQuery(statement, params, { config, rowLimit: limit + 1 });
  return {
    rows: result.rows.slice(0, limit),
    truncated: result.truncated || result.rows.length > limit,
  };
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
