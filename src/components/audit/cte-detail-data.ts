export type FreightAmount =
  | { status: "informed"; value: number }
  | { status: "missing" | "not-applicable" | "unidentified" | "pending" };

export interface CteRecord {
  id: string;
  number: string;
  key: string;
  issuedAt: string;
  carrier: string;
  branch: string;
  recipient: string;
  merchandise: FreightAmount;
  weight: string;
  volumes: string;
  invoices: string;
  freight: FreightAmount;
  audited: FreightAmount;
  invoice: string;
  status: string;
  tableVersion?: string;
  calculationMemory?: string;
  dacteUrl?: string;
  components: { name: string; carrier: FreightAmount; audited: FreightAmount }[];
  /** Dados de identificação lidos da base original (Databricks), quando disponíveis. */
  source?: CteSourceDetails;
  /** Preenchido pela auditoria automática (tabela comercial vigente). */
  auditOutcome?: CteAuditOutcome;
  /** true quando a auditoria usou dados aproximados (ex.: peso das NF-es, sem cubagem). */
  auditPreliminary?: boolean;
}

export interface CteSourceDetails {
  carrierCnpj: string;
  sender: string;
  senderCnpj: string;
  recipientCnpj: string;
  payer: string;
  payerCnpj: string;
  origin: string;
  destination: string;
  cfop: string;
  invoiceKeys: string[];
  senderEmail?: string;
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  /** Data de emissão (YYYY-MM-DD, Brasília), para achar a tabela vigente. */
  issuedOn?: string;
  /** Peso real usado na auditoria: do CT-e ou, sem ele, soma do peso bruto das NF-es. */
  realWeightKg?: number | null;
  realWeightSource?: "cte" | "nfe" | null;
  cubicMeters?: number | null;
  nfWeight?: {
    total: number;
    withWeight: number;
    grossKg: number | null;
    outsideBase?: number;
    outsideBaseAncora?: number;
  } | null;
}

/** Resultado da auditoria automática de um CT-e. */
export type CteAuditOutcome = "conforme" | "acima" | "abaixo" | "pendente";

export function formatFreight(amount: FreightAmount): string {
  if (amount.status === "informed") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      amount.value,
    );
  }
  return {
    missing: "Não informado",
    "not-applicable": "Não aplicável",
    unidentified: "Não identificado",
    pending: "Pendente de parametrização",
  }[amount.status];
}

export function getDacteUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
