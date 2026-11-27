import { useState } from "react";
import { Plus, X } from "lucide-react";

type SquareOption = { id: string; label: string };

/**
 * Seletor de região da tabela comercial: "Padrão" (localidades fora das regiões) e uma aba
 * por praça. Os componentes comerciais e as faixas de peso mostrados abaixo são os da aba ativa.
 */
export function RegionBar({
  regions,
  active,
  squares,
  canWrite,
  onSelect,
  onAdd,
  onRemove,
}: {
  regions: string[];
  active: string;
  squares: SquareOption[];
  canWrite: boolean;
  onSelect: (squareId: string) => void;
  onAdd: (squareId: string) => void;
  onRemove: (squareId: string) => void;
}) {
  const [adding, setAdding] = useState("");
  const label = (id: string) => squares.find((s) => s.id === id)?.label ?? "Praça removida";
  const available = squares.filter((s) => !regions.includes(s.id));

  return (
    <div className="region-bar">
      <div className="region-tabs" role="tablist" aria-label="Regiões da tabela">
        <button
          type="button"
          role="tab"
          aria-selected={active === ""}
          className={`region-tab ${active === "" ? "active" : ""}`}
          onClick={() => onSelect("")}
        >
          Padrão{regions.length ? " (demais localidades)" : ""}
        </button>
        {regions.map((id) => (
          <span key={id} className={`region-tab ${active === id ? "active" : ""}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active === id}
              onClick={() => onSelect(id)}
            >
              {label(id)}
            </button>
            {canWrite && (
              <button
                type="button"
                className="region-remove"
                aria-label={`Remover região ${label(id)}`}
                title="Remover região"
                onClick={() => onRemove(id)}
              >
                <X />
              </button>
            )}
          </span>
        ))}
      </div>
      {canWrite && (
        <div className="region-add">
          <select
            aria-label="Praça da nova região"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">
              {squares.length
                ? available.length
                  ? "Adicionar região (praça)…"
                  : "Todas as praças já são regiões"
                : "Selecione a transportadora e cadastre praças na aba 4"}
            </option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="region-add-btn"
            disabled={!adding}
            onClick={() => {
              onAdd(adding);
              setAdding("");
            }}
          >
            <Plus />
            Adicionar
          </button>
        </div>
      )}
      <p className="region-hint">
        {active
          ? `Valores da região ${label(active)}: os componentes e as faixas de peso abaixo valem só para as localidades desta praça. A nova região começa com uma cópia dos valores que estavam na tela.`
          : regions.length
            ? "Valores padrão: valem para as localidades que não estão em nenhuma região. Deixe em branco se a tabela só atende as regiões."
            : "Tabela com valores diferentes por região? Adicione uma região para cada praça; tudo fica na mesma tabela da transportadora."}
      </p>
    </div>
  );
}
