import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CteRecord } from "@/components/audit/cte-detail-data";
import { mapSilverCte } from "./cte-mapping";
import { cteListSchema } from "./cte-list-schema";

export type SourceTableReport = {
  table: string;
  label: string;
  ok: boolean;
  error?: string;
  columns: { name: string; type: string; comment: string }[];
  sample: Record<string, string | null>[];
};
export type CteSourceReport = {
  configured: boolean;
  missingSecrets: string[];
  checkedAt: string;
  /** Falha antes de consultar as tabelas (host, token, warehouse ou tempo esgotado). */
  connectionError?: string;
  tables: SourceTableReport[];
};

const labels = {
  conhecimentos: "CT-es do Broker (emissão, partes, NF-es, valores e componentes)",
  remetente: "Remetente do CT-e (e-mail e município)",
  destinatario: "Destinatário do CT-e (município)",
  nfeCabecalho: "NF-e (chave de acesso)",
  nfeTransporte: "Transporte da NF-e (peso bruto)",
} as const;

/**
 * Testa a conexão com a base original de CT-es no Databricks e devolve as colunas
 * reais e uma pequena amostra de cada tabela. Somente administradores; somente leitura.
 */
export const inspectCteSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CteSourceReport> => {
    const permission = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (permission.error || !permission.data)
      throw new Error("Somente administradores podem testar a conexão com a base de CT-es.");

    const db = await import("./databricks.server");
    const checkedAt = new Date().toISOString();
    const missingSecrets = db.missingDatabricksSecrets();
    if (missingSecrets.length) return { configured: false, missingSecrets, checkedAt, tables: [] };

    const config = db.readDatabricksConfig();
    const keys = Object.keys(db.CTE_SOURCE_TABLES) as (keyof typeof db.CTE_SOURCE_TABLES)[];
    // Consulta mínima primeiro: liga o SQL Warehouse e confere host, token e warehouse
    // uma vez só, com uma mensagem única se algo estiver errado.
    try {
      await db.runDatabricksQuery("SELECT 1", [], { config, rowLimit: 1 });
    } catch (error) {
      const message =
        error instanceof db.DatabricksError ? error.message : "Falha inesperada na consulta.";
      return {
        configured: true,
        missingSecrets: [],
        checkedAt,
        connectionError: message,
        tables: [],
      };
    }
    const tables = await Promise.all(
      keys.map(async (key): Promise<SourceTableReport> => {
        const base = { table: db.CTE_SOURCE_TABLES[key].replace(/`/g, ""), label: labels[key] };
        try {
          const columns = await db.describeSourceTable(key, config);
          const sample = await db.sampleSourceTable(key, 3, config);
          return { ...base, ok: true, columns, sample };
        } catch (error) {
          const message =
            error instanceof db.DatabricksError ? error.message : "Falha inesperada na consulta.";
          return { ...base, ok: false, error: message, columns: [], sample: [] };
        }
      }),
    );
    return { configured: true, missingSecrets: [], checkedAt, tables };
  });

export type CteListResult = {
  configured: boolean;
  missingSecrets: string[];
  records: CteRecord[];
  truncated: boolean;
  checkedAt: string;
};

/**
 * Lista CT-es da base original (fato silver no Databricks) para a Auditoria de CT-es.
 * Leitura sob demanda: nada é gravado no Lovable Cloud. Exige usuário com perfil ativo.
 */
export const listCtes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => cteListSchema.parse(value))
  .handler(async ({ context, data }): Promise<CteListResult> => {
    const roles = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roles.error) throw new Error("Não foi possível verificar as permissões.");
    if (!roles.data.length) throw new Error("Acesso pendente de autorização do administrador.");

    const db = await import("./databricks.server");
    const checkedAt = new Date().toISOString();
    const missingSecrets = db.missingDatabricksSecrets();
    if (missingSecrets.length)
      return { configured: false, missingSecrets, records: [], truncated: false, checkedAt };
    try {
      const { rows, truncated } = await db.listSourceCtes(data);
      return {
        configured: true,
        missingSecrets: [],
        records: rows.map(mapSilverCte),
        truncated,
        checkedAt,
      };
    } catch (error) {
      throw new Error(
        error instanceof db.DatabricksError ? error.message : "Falha inesperada na consulta.",
      );
    }
  });
