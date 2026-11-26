import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TacCommercialCard, tacUnit } from "./TacCommercialCard";
import { TAC_FIXED_FIELD, TAC_PERCENT_FIELD, type CommercialValues } from "@/lib/freight-rules";

let latest: CommercialValues = {};
function Harness({ initial = {} }: { initial?: CommercialValues }) {
  const [values, setValues] = useState<CommercialValues>(initial);
  latest = values;
  return (
    <TacCommercialCard
      values={values}
      setCommercial={(name, patch) =>
        setValues((old) => ({
          ...old,
          [name]: { value: old[name]?.value ?? "", na: old[name]?.na ?? false, ...patch },
        }))
      }
    />
  );
}

describe("Adicional de frete (TAC) no cadastro da tabela", () => {
  it("começa em % e grava o valor só no campo percentual", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("ADICIONAL DE FRETE (TAC)"), {
      target: { value: "5" },
    });
    expect(latest[TAC_PERCENT_FIELD]).toEqual({ value: "5", na: false });
    expect(latest[TAC_FIXED_FIELD]).toEqual({ value: "", na: true });
  });

  it("ao trocar para R$, move o valor e deixa o % como não aplicável", () => {
    render(<Harness initial={{ [TAC_PERCENT_FIELD]: { value: "30", na: false } }} />);
    fireEvent.change(screen.getByLabelText("Forma de cobrança da TAC"), {
      target: { value: "fixed" },
    });
    expect(latest[TAC_FIXED_FIELD]).toEqual({ value: "30", na: false });
    expect(latest[TAC_PERCENT_FIELD]).toEqual({ value: "", na: true });
    expect(tacUnit(latest)).toBe("fixed");
    expect(screen.getByText(/R\$ por CT-e\./)).toBeTruthy();
  });

  it("não aplicável desativa os dois campos", () => {
    render(<Harness initial={{ [TAC_FIXED_FIELD]: { value: "10", na: false } }} />);
    fireEvent.click(screen.getByLabelText("Não aplicável"));
    expect(latest[TAC_PERCENT_FIELD]?.na).toBe(true);
    expect(latest[TAC_FIXED_FIELD]?.na).toBe(true);
    expect((screen.getByLabelText("ADICIONAL DE FRETE (TAC)") as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});
