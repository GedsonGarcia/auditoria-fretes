import { describe, expect, it } from "vitest";
import { regionsFromVersion, regionsToRecord } from "./table-regions";

const base = {
  id: "v1",
  carrier_id: "c1",
  previous_version_id: null,
  created_at: "2026-01-01T00:00:00Z",
  commercial: {},
  calculation_rules: [],
  weight_bands: [],
  configuration: {},
};

describe("Regiões da tabela de frete", () => {
  it("lê as regiões gravadas e devolve no mesmo formato ao salvar", () => {
    const regions = regionsFromVersion({
      ...base,
      regions: [
        {
          square_id: "sq-1",
          commercial: {
            PEDÁGIO: { value: 4.5, state: "provided" },
            TDE: { value: null, state: "not_applicable" },
          },
          weight_bands: [{ weight: 50, value: 40 }],
        },
        { commercial: {} }, // sem praça: ignorada
      ],
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]!.values["PEDÁGIO"]).toEqual({ value: "4.5", na: false });
    expect(regions[0]!.values["TDE"]).toEqual({ value: "", na: true });
    expect(regions[0]!.bands[0]).toEqual({ weight: "50", value: "40" });

    const saved = regionsToRecord(regions);
    expect(saved[0]!.square_id).toBe("sq-1");
    expect(saved[0]!.commercial["PEDÁGIO"]).toEqual({ value: 4.5, state: "provided" });
    expect(saved[0]!.commercial["TDE"]).toEqual({ value: null, state: "not_applicable" });
    expect(saved[0]!.commercial["GRIS MÍNIMO"]).toEqual({ value: null, state: "missing" });
    expect(saved[0]!.weight_bands).toEqual([{ weight: 50, value: 40 }]);
  });

  it("versões antigas, sem regiões, continuam valendo só com os valores padrão", () => {
    expect(regionsFromVersion(base)).toEqual([]);
  });
});
