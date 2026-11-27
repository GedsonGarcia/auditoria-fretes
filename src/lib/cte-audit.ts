import type { CteAuditOutcome, CteRecord, FreightAmount } from "@/components/audit/cte-detail-data";
import { CUBAGE_FIELD, readValue, simulate } from "./freight-rules";
import { GENERAL_LOCALITY, normalizeLocality } from "./square-localities";
import { currentVersions, versionNumber, versionToForm, type VersionLike } from "./table-versions";
import { describeWeightGap } from "./cte-mapping";
import { hasProvidedValues, regionsFromVersion, type RegionForm } from "./table-regions";

/** Diferença até a qual o frete cobrado é considerado igual ao da tabela (arredondamento). */
export const AUDIT_TOLERANCE = 0.01;

export type AuditVersion = VersionLike & {
  branch_id: string;
  square_id: string | null;
  valid_from: string;
  valid_until: string | null;
  /** Valores por região (praça) dentro da mesma tabela. */
  regions?: unknown;
};
export type AuditContext = {
  carriers: { id: string; cnpj: string; legal_name: string; display_name: string }[];
  branches: { id: string; cnpj: string; name: string }[];
  squares: { id: string; name: string; state: string }[];
  localities: { square_id: string; name: string }[];
  versions: AuditVersion[];
};

const digits = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kg = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const dateBr = (iso: string) => iso.split("-").reverse().join("/");

/** Nomes com que os componentes aparecem nos CT-es, para comparar lado a lado. */
const COMPONENT_ALIASES: Record<string, string[]> = {
  frete_peso: ["FRETE PESO", "VALOR PESO", "PESO"],
  frete_valor: ["FRETE VALOR"],
  gris: ["GRIS", "VALOR GRIS", "GRIS/ADEME"],
  ad_valorem: ["AD VALOREM", "ADVALOREM", "AD. VALOREN", "ADV"],
  pedagio: ["PEDAGIO", "VALOR PEDAGIO"],
  despacho: ["DESPACHO", "VALOR DESPACHO", "COLETA"],
  sec_cat: ["SEC/CAT", "SECCAT", "VALOR SEC CAT", "CAT"],
  tas: ["TAS"],
  tde: ["TDE", "VALOR TDE", "ENTREGA (TDE)"],
  tda: ["TDA"],
  trt: ["TRT"],
  emex: ["EMEX"],
  trf: ["TRF"],
  tac: ["TAC", "ADICIONAL DE FRETE", "ADICIONAL FRETE", "TAXA ADICIONAL"],
};
const aliasKey = (name: string) => {
  const n = normalizeLocality(name).toUpperCase();
  return Object.entries(COMPONENT_ALIASES).find(([, names]) => names.includes(n))?.[0];
};

function pending(record: CteRecord, reason: string): CteRecord {
  return {
    ...record,
    audited: { status: "pending" },
    auditOutcome: "pendente",
    auditPreliminary: false,
    status: `Pendente: ${reason}`,
    calculationMemory: `Auditoria não calculada: ${reason}. Nenhum valor foi estimado.`,
  };
}

type Square = AuditContext["squares"][number];
type Match = {
  version: AuditVersion;
  level: number;
  square?: Square | undefined;
  region?: RegionForm | undefined;
};

/** Quanto a praça atende a localidade: 3 = cidade listada, 2 = praça "Geral" da UF. */
function squareLevel(
  ctx: AuditContext,
  squareId: string,
  city: string,
  state: string,
): { level: number; square: Square } | null {
  const square = ctx.squares.find((s) => s.id === squareId);
  if (!square || square.state.trim().toUpperCase() !== state) return null;
  const names = ctx.localities.filter((l) => l.square_id === square.id).map((l) => l.name);
  if (city && names.some((n) => normalizeLocality(n) === city)) return { level: 3, square };
  if (names.includes(GENERAL_LOCALITY)) return { level: 2, square };
  return null;
}

/**
 * Tabela vigente para o CT-e: mesma transportadora e filial, vigência cobrindo a data de
 * emissão, e praça da outra ponta da rota (localidade exata > praça "Geral" da UF >
 * tabela sem praça). Dentro da tabela, a região (praça) que atende a localidade define os
 * valores; sem região, valem os valores padrão da tabela. Empate fica pendente, sem escolher.
 */
