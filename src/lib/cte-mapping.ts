import type { CteRecord, FreightAmount } from "@/components/audit/cte-detail-data";

/** Linha da fato silver `tb_fato_broker_cte_conhecimento_transporte` (valores em texto). */
export type SilverCteRow = Record<string, string | null | undefined>;

/** Situação inicial de um CT-e vindo da origem: ainda não auditado. */
export const CTE_PENDING_STATUS = "Pendente de auditoria";

const NOT_INFORMED = "Não informado";
const LIST_SEPARATOR = /\s*\|\s*/;

function text(row: SilverCteRow, column: string): string {
  return row[column]?.trim() ?? "";
}

/** Converte um decimal da origem ("1234.56") sem estimar ausências. */
export function parseSourceDecimal(value: string | null | undefined): number | null {
  const raw = value?.trim();
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toFreightAmount(value: string | null | undefined): FreightAmount {
  const parsed = parseSourceDecimal(value);
  return parsed === null ? { status: "missing" } : { status: "informed", value: parsed };
}

/**
 * Lê listas no formato da silver: "NOME - 12.34 | OUTRO - 0.00".
 * Itens fora do padrão são preservados com valor ausente, nunca descartados em silêncio.
 */
export function parseNamedValues(
  value: string | null | undefined,
): { name: string; value: number | null }[] {
  const raw = value?.trim();
  if (!raw) return [];
  return raw
    .split(LIST_SEPARATOR)
    .filter(Boolean)
    .map((item) => {
      const match = /^(.*\S)\s+-\s+(-?\d+(?:\.\d+)?)$/.exec(item);
      return match
        ? { name: match[1]!.trim(), value: parseSourceDecimal(match[2]) }
        : { name: item.trim(), value: null };
    });
}

export function splitSourceList(value: string | null | undefined): string[] {
  const raw = value?.trim();
  return raw ? raw.split(LIST_SEPARATOR).filter(Boolean) : [];
}

const numberBr = (value: number, digits: number) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Data e hora de emissão no horário de Brasília (dd/mm/aaaa hh:mm). */
export function formatIssuedAt(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return NOT_INFORMED;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Peso informado no CT-e. A origem traz cada tipo de medida pelo nome
 * (ex.: "PESO REAL", "PESO CUBADO"); todos os pesos são mostrados, sem escolher um
 * como base de cálculo, pois essa regra pertence à tabela comercial.
 */
function formatWeight(quantities: { name: string; value: number | null }[]): string {
  const weights = quantities.filter((q) => /PESO/i.test(q.name) && q.value !== null);
  if (!weights.length) return NOT_INFORMED;
  if (weights.length === 1) return numberBr(weights[0]!.value!, 2);
  return weights
    .map((q) => `${q.name.replace(/^PESO\s+/i, "").toLowerCase()} ${numberBr(q.value!, 2)}`)
    .join(" · ");
}

function formatVolumes(quantities: { name: string; value: number | null }[]): string {
  const volumes = quantities.filter((q) => /VOLUME/i.test(q.name) && q.value !== null);
  if (!volumes.length) return NOT_INFORMED;
  const total = volumes.reduce((sum, q) => sum + q.value!, 0);
  return numberBr(total, Number.isInteger(total) ? 0 : 2);
}

function placeLabel(city: string, state: string): string {
  return [city, state].filter(Boolean).join(" / ");
}

/**
 * Converte uma linha da fato silver em CteRecord.
 * Nada é calculado: frete auditado e componentes auditados ficam "pendentes" até a
 * aplicação da tabela comercial; campos ausentes na origem ficam "Não informado".
 * A fatura associada vem do Lovable Cloud (faturas importadas), não da origem.
 */
export function mapSilverCte(row: SilverCteRow): CteRecord {
  const quantities = parseNamedValues(row["ds_quantidades_carga"]);
  const components = parseNamedValues(row["ds_componentes_valor_prestacao"]).map((c) => ({
    name: c.name,
    carrier: (c.value === null
      ? { status: "missing" }
      : { status: "informed", value: c.value }) as FreightAmount,
    audited: { status: "pending" } as FreightAmount,
  }));
  const invoiceNumbers = splitSourceList(row["nr_notas_fiscais"]).map((n) =>
    n.replace(/^0+(?=\d)/, ""),
  );
  const key = text(row, "nr_chave_acesso_cte");
  return {
    id: text(row, "id_cte") || key,
    number: text(row, "nr_cte").replace(/^0+(?=\d)/, "") || NOT_INFORMED,
    key: key || NOT_INFORMED,
    issuedAt: formatIssuedAt(row["dt_emissao"]),
    carrier: text(row, "nm_emitente") || NOT_INFORMED,
    branch: text(row, "nm_envolvido") || NOT_INFORMED,
    recipient: text(row, "nm_destinatario") || NOT_INFORMED,
    merchandise: toFreightAmount(row["vl_total_carga"]),
    weight: formatWeight(quantities),
    volumes: formatVolumes(quantities),
    invoices: invoiceNumbers.length ? invoiceNumbers.join(", ") : NOT_INFORMED,
    freight: toFreightAmount(row["vl_total_prestacao_servico"]),
    audited: { status: "pending" },
    invoice: "",
    status: CTE_PENDING_STATUS,
    components,
    source: {
      carrierCnpj: text(row, "nr_cnpj_cpf_emitente"),
      sender: text(row, "nm_remetente"),
      senderCnpj: text(row, "nr_cnpj_cpf_remetente"),
      recipientCnpj: text(row, "nr_cnpj_cpf_destinatario"),
      payer: text(row, "nm_tomador"),
      payerCnpj: text(row, "nr_cnpj_cpf_tomador"),
      origin: placeLabel(text(row, "nm_municipio_inicio"), text(row, "sg_uf_inicio")),
      destination: placeLabel(text(row, "nm_municipio_termino"), text(row, "sg_uf_termino")),
      cfop: text(row, "cd_cfop"),
      invoiceKeys: splitSourceList(row["nr_chaves_acesso_notas"]),
    },
  };
}

/**
 * Associa CT-es às faturas importadas pela chave de acesso (44 dígitos).
 * Sem chave na fatura não há associação: o CT-e fica "Sem fatura".
 */
export function linkInvoices(
  records: CteRecord[],
  items: { cte_key: string | null; invoice_id: string }[],
  invoices: { id: string; number: string }[],
): CteRecord[] {
  const numberById = new Map(invoices.map((i) => [i.id, i.number]));
  const byKey = new Map<string, Set<string>>();
  for (const item of items) {
    const key = item.cte_key?.replace(/\D/g, "");
    const number = numberById.get(item.invoice_id);
    if (!key || !number) continue;
    byKey.set(key, (byKey.get(key) ?? new Set()).add(number));
  }
  return records.map((record) => {
    const numbers = byKey.get(record.key);
    return numbers ? { ...record, invoice: [...numbers].join(", ") } : record;
  });
}
