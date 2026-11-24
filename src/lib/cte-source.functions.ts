import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  tables: SourceTableReport[];
};

const labels = {
  resumo: "CT-e (resumo e data de emissão)",
  nfes: "Ligação CT-e → NF",
  remetente: "Remetente (indústria)",
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
