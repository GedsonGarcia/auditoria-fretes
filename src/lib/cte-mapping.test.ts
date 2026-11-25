import { describe, expect, it } from "vitest";
import {
  CTE_PENDING_STATUS,
  formatIssuedAt,
  linkInvoices,
  mapSilverCte,
  parseNamedValues,
  parseSourceDecimal,
} from "./cte-mapping";
import { cteListSchema } from "./cte-list-schema";

const KEY = "31261019694199000123570010002790251002681420";

/** Linha no formato devolvido pela fato silver (JSON_ARRAY: tudo em texto). */
const row = {
  id_cte: "4321390",
  nr_cte: "000279025",
  nr_chave_acesso_cte: KEY,
  dt_emissao: "2026-10-31T00:23:58.000Z",
  nm_emitente: "TRANSPORTADORA EXEMPLO LTDA",
  nr_cnpj_cpf_emitente: "19694199000123",
  nm_envolvido: "REDE ANCORA - MG",
  nm_tomador: "INDUSTRIA EXEMPLO LTDA",
  nr_cnpj_cpf_tomador: "44340879000277",
  nm_remetente: "INDUSTRIA EXEMPLO LTDA",
  nr_cnpj_cpf_remetente: "44340879000277",
  nm_destinatario: "REDE ANCORA MG",
  nr_cnpj_cpf_destinatario: "05916095000101",
  nm_municipio_inicio: "EXTREMA",
  sg_uf_inicio: "MG",
  nm_municipio_termino: "BELO HORIZONTE",
  sg_uf_termino: "MG",
  cd_cfop: "5353",
  vl_total_prestacao_servico: "280.47",
  vl_total_carga: "5576.88",
  nr_notas_fiscais: "000003312 | 000003313",
  nr_chaves_acesso_notas: "3126A | 3126B",
  ds_componentes_valor_prestacao:
    "FRETE PESO - 306.16 | FRETE VALOR - 55.74 | GRIS - 0.00 | PEDAGIO - 12.00",
  ds_quantidades_carga: "PESO CUBADO - 302.64 | PESO REAL - 290.10 | VOLUMES - 18.00",
};

describe("Mapeamento da fato silver para CteRecord", () => {
  it("lê decimais da origem sem estimar ausências", () => {
    expect(parseSourceDecimal("280.47")).toBe(280.47);
    expect(parseSourceDecimal("0.00")).toBe(0);
    expect(parseSourceDecimal("")).toBeNull();
    expect(parseSourceDecimal(null)).toBeNull();
    expect(parseSourceDecimal("1.234,56")).toBeNull();
  });

  it("separa listas nome - valor e preserva itens fora do padrão", () => {
    expect(parseNamedValues("FRETE PESO - 306.16 | GRIS - 0.00")).toEqual([
      { name: "FRETE PESO", value: 306.16 },
      { name: "GRIS", value: 0 },
    ]);
    expect(parseNamedValues("TAXA SEM VALOR")).toEqual([{ name: "TAXA SEM VALOR", value: null }]);
    expect(parseNamedValues(null)).toEqual([]);
  });

  it("mostra a emissão no horário de Brasília", () => {
    expect(formatIssuedAt("2026-10-31T00:23:58.000Z")).toMatch(/^30\/10\/2026,? 21:23$/);
    expect(formatIssuedAt(null)).toBe("Não informado");
  });

  it("mapeia identificação, valores, NF-es, peso, volumes e componentes", () => {
    const record = mapSilverCte(row);
    expect(record).toMatchObject({
      id: "4321390",
      number: "279025",
      key: KEY,
      carrier: "TRANSPORTADORA EXEMPLO LTDA",
      branch: "REDE ANCORA - MG",
      recipient: "REDE ANCORA MG",
      merchandise: { status: "informed", value: 5576.88 },
      freight: { status: "informed", value: 280.47 },
      invoices: "3312, 3313",
      volumes: "18",
      invoice: "",
      status: CTE_PENDING_STATUS,
    });
    expect(record.weight).toBe("cubado 302,64 · real 290,10");
    expect(record.source).toMatchObject({
      origin: "EXTREMA / MG",
      destination: "BELO HORIZONTE / MG",
      payer: "INDUSTRIA EXEMPLO LTDA",
      cfop: "5353",
      invoiceKeys: ["3126A", "3126B"],
    });
    expect(record.components).toHaveLength(4);
    expect(record.components[2]).toEqual({
      name: "GRIS",
      carrier: { status: "informed", value: 0 },
      audited: { status: "pending" },
    });
  });

  it("não calcula auditoria: frete e componentes auditados ficam pendentes", () => {
    const record = mapSilverCte(row);
    expect(record.audited).toEqual({ status: "pending" });
    expect(record.components.every((c) => c.audited.status === "pending")).toBe(true);
    expect(record.tableVersion).toBeUndefined();
    expect(record.calculationMemory).toBeUndefined();
    expect(record.dacteUrl).toBeUndefined();
  });

  it("marca como não informado o que a origem não traz", () => {
    const record = mapSilverCte({
      ...row,
      vl_total_carga: null,
      vl_total_prestacao_servico: null,
      ds_componentes_valor_prestacao: null,
      ds_quantidades_carga: null,
      nr_notas_fiscais: null,
    });
    expect(record.merchandise).toEqual({ status: "missing" });
    expect(record.freight).toEqual({ status: "missing" });
    expect(record.components).toEqual([]);
    expect(record.weight).toBe("Não informado");
    expect(record.volumes).toBe("Não informado");
    expect(record.invoices).toBe("Não informado");
  });

  it("associa faturas importadas pela chave do CT-e", () => {
    const records = [
      mapSilverCte(row),
      mapSilverCte({ ...row, id_cte: "2", nr_chave_acesso_cte: "9".repeat(44) }),
    ];
    const linked = linkInvoices(
      records,
      [
        { cte_key: KEY, invoice_id: "f1" },
        { cte_key: null, invoice_id: "f2" },
      ],
      [
        { id: "f1", number: "FAT-10" },
        { id: "f2", number: "FAT-11" },
      ],
    );
    expect(linked.map((r) => r.invoice)).toEqual(["FAT-10", ""]);
  });
});

describe("Filtros da lista de CT-es", () => {
  it("aceita período válido e normaliza CNPJ", () => {
    expect(
      cteListSchema.parse({
        from: "2026-11-01",
        to: "2026-11-25",
        carrierCnpj: "19.694.199/0001-23",
      }),
    ).toMatchObject({ carrierCnpj: "19694199000123" });
  });

  it("recusa período invertido, longo demais ou data inválida", () => {
    expect(() => cteListSchema.parse({ from: "2026-11-25", to: "2026-11-01" })).toThrow();
    expect(() => cteListSchema.parse({ from: "2026-01-01", to: "2026-11-01" })).toThrow(/92 dias/);
    expect(() => cteListSchema.parse({ from: "2026-13-01", to: "2026-13-02" })).toThrow();
  });
});
