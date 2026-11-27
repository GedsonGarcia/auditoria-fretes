import { COMMERCIAL_FIELDS, type CommercialValues, type WeightBand } from "./freight-rules";
import { versionToForm, type VersionLike } from "./table-versions";

/**
 * Valores por região de uma mesma tabela de frete: cada região é uma praça da transportadora
 * com seus próprios componentes comerciais e faixas de peso. Os valores da tabela em si
 * ("Padrão") valem para as localidades que não estão em nenhuma região.
 */
export type RegionForm = { squareId: string; values: CommercialValues; bands: WeightBand[] };

export type CommercialRecord = Record<
  string,
  { value: number | null; state: "provided" | "missing" | "not_applicable" }
>;

/** Converte os valores do formulário para o formato gravado em `commercial`. */
export function commercialToRecord(values: CommercialValues): CommercialRecord {
  return Object.fromEntries(
    COMMERCIAL_FIELDS.map((name) => {
      const item = values[name];
      const raw = item?.value.trim() ?? "";
      const value = raw === "" ? NaN : Number(raw.replace(",", "."));
      const state = item?.na ? "not_applicable" : Number.isFinite(value) ? "provided" : "missing";
      return [name, { value: state === "provided" ? value : null, state }];
    }),
  );
}

/** Faixas preenchidas, no formato gravado em `weight_bands`. */
export function bandsToRecord(bands: WeightBand[]) {
  return bands
    .filter((b) => b.weight || b.value)
    .map((b) => ({
      weight: b.weight ? Number(b.weight) : NaN,
      value: b.value ? Number(b.value) : NaN,
    }));
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Regiões gravadas na versão (coluna `regions`), prontas para o formulário. */
export function regionsFromVersion(version: VersionLike & { regions?: unknown }): RegionForm[] {
  if (!Array.isArray(version.regions)) return [];
  return version.regions.filter(isObject).flatMap((r) => {
    const squareId = typeof r["square_id"] === "string" ? r["square_id"] : "";
    if (!squareId) return [];
    const form = versionToForm({
      ...version,
      commercial: (r["commercial"] ?? {}) as VersionLike["commercial"],
      weight_bands: (r["weight_bands"] ?? []) as VersionLike["weight_bands"],
    });
    return [{ squareId, values: form.values, bands: form.bands }];
  });
}

/** Regiões do formulário no formato gravado em `regions`. */
export function regionsToRecord(regions: RegionForm[]) {
  return regions.map((r) => ({
    square_id: r.squareId,
    commercial: commercialToRecord(r.values),
    weight_bands: bandsToRecord(r.bands),
  }));
}

/** Há algum valor comercial preenchido? (tabela só com regiões deixa o "Padrão" vazio) */
export const hasProvidedValues = (values: CommercialValues) =>
  Object.values(values).some((v) => !v.na && v.value.trim() !== "");