export function findTableVersion(
  ctx: AuditContext,
  carrierId: string,
  branchId: string,
  issuedOn: string,
  place: { city: string; state: string },
): { match?: Match; reason?: string } {
  const candidates = currentVersions(ctx.versions).filter(
    (v) =>
      v.carrier_id === carrierId &&
      v.branch_id === branchId &&
      v.valid_from <= issuedOn &&
      (!v.valid_until || v.valid_until >= issuedOn),
  );
  if (!candidates.length) return { reason: "sem tabela vigente para a transportadora e filial" };
  const city = normalizeLocality(place.city);
  const state = place.state.trim().toUpperCase();
  const matches: Match[] = [];
  for (const version of candidates) {
    const base = version.square_id ? squareLevel(ctx, version.square_id, city, state) : null;
    if (version.square_id && !base) continue;
    const regionHits = regionsFromVersion(version).flatMap((region) => {
      const hit = squareLevel(ctx, region.squareId, city, state);
      return hit ? [{ version, level: hit.level, square: hit.square, region }] : [];
    });
    const topRegion = Math.max(0, ...regionHits.map((m) => m.level));
    const bestRegions = regionHits.filter((m) => m.level === topRegion);
    if (bestRegions.length > 1)
      return { reason: "mais de uma região da tabela atende a localidade" };
    const baseLevel = base?.level ?? 1;
    // A região vale quando atende a localidade tão bem quanto (ou melhor que) a tabela.
    if (bestRegions[0] && topRegion >= baseLevel) matches.push(bestRegions[0]);
    else matches.push({ version, level: baseLevel, square: base?.square });
  }
  if (!matches.length)
    return { reason: `nenhuma praça da tabela atende ${place.city || "?"} / ${state || "?"}` };
  const best = Math.max(...matches.map((m) => m.level));
  const top = matches.filter((m) => m.level === best);
  if (top.length > 1) return { reason: "mais de uma tabela aplicável ao CT-e" };
  return { match: top[0]! };
}

/**
 * Audita um CT-e com a tabela comercial cadastrada (motor `simulate`).
 * Só calcula com dados reais: peso real (CT-e ou soma do peso bruto de todas as NF-es),
 * valor da mercadoria e uma única tabela vigente. Sem isso, fica pendente com o motivo.
 * Taxas condicionais (TDE, TDA, TRT, EMEX, TRF) não são aplicadas: a origem não informa
 * se o destino as exige.
 */
