import { describe, expect, it } from "vitest";
import { auditCte, findTableVersion, type AuditContext, type AuditVersion } from "./cte-audit";
import { mapSilverCte } from "./cte-mapping";
import { GENERAL_LOCALITY } from "./square-localities";

const CARRIER_CNPJ = "19694199000123";
const BRANCH_CNPJ = "05916095000101";

/** CT-e recebido pela filial (destinatário), vindo de Itajaí/SC, com peso só nas NF-es. */
const row = {
  id_cte: "1",
  nr_cte: "100",
  nr_chave_acesso_cte: "4".repeat(44),
  dt_emissao: "2026-11-20T15:00:00.000Z",
  nm_emitente: "TRANSPORTADORA EXEMPLO",
  nr_cnpj_cpf_emitente: CARRIER_CNPJ,
  nm_envolvido: "REDE ANCORA - ES",
  nm_remetente: "FORNECEDOR EXEMPLO",
  nr_cnpj_cpf_remetente: "11111111000111",
  nm_destinatario: "REDE ANCORA ES",
  nr_cnpj_cpf_destinatario: BRANCH_CNPJ,
  nm_municipio_inicio: "1 - ITJ - ITAJAI",
  sg_uf_inicio: "SC",
  nm_municipio_termino: "CARIACICA",
  sg_uf_termino: "ES",
  vl_total_prestacao_servico: "68.00",
  vl_total_carga: "1000.00",
  nr_notas_fiscais: "000001 | 000002",
  nr_chaves_acesso_notas: "A | B",
  remetente_email: "COMPRAS@FORNECEDOR.COM.BR",
  remetente_municipio: "ITAJAI",
  remetente_uf: "SC",
  destinatario_municipio: "CARIACICA",
  destinatario_uf: "ES",
  nf_total: "2",
  nf_com_peso: "2",
  nf_peso_bruto: "80.0000000000",
};

function version(over: Partial<AuditVersion> = {}): AuditVersion {
  return {
    id: "v1",
    carrier_id: "c1",
    branch_id: "b1",
    square_id: "sq-itajai",
    valid_from: "2026-01-01",
    valid_until: null,
    previous_version_id: null,
    created_at: "2026-01-01T00:00:00Z",
    commercial: {
      "FRETE VALOR (% SOBRE $ NF)": { value: 1, state: "provided" },
      "GRIS (% SOBRE $ NF)": { value: 0.3, state: "provided" },
      PEDÁGIO: { value: 5, state: "provided" },
    },
    calculation_rules: [],
    weight_bands: [{ weight: 100, value: 50 }],
    configuration: {
      peso_considerado: "real",
      composicao: "soma",
      frete_minimo_sobre: "frete_base",
      icms: "incluso",
    },
    ...over,
  };
}

function context(versions: AuditVersion[] = [version()]): AuditContext {
  return {
    carriers: [{ id: "c1", cnpj: CARRIER_CNPJ, legal_name: "TRANSP EX", display_name: "Exemplo" }],
    branches: [{ id: "b1", cnpj: BRANCH_CNPJ, name: "ES" }],
    squares: [
      { id: "sq-itajai", name: "Itajaí", state: "SC" },
      { id: "sq-sc", name: "Geral SC", state: "SC" },
    ],
    localities: [
      { square_id: "sq-itajai", name: "Itajaí" },
      { square_id: "sq-sc", name: GENERAL_LOCALITY },
    ],
    versions,
  };
}

describe("Mapeamento com dados das tabelas bronze", () => {
  it("usa o peso bruto das NF-es só quando todas têm peso", () => {
    const record = mapSilverCte(row);
    expect(record.weight).toBe("80,00 (NF-e)");
    expect(record.source).toMatchObject({
      realWeightKg: 80,
      realWeightSource: "nfe",
      senderEmail: "COMPRAS@FORNECEDOR.COM.BR",
      originCity: "ITAJAI",
      issuedOn: "2026-11-20",
    });
    const partial = mapSilverCte({ ...row, nf_com_peso: "1", nf_peso_bruto: "30" });
    expect(partial.weight).toBe("Sem peso em 1 de 2 NF-e(s)");
    expect(partial.weight).not.toContain("30");
    expect(partial.source?.realWeightKg).toBeNull();
  });

  it("prefere o peso real do CT-e e limpa prefixos de rota do município", () => {
    const record = mapSilverCte({
      ...row,
      remetente_municipio: null,
      ds_quantidades_carga: "PESO REAL - 95.50 | M3 - 0.40 | VOLUMES - 3.00",
    });
    expect(record.source).toMatchObject({
      realWeightKg: 95.5,
      realWeightSource: "cte",
      cubicMeters: 0.4,
      originCity: "ITAJAI",
    });
  });

  it("aceita decimais em notação científica da origem", () => {
    expect(mapSilverCte({ ...row, vl_total_carga: "0E-10" }).merchandise).toEqual({
      status: "informed",
      value: 0,
    });
  });
});

