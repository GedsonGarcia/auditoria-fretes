import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  DEFAULT_RULES,
  describeRule,
  missingFields,
  TAC_FIXED_FIELD,
  TAC_PERCENT_FIELD,
  simulate,
  type CommercialValues,
} from "./freight-rules";

const values: CommercialValues = {
  "FRETE PESO (GATILHO)": { value: "0.50", na: false },
  "FRETE VALOR (% SOBRE $ NF)": { value: "0.5", na: false },
  "FRETE MÍNIMO": { value: "60", na: false },
  "GRIS (% SOBRE $ NF)": { value: "0.3", na: false },
  "GRIS MÍNIMO": { value: "5", na: false },
  "AD VALOREM (% SOBRE $ NF)": { value: "0", na: true },
  PEDÁGIO: { value: "4.5", na: false },
  "DESPACHO (OU COLETA)": { value: "12", na: false },
  "FATOR DE CUBAGEM": { value: "300", na: false },
  TDE: { value: "80", na: false },
};
const bands = [
  { weight: "50", value: "40" },
  { weight: "100", value: "70" },
];

describe("simulate", () => {
  it("usa o peso cubado quando maior e cobra o excedente acima da última faixa", () => {
    // 0,5 m³ × 300 = 150 kg cubado > 120 kg real → 70 + 50 kg × 0,50 = 95
    const r = simulate(
      { nf: 10000, pesoReal: 120, m3: 0.5, condicionais: false, aliquotaIcms: 0 },
      values,
      bands,
      DEFAULT_RULES,
      DEFAULT_CONFIG,
    );
    expect(r.pesoConsiderado).toBe(150);
    expect(r.fretePeso).toBe(95);
    expect(r.freteValor).toBe(50);
    expect(r.freteBase).toBe(145);
    const get = (k: string) => r.lines.find((l) => l.key === k)?.value;
    expect(get("gris")).toBe(30);
    expect(get("pedagio")).toBe(9); // 150 kg = 2 frações
    expect(get("despacho")).toBe(12);
    expect(get("ad_valorem")).toBeUndefined(); // não aplicável
    expect(get("tde")).toBeUndefined(); // condicional desligada
    expect(r.total).toBe(196);
  });

  it("aplica o frete mínimo, o mínimo do GRIS e o ICMS por dentro", () => {
    const r = simulate(
      { nf: 1000, pesoReal: 20, m3: 0, condicionais: true, aliquotaIcms: 12 },
      values,
      bands,
      DEFAULT_RULES,
      { ...DEFAULT_CONFIG, icms: "por_dentro" },
    );
    expect(r.minimoAplicado).toBe(true);
    expect(r.freteBase).toBe(60);
    expect(r.lines.find((l) => l.key === "gris")?.value).toBe(5);
    expect(r.lines.find((l) => l.key === "tde")?.value).toBe(80);
    expect(r.subtotal).toBe(161.5);
    expect(r.icms).toBe(22.02);
  });
});

describe("describeRule", () => {
  it("escreve a regra com os valores da tabela comercial", () => {
    const gris = DEFAULT_RULES.find((r) => r.key === "gris")!;
    expect(describeRule(gris, values).replace(/\u00a0/g, " ")).toBe(
      "Maior entre 0,3% × valor da NF e R$ 5,00",
    );
  });
});

describe("TAC — adicional de frete", () => {
  const input = { nf: 10000, pesoReal: 120, m3: 0.5, condicionais: false, aliquotaIcms: 0 };
  const tac = DEFAULT_RULES.find((r) => r.key === "tac")!;
  const run = (extra: CommercialValues) =>
    simulate(input, { ...values, ...extra }, bands, DEFAULT_RULES, DEFAULT_CONFIG);

  it("em %, cobra sobre o frete sem imposto (frete + taxas)", () => {
    // frete sem imposto 196 × 10% = 19,60 → 215,60
    const r = run({
      [TAC_PERCENT_FIELD]: { value: "10", na: false },
      [TAC_FIXED_FIELD]: { value: "", na: true },
    });
    expect(r.lines.find((l) => l.key === "tac")?.value).toBe(19.6);
    expect(r.total).toBe(215.6);
  });

  // Exemplos da área de transporte: frete sem imposto R$ 40,00 e ICMS por dentro de 12%.
  const flat = (tac: CommercialValues) =>
    simulate(
      { nf: 1000, pesoReal: 10, m3: 0, condicionais: false, aliquotaIcms: 12 },
      { "FRETE MÍNIMO": { value: "40", na: false }, ...tac },
      [],
      DEFAULT_RULES,
      { ...DEFAULT_CONFIG, icms: "por_dentro" },
    );

  it("TAC de 2% sobre R$ 40,00 = R$ 0,80; o ICMS incide sobre R$ 40,80", () => {
    const r = flat({
      [TAC_PERCENT_FIELD]: { value: "2", na: false },
      [TAC_FIXED_FIELD]: { value: "", na: true },
    });
    expect(r.lines.find((l) => l.key === "tac")?.value).toBe(0.8);
    expect(r.subtotal).toBe(40.8);
    expect(r.icms).toBe(5.56); // 40,80 / 0,88 − 40,80
    expect(r.total).toBe(46.36);
  });

  it("TAC de R$ 10,00 sobre R$ 40,00; o ICMS incide sobre R$ 50,00", () => {
    const r = flat({
      [TAC_PERCENT_FIELD]: { value: "", na: true },
      [TAC_FIXED_FIELD]: { value: "10", na: false },
    });
    expect(r.subtotal).toBe(50);
    expect(r.icms).toBe(6.82); // 50 / 0,88 − 50
  });

  it("em R$, cobra o valor fixo por CT-e", () => {
    const r = run({
      [TAC_PERCENT_FIELD]: { value: "", na: true },
      [TAC_FIXED_FIELD]: { value: "25", na: false },
    });
    expect(r.lines.find((l) => l.key === "tac")?.value).toBe(25);
    expect(r.total).toBe(221);
    expect(
      describeRule(tac, {
        [TAC_PERCENT_FIELD]: { value: "", na: true },
        [TAC_FIXED_FIELD]: { value: "25", na: false },
      }).replace(/ /g, " "),
    ).toBe("R$ 25,00 por CT-e");
  });

  it("vazia ou em tabelas antigas, não cobra e não aparece como faltando", () => {
    const r = run({});
    expect(r.lines.find((l) => l.key === "tac")).toBeUndefined();
    expect(r.total).toBe(196);
    expect(missingFields(tac, values)).toEqual([]);
  });
});
