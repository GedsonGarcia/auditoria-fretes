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
  if (!raw || !/^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(raw)) return null;
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

type Quantity = { name: string; value: number | null };
const REAL_WEIGHT = /^(PESO( REAL| BRUTO| DECLARADO| AFERIDO| NOTA)?|KG)$/i;
const CUBIC = /^(M3|CUBAGEM|METROS CUBICOS)$/i;

/**
 * Peso informado no CT-e. A origem traz cada tipo de medida pelo nome
 * (ex.: "PESO REAL", "PESO CUBADO"); todos os pesos são mostrados, sem escolher um
 * como base de cálculo, pois essa regra pertence à tabela comercial.
 */
function formatCteWeight(quantities: Quantity[]): string | null {
  const weights = quantities.filter((q) => /PESO/i.test(q.name) && q.value !== null);
  if (!weights.length) return null;
  if (weights.length === 1) return numberBr(weights[0]!.value!, 2);
  return weights
    .map((q) => `${q.name.replace(/^PESO\s+/i, "").toLowerCase()} ${numberBr(q.value!, 2)}`)
    .join(" · ");
}

/** Peso das NF-es do CT-e (peso bruto da NF-e, tabela nfe_transporte). */
export type NfWeight = { total: number; withWeight: number; grossKg: number | null };

function readNfWeight(row: SilverCteRow): NfWeight | null {
  const total = parseSourceDecimal(row["nf_total"]);
  if (!total) return null;
  return {
    total,
    withWeight: parseSourceDecimal(row["nf_com_peso"]) ?? 0,
    grossKg: parseSourceDecimal(row["nf_peso_bruto"]),
  };
}

/**
 * Peso real usado na auditoria: o do CT-e quando a origem o traz; senão, a soma do
 * peso bruto das NF-es, só quando todas as NF-es do CT-e têm peso (nunca parcial).
 */
export function resolveRealWeight(
  quantities: Quantity[],
  nf: NfWeight | null,
): { kg: number; source: "cte" | "nfe" } | null {
  const fromCte = quantities.find((q) => REAL_WEIGHT.test(q.name.trim()) && (q.value ?? 0) > 0);
  if (fromCte) return { kg: fromCte.value!, source: "cte" };
  if (nf && nf.withWeight === nf.total && (nf.grossKg ?? 0) > 0)
    return { kg: nf.grossKg!, source: "nfe" };
  return null;
}

function formatNfWeight(nf: NfWeight | null): string {
  if (!nf || !nf.withWeight || nf.grossKg === null) return NOT_INFORMED;
  if (nf.withWeight === nf.total) return `${numberBr(nf.grossKg, 2)} (NF-e)`;
  return `Parcial: ${numberBr(nf.grossKg, 2)} em ${nf.withWeight} de ${nf.total} NF-es`;
}

/** "2 - SAO - SAO PAULO" → "SAO PAULO" (prefixos de rota que algumas transportadoras usam). */
export function cleanMunicipality(value: string): string {
  const parts = value.split(/\s+-\s+/);
  return (parts[parts.length - 1] ?? "").trim();
}

/** Data de emissão (YYYY-MM-DD) no horário de Brasília, para achar a tabela vigente. */
export function issuedOnDate(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function formatVolumes(quantities: Quantity[]): string {
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
  const nfWeight = readNfWeight(row);
  const realWeight = resolveRealWeight(quantities, nfWeight);
  const cubic = quantities.find((q) => CUBIC.test(q.name.trim()) && q.value !== null);
  const originCity =
    text(row, "remetente_municipio") || cleanMunicipality(text(row, "nm_municipio_inicio"));
  const originState = text(row, "remetente_uf") || text(row, "sg_uf_inicio");
  const destinationCity =
    text(row, "destinatario_municipio") || cleanMunicipality(text(row, "nm_municipio_termino"));
  const destinationState = text(row, "destinatario_uf") || text(row, "sg_uf_termino");
  return {
    id: text(row, "id_cte") || key,
    number: text(row, "nr_cte").replace(/^0+(?=\d)/, "") || NOT_INFORMED,
    key: key || NOT_INFORMED,
    issuedAt: formatIssuedAt(row["dt_emissao"]),
    carrier: text(row, "nm_emitente") || NOT_INFORMED,
    branch: text(row, "nm_envolvido") || NOT_INFORMED,
    recipient: text(row, "nm_destinatario") || NOT_INFORMED,
    merchandise: toFreightAmount(row["vl_total_carga"]),
    weight: formatCteWeight(quantities) ?? formatNfWeight(nfWeight),
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
      senderEmail: text(row, "remetente_email"),
      origin: placeLabel(originCity, originState),
      originCity,
      originState,
      destination: placeLabel(destinationCity, destinationState),
      destinationCity,
      destinationState,
      issuedOn: issuedOnDate(row["dt_emissao"]),
      realWeightKg: realWeight?.kg ?? null,
      realWeightSource: realWeight?.source ?? null,
      cubicMeters: cubic?.value ?? null,
      nfWeight,
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