export function auditCte(record: CteRecord, ctx: AuditContext): CteRecord {
  const src = record.source;
  if (!src) return record;
  if (record.freight.status !== "informed") return pending(record, "frete do CT-e não informado");
  if (record.merchandise.status !== "informed")
    return pending(record, "valor da mercadoria não informado");
  if (!src.realWeightKg) return pending(record, describeWeightGap(src.nfWeight));
  if (!src.issuedOn) return pending(record, "data de emissão não informada");

  const carrier = ctx.carriers.find((c) => digits(c.cnpj) === digits(src.carrierCnpj));
  if (!carrier) return pending(record, `transportadora não cadastrada (CNPJ ${src.carrierCnpj})`);

  const asRecipient = ctx.branches.find((b) => digits(b.cnpj) === digits(src.recipientCnpj));
  const asSender = ctx.branches.find((b) => digits(b.cnpj) === digits(src.senderCnpj));
  const branch = asRecipient ?? asSender;
  if (!branch) return pending(record, "filial Rede ANCORA não identificada no CT-e");
  // A praça é a outra ponta da rota: a origem quando a filial recebe, o destino quando envia.
  const place = asRecipient
    ? { city: src.originCity ?? "", state: src.originState ?? "" }
    : { city: src.destinationCity ?? "", state: src.destinationState ?? "" };

  const found = findTableVersion(ctx, carrier.id, branch.id, src.issuedOn, place);
  if (!found.match) return pending(record, found.reason ?? "tabela não identificada");
  const { version, square, region } = found.match;
  const form = versionToForm(version);
  if (region) {
    form.values = region.values;
    form.bands = region.bands;
  } else if (regionsFromVersion(version).length && !hasProvidedValues(form.values))
    return pending(
      record,
      `nenhuma região da tabela atende ${place.city || "?"} / ${place.state || "?"}`,
    );
  if (form.config.icms === "por_dentro")
    return pending(record, "tabela com ICMS por dentro e alíquota não disponível na origem");

  const cubageFactor = readValue(form.values, CUBAGE_FIELD);
  const needsCubage = form.config.peso === "taxado" && cubageFactor !== null && cubageFactor > 0;
  const missingCubage = needsCubage && src.cubicMeters == null;
  const result = simulate(
    {
      nf: record.merchandise.value,
      pesoReal: src.realWeightKg,
      m3: src.cubicMeters ?? 0,
      condicionais: false,
      aliquotaIcms: 0,
    },
    form.values,
    form.bands,
    form.rules,
    form.config,
  );

  const audited: FreightAmount = { status: "informed", value: result.total };
  const charged = record.freight.value;
  const diff = Math.round((charged - result.total) * 100) / 100;
  const outcome: CteAuditOutcome =
    Math.abs(diff) <= AUDIT_TOLERANCE ? "conforme" : diff > 0 ? "acima" : "abaixo";
  const preliminary = src.realWeightSource === "nfe" || missingCubage;

  const auditedByKey = new Map<string, { label: string; value: number }>([
    ["frete_peso", { label: "Frete Peso", value: result.fretePeso }],
    ["frete_valor", { label: "Frete Valor", value: result.freteValor }],
    ...result.lines.map((l) => [l.key, { label: l.label, value: l.value }] as const),
  ]);
  const used = new Set<string>();
  const components: CteRecord["components"] = record.components.map((c) => {
    const key = aliasKey(c.name);
    const hit = key ? auditedByKey.get(key) : undefined;
    if (key && hit) used.add(key);
    return {
      ...c,
      audited: hit ? { status: "informed", value: hit.value } : { status: "not-applicable" },
    };
  });
  for (const [key, line] of auditedByKey) {
    if (used.has(key) || line.value === 0) continue;
    components.push({
      name: line.label,
      carrier: record.components.length ? { status: "not-applicable" } : { status: "missing" },
      audited: { status: "informed", value: line.value },
    });
  }

  const weightNote =
    src.realWeightSource === "nfe"
      ? `${kg(src.realWeightKg)} (soma do peso bruto das ${src.nfWeight?.total ?? ""} NF-e(s); o CT-e não traz o peso)`
      : `${kg(src.realWeightKg)} (peso real do CT-e)`;
  const memory = [
    `Peso real: ${weightNote}.`,
    needsCubage
      ? missingCubage
        ? `Cubagem não informada na origem: peso cubado não considerado (fator ${cubageFactor}).`
        : `Peso cubado: ${kg(result.pesoCubado)} (fator ${cubageFactor}).`
      : null,
    `Peso considerado: ${kg(result.pesoConsiderado)}. Valor da mercadoria: ${brl(record.merchandise.value)}.`,
    `Frete peso ${brl(result.fretePeso)} + frete valor ${brl(result.freteValor)} → frete base ${brl(result.freteBase)}${result.minimoAplicado ? " (frete mínimo aplicado)" : ""}.`,
    ...result.lines.map((l) => `${l.label}: ${brl(l.value)} — ${l.detail}.`),
    "Taxas condicionais (TDE, TDA, TRT, EMEX, TRF) não aplicadas: a origem não informa se o destino as exige.",
    `Total pela tabela: ${brl(result.total)}. Cobrado no CT-e: ${brl(charged)}. Diferença: ${brl(diff)}.`,
    preliminary ? "Resultado preliminar: confira o peso taxado e a cubagem no DACTE." : null,
  ]
    .filter(Boolean)
    .join("\n");

  const placeLabel = square
    ? `${region ? "região" : "praça"} ${square.name} · ${square.state}`
    : regionsFromVersion(version).length
      ? "valores padrão (fora das regiões)"
      : "todas as praças";
  const validity = `${dateBr(version.valid_from)} a ${version.valid_until ? dateBr(version.valid_until) : "sem término"}`;
  const statusText = {
    conforme: "Conforme a tabela",
    acima: `Cobrado ${brl(diff)} acima da tabela`,
    abaixo: `Cobrado ${brl(-diff)} abaixo da tabela`,
    pendente: "",
  }[outcome];

  return {
    ...record,
    audited,
    components,
    auditOutcome: outcome,
    auditPreliminary: preliminary,
    status: preliminary ? `${statusText} (preliminar)` : statusText,
    tableVersion: `Tabela ${carrier.display_name || carrier.legal_name} · ${branch.name} · ${placeLabel} · v${versionNumber(ctx.versions, version.id)} · vigência ${validity}`,
    calculationMemory: memory,
  };
}