describe("Auditoria automática do CT-e", () => {
  it("calcula pela tabela vigente e marca conforme (preliminar, peso das NF-es)", () => {
    // Faixa até 100 kg = 50; frete valor 1% de 1.000 = 10; GRIS 0,3% = 3; pedágio 1 fração = 5.
    const audited = auditCte(mapSilverCte(row), context());
    expect(audited.audited).toEqual({ status: "informed", value: 68 });
    expect(audited.auditOutcome).toBe("conforme");
    expect(audited.auditPreliminary).toBe(true);
    expect(audited.status).toBe("Conforme a tabela (preliminar)");
    expect(audited.tableVersion).toContain("praça Itajaí · SC");
    expect(audited.calculationMemory).toContain("soma do peso bruto das 2 NF-e(s)");
    expect(audited.components.map((c) => [c.name, c.audited])).toEqual([
      ["Frete Peso", { status: "informed", value: 50 }],
      ["Frete Valor", { status: "informed", value: 10 }],
      ["GRIS", { status: "informed", value: 3 }],
      ["Pedágio", { status: "informed", value: 5 }],
    ]);
  });

  it("aponta cobrança acima da tabela com a diferença", () => {
    const audited = auditCte(
      mapSilverCte({ ...row, vl_total_prestacao_servico: "80.00" }),
      context(),
    );
    expect(audited.auditOutcome).toBe("acima");
    expect(audited.status).toMatch(/^Cobrado R\$\s12,00 acima da tabela \(preliminar\)$/);
  });

  it("compara com os componentes que o CT-e traz", () => {
    const audited = auditCte(
      mapSilverCte({
        ...row,
        ds_quantidades_carga: "PESO REAL - 80.00",
        ds_componentes_valor_prestacao: "FRETE PESO - 55.00 | PEDAGIO - 5.00 | OUTROS - 8.00",
      }),
      context(),
    );
    expect(audited.auditPreliminary).toBe(false);
    expect(audited.components[0]).toMatchObject({
      name: "FRETE PESO",
      carrier: { status: "informed", value: 55 },
      audited: { status: "informed", value: 50 },
    });
    expect(audited.components[2]?.audited).toEqual({ status: "not-applicable" });
  });

  it("prefere a praça com a localidade exata à praça geral da UF", () => {
    const ctx = context([
      version({ id: "geral", square_id: "sq-sc" }),
      version({ id: "exata", square_id: "sq-itajai" }),
    ]);
    const found = findTableVersion(ctx, "c1", "b1", "2026-11-20", { city: "Itajai", state: "SC" });
    expect(found.match?.version.id).toBe("exata");
  });

  it("fica pendente, sem estimar, quando falta dado ou tabela", () => {
    const base = mapSilverCte(row);
    expect(auditCte(base, { ...context(), carriers: [] }).status).toMatch(
      /transportadora não cadastrada/,
    );
    expect(auditCte(base, context([])).status).toMatch(/sem tabela vigente/);
    expect(auditCte(base, context([version({ valid_until: "2026-10-31" })])).status).toMatch(
      /sem tabela vigente/,
    );
    expect(auditCte(base, context([version({ id: "a" }), version({ id: "b" })])).status).toMatch(
      /mais de uma tabela/,
    );
    expect(
      auditCte(
        base,
        context([version({ configuration: { icms: "por_dentro", composicao: "soma" } })]),
      ).status,
    ).toMatch(/ICMS por dentro/);
    const semPeso = auditCte(mapSilverCte({ ...row, nf_com_peso: "1" }), context());
    expect(semPeso).toMatchObject({ auditOutcome: "pendente", audited: { status: "pending" } });
    expect(semPeso.calculationMemory).toContain("Nenhum valor foi estimado");
    expect(semPeso.status).toContain("1 de 2 NF-e(s) sem peso");
    const saidaAncora = auditCte(
      mapSilverCte({
        ...row,
        nf_total: "3",
        nf_com_peso: "0",
        nf_peso_bruto: null,
        nf_fora_base: "3",
        nf_fora_base_ancora: "2",
      }),
      context(),
    );
    expect(saidaAncora.status).toBe(
      "Pendente: peso indisponível: o CT-e não traz o peso real e 3 de 3 NF-e(s) sem peso; " +
        "2 emitida(s) pela Rede ANCORA, fora da base de NF-e do Broker; 1 fora da base de NF-e do Broker",
    );
    expect(saidaAncora.weight).toBe("Sem peso em 3 de 3 NF-e(s)");
  });
});
