import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inspectCteSource, type CteSourceReport } from "@/lib/cte-source.functions";
import { errorMessage } from "@/lib/audit-schemas";

/** Teste de conexão com a base original de CT-es (Databricks), somente leitura. */
export function CteSourcePanel({ admin }: { admin: boolean }) {
  const inspect = useServerFn(inspectCteSource);
  const [report, setReport] = useState<CteSourceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setReport(await inspect());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const status = !report
    ? { text: "Não verificada", tag: "gray" }
    : !report.configured
      ? { text: "Secrets pendentes", tag: "amber" }
      : report.tables.every((t) => t.ok)
        ? { text: "Conectada", tag: "green" }
        : { text: "Com falhas", tag: "red" };

  return (
    <div className="cte-source">
      <div className="parameter-lines">
        <div>
          <b>Base original de CT-es (Databricks)</b>
          <span>
            {report?.configured === false
              ? `Cadastre nos Secrets do Lovable: ${report.missingSecrets.join(", ")}.`
              : "Consulta somente leitura às tabelas prd_ancora.003_broker_nfe_bronze."}
          </span>
          <span className={`tag ${status.tag}`}>{status.text}</span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={!admin || busy}
        title={admin ? undefined : "Somente administradores"}
      >
        <RefreshCw />
        {busy ? "Testando…" : "Testar conexão"}
      </Button>
      {error && (
        <p className="empty" role="alert">
          {error}
        </p>
      )}
      {report?.tables.map((t) => (
        <details key={t.table} className="cte-source-table" open={!t.ok}>
          <summary>
            <b>{t.label}</b> <code>{t.table}</code>{" "}
            <span className={`tag ${t.ok ? "green" : "red"}`}>
              {t.ok ? `${t.columns.length} colunas` : "Falhou"}
            </span>
          </summary>
          {t.ok ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Coluna</th>
                    <th>Tipo</th>
                    {t.sample.map((_, i) => (
                      <th key={i}>Amostra {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.columns.map((c) => (
                    <tr key={c.name}>
                      <td title={c.comment || undefined}>{c.name}</td>
                      <td>{c.type}</td>
                      {t.sample.map((row, i) => (
                        <td key={i}>{row[c.name] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">{t.error}</p>
          )}
        </details>
      ))}
      {report?.configured && (
        <p className="connection-instructions">
          Verificado em {new Date(report.checkedAt).toLocaleString("pt-BR")}. Nenhum dado é copiado
          para o Lovable Cloud.
        </p>
      )}
    </div>
  );
}
