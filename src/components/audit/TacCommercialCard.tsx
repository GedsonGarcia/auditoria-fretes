import {
  fieldUnit,
  TAC_FIXED_FIELD,
  TAC_PERCENT_FIELD,
  type CommercialValues,
} from "@/lib/freight-rules";

type Patch = Partial<{ value: string; na: boolean }>;
export type TacUnit = "percent" | "fixed";

/** Forma em que a TAC está cadastrada: R$ quando só o campo em R$ está em uso; senão, %. */
export function tacUnit(values: CommercialValues): TacUnit {
  const pct = values[TAC_PERCENT_FIELD];
  const fixed = values[TAC_FIXED_FIELD];
  const fixedInUse = fixed && !fixed.na && (fixed.value.trim() !== "" || pct?.na);
  return fixedInUse ? "fixed" : "percent";
}

/**
 * Card do Adicional de Frete (TAC) nos componentes comerciais: um valor só, em % ou em R$.
 * Grava nos dois campos da tabela comercial: o da forma escolhida recebe o valor e o outro
 * fica "não aplicável", para o cálculo usar apenas um deles.
 */
export function TacCommercialCard({
  values,
  setCommercial,
}: {
  values: CommercialValues;
  setCommercial: (name: string, patch: Patch) => void;
}) {
  const unit = tacUnit(values);
  const active = unit === "fixed" ? TAC_FIXED_FIELD : TAC_PERCENT_FIELD;
  const other = unit === "fixed" ? TAC_PERCENT_FIELD : TAC_FIXED_FIELD;
  const item = values[active];
  const na = Boolean(values[TAC_PERCENT_FIELD]?.na && values[TAC_FIXED_FIELD]?.na);

  const changeUnit = (next: TacUnit) => {
    if (next === unit) return;
    const target = next === "fixed" ? TAC_FIXED_FIELD : TAC_PERCENT_FIELD;
    setCommercial(target, { value: item?.value ?? "", na: false });
    setCommercial(active, { value: "", na: true });
  };
  const setValue = (value: string) => {
    setCommercial(active, { value, na: false });
    setCommercial(other, { value: "", na: true });
  };
  const setNa = (checked: boolean) => {
    if (checked) {
      setCommercial(TAC_PERCENT_FIELD, { value: "", na: true });
      setCommercial(TAC_FIXED_FIELD, { value: "", na: true });
    } else {
      setCommercial(TAC_PERCENT_FIELD, { na: false });
      setCommercial(TAC_FIXED_FIELD, { value: "", na: true });
    }
  };

  return (
    <div className={`comm-card comm-card-tac ${na ? "is-na" : ""}`}>
      <div className="comm-head">
        <label className="comm-name" htmlFor="commercial-tac">
          ADICIONAL DE FRETE (TAC)
        </label>
        <label className="na-check">
          <input type="checkbox" checked={na} onChange={(e) => setNa(e.target.checked)} />
          Não aplicável
        </label>
      </div>
      <div className="comm-tac-row">
        <select
          aria-label="Forma de cobrança da TAC"
          value={unit}
          disabled={na}
          onChange={(e) => changeUnit(e.target.value as TacUnit)}
        >
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor (R$)</option>
        </select>
        <input
          id="commercial-tac"
          type="number"
          min="0"
          step="0.0001"
          placeholder={unit === "fixed" ? "R$ por CT-e" : "% do frete sem imposto"}
          disabled={na}
          value={na ? "" : (item?.value ?? "")}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="comm-unit">
        {fieldUnit(active)}. O ICMS é calculado sobre o frete já com a TAC. Taxa emergencial ou
        temporária: crie uma nova versão da tabela com a vigência do adicional.
      </div>
    </div>
  );
}
