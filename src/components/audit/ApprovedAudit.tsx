import { createElement, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Download,
  Plus,
  Upload,
  LayoutDashboard,
  Files,
  FileCheck,
  TableProperties,
  Flag,
  X,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { AuditSettings } from "./AuditSettings";
import { CteDetails, CteRows } from "./CteDetails";
import type { CteRecord } from "./cte-detail-data";
import layout from "./approved-layout.json";
import logo from "@/assets/rede-ancora-logo.asset.json";

type LayoutNode =
  | string
  | { tag: string; attrs: Record<string, string | number | boolean>; children: LayoutNode[] };
export type AuditView =
  "overview" | "upload" | "invoices" | "ctes" | "tables" | "alerts" | "settings";
const destinations = {
  overview: "/",
  upload: "/importar-faturas",
  invoices: "/auditoria-faturas",
  ctes: "/auditoria-ctes",
  tables: "/tabelas-frete",
  alerts: "/central-alertas",
  settings: "/configuracoes",
} as const;
const names = {
  overview: "Visão Geral",
  upload: "Importar Faturas",
  invoices: "Auditoria de Faturas",
  ctes: "Auditoria de CT-es",
  tables: "Tabelas de Frete",
  alerts: "Central de Alertas",
  settings: "Configurações",
};
const icons = {
  overview: LayoutDashboard,
  upload: Upload,
  invoices: Files,
  ctes: FileCheck,
  tables: TableProperties,
  alerts: Flag,
  settings: Settings,
};
const commercial = [
  "FRETE VALOR (% SOBRE $ NF)",
  "FRETE PESO (GATILHO)",
  "FRETE MÍNIMO",
  "GRIS (% SOBRE $ NF)",
  "GRIS MÍNIMO",
  "AD VALOREM (% SOBRE $ NF)",
  "ADV MÍNIMO",
  "PEDÁGIO",
  "DESPACHO (OU COLETA)",
  "FATOR DE CUBAGEM",
  "TDE",
  "TDA",
  "SEC/CAT",
  "TAS",
  "TRT",
  "TRT MÍNIMO",
  "EMEX (R$/100KG)",
  "EMEX (%)",
  "EMEX MÍNIMO",
  "TRF (%)",
  "TRF (R$)",
];
const calcTypes = [
  "Pendente de definição",
  "Percentual sobre valor NF",
  "Valor fixo por CT-e",
  "Valor por kg",
  "Faixa de peso",
  "Valor por 100 kg",
  "Valor por volume",
  "Mínimo condicionado",
  "Regra por praça / região",
];
const calcBases = [
  "Valor da NF",
  "Peso base",
  "Peso taxado",
  "Quantidade de volumes",
  "Faixa de peso",
  "Por CT-e / embarque",
  "Praça / região",
];
const headers = [
  "numero_fatura",
  "cnpj_transportadora",
  "razao_social_transportadora",
  "data_emissao_fatura",
  "data_vencimento",
  "filial_ancora",
  "chave_cte",
  "numero_cte",
  "peso_base_calculo_kg",
  "frete_peso_cobrado",
  "frete_fixo_cobrado",
  "ad_valorem_cobrado",
  "gris_cobrado",
  "pedagio_cobrado",
  "taxa_despacho_cobrada",
  "trt_cobrado",
  "tde_cobrado",
  "taxa_dificuldade_entrega_cobrada",
  "outros_adicionais_cobrados",
  "acrescimos_cobrados",
  "descontos_cobrados",
  "valor_cobrado_cte",
  "valor_total_fatura",
];
function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + headers.join(";") + "\r\n"], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo_fatura_ancora.csv";
  a.click();
  URL.revokeObjectURL(url);
}
function Options({ values }: { values: string[] }) {
  return (
    <>
      {values.map((v) => (
        <option key={v}>{v}</option>
      ))}
    </>
  );
}
export function ApprovedAudit({ view, ctes = [] }: { view: AuditView; ctes?: CteRecord[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedCte, setSelectedCte] = useState<CteRecord | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [tab, setTab] = useState("commercial");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [max, setMax] = useState(false);
  const [bands, setBands] = useState([{ weight: "", value: "" }]);
  const unavailable = () =>
    setMessage(
      "Base não conectada. Esta operação depende dos registros e das permissões da operação.",
    );
  const close = () => {
    if (
      modal &&
      document.querySelector(`#${modal} input:not([type=hidden]):not([readonly])`) &&
      !window.confirm("Fechar o formulário? Os dados não salvos serão descartados.")
    )
      return;
    setModal(null);
  };
  function render(node: LayoutNode, key: string): ReactNode {
    if (typeof node === "string") return node.includes("Campos legados preservados") ? null : node;
    const { tag, attrs, children } = node;
    const id = String(attrs["id"] || "");
    const cls = String(attrs["class"] || "");
    if (tag === "body")
      return (
        <div key={key} className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
          {children.map((c, i) => render(c, `${key}-${i}`))}
          <CteDetails record={selectedCte} onClose={() => setSelectedCte(null)} />
          {message && (
            <div role="status" className="audit-status" onClick={() => setMessage("")}>
              {message}
            </div>
          )}
        </div>
      );
    if (cls.split(" ").includes("view") && id !== `view-${view}`) return null;
    if (cls === "modal-back" && modal !== id) return null;
    if (cls === "content" && view === "settings")
      return (
        <div key={key} className="content">
          <AuditSettings onCarrier={() => setModal("modal-carrier")} />
        </div>
      );
    if (id === "cte-list") return <CteRows key={key} records={ctes} onSelect={setSelectedCte} />;
    if (cls === "side-foot")
      return (
        <div key={key} className="side-foot">
          <Button
            variant="approved"
            size="approved"
            className={`settings-link ${view === "settings" ? "active" : ""}`}
            asChild
          >
            <Link to="/configuracoes" title="Configurações">
              <Settings />
              <span className="nav-text">Configurações</span>
            </Link>
          </Button>
          <span className="side-caption">REDE ANCORA · LOGÍSTICA NACIONAL</span>
        </div>
      );
    if (cls === "topbar")
      return (
        <header key={key} className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="sidebar-toggle"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          {children.map((c, i) => render(c, `${key}-${i}`))}
        </header>
      );
    if (id === "crumb-current") return <b key={key}>{names[view]}</b>;
    if (cls === "brand")
      return (
        <div key={key} className="brand">
          <img className="brand-logo" src={logo.url} alt="Rede ANCORA" />
        </div>
      );
    if (tag === "button" && attrs["data-view"] === "upload") return null;
    if (cls === "nav-ico" || id === "toast") return null;
    if (id === "commercial-components")
      return (
        <div key={key} className="comm-grid">
          {commercial.map((name, i) => (
            <div className="comm-card" key={name}>
              <div className="comm-head">
                <label className="comm-name" htmlFor={`commercial-${i}`}>
                  {name}
                </label>
                <label className="na-check">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      const el = document.getElementById(`commercial-${i}`);
                      if (el instanceof HTMLInputElement) el.disabled = e.target.checked;
                    }}
                  />
                  Não aplicável
                </label>
              </div>
              <input
                id={`commercial-${i}`}
                type="number"
                min="0"
                step="0.0001"
                placeholder="Valor comercial"
              />
              <div className="comm-unit">
                {name.includes("%")
                  ? "% sobre a base definida"
                  : name === "FATOR DE CUBAGEM"
                    ? "kg/m³"
                    : "Conforme unidade negociada"}
              </div>
              {i === 1 && (
                <select aria-label="Natureza do gatilho">
                  <Options
                    values={[
                      "Natureza do gatilho — definir",
                      "Tarifa R$/kg",
                      "Peso mínimo (kg)",
                      "Valor mínimo de NF (R$)",
                      "Referência para faixa de peso",
                    ]}
                  />
                </select>
              )}
            </div>
          ))}
        </div>
      );
    if (id === "calc-rule-rows")
      return (
        <tbody key={key}>
          {commercial.map((name) => (
            <tr key={name}>
              <td>{name}</td>
              <td>
                <select aria-label={`Tipo de cálculo ${name}`}>
                  <Options values={calcTypes} />
                </select>
              </td>
              <td>
                <select aria-label={`Base de cálculo ${name}`}>
                  <Options values={calcBases} />
                </select>
              </td>
              <td>
                <input
                  aria-label={`Fórmula ${name}`}
                  placeholder="Descreva a fórmula"
                  className="formula-input"
                />
              </td>
              <td>
                <input aria-label={`Unidade ${name}`} placeholder="Unidade" />
              </td>
              <td>
                <input aria-label={`Condição ${name}`} placeholder="Condição de aplicação" />
              </td>
              {["Mínimo", "Máximo"].map((x) => (
                <td key={x}>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="—"
                    aria-label={`${x} ${name}`}
                  />
                </td>
              ))}
              <td>
                <select aria-label={`Arredondamento ${name}`}>
                  <Options
                    values={[
                      "2 casas decimais",
                      "4 casas decimais",
                      "Inteiro",
                      "Arredondar para cima (2)",
                    ]}
                  />
                </select>
              </td>
              <td>
                <select aria-label={`Composição ${name}`}>
                  <Options
                    values={[
                      "Frete principal",
                      "Adicional (somar)",
                      "Incluído em outro componente",
                      "Substitui outro componente",
                      "Condicionado / depende de regra",
                    ]}
                  />
                </select>
              </td>
              <td>
                <span className="calc-status">PENDENTE</span>
              </td>
            </tr>
          ))}
        </tbody>
      );
    if (id === "weightRows")
      return (
        <tbody key={key}>
          {bands.map((row, i) => (
            <tr key={i}>
              {(["weight", "value"] as const).map((field) => (
                <td key={field}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`${field === "weight" ? "Peso até" : "Valor do frete"} ${i + 1}`}
                    value={row[field]}
                    onChange={(e) =>
                      setBands((previous) => {
                        const next = previous.map((r, j) =>
                          j === i ? { ...r, [field]: e.target.value } : r,
                        );
                        const last = next.at(-1);
                        return last?.weight && last.value
                          ? [...next, { weight: "", value: "" }]
                          : next;
                      })
                    }
                  />
                </td>
              ))}
              <td>
                <Button
                  variant="approved"
                  size="approved"
                  title="Excluir faixa"
                  aria-label={`Excluir faixa ${i + 1}`}
                  onClick={() =>
                    setBands((prev) =>
                      prev.length === 1
                        ? [{ weight: "", value: "" }]
                        : prev.filter((_, j) => i !== j),
                    )
                  }
                >
                  <X />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      );
    if (id === "compositionConfig" && max) return null;
    if (cls === "chart")
      return (
        <div className="empty-chart" key={key}>
          Nenhum dado disponível no período.
        </div>
      );
    const props: Record<string, unknown> = { key };
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "class") props["className"] = value;
      else if (name === "value") props["defaultValue"] = value;
      else if (name === "readonly") props["readOnly"] = true;
      else if (name === "maxlength") props["maxLength"] = Number(value);
      else if (name === "colspan") props["colSpan"] = Number(value);
      else if (["required", "disabled", "hidden"].includes(name)) props[name] = true;
      else if (name !== "style") props[name] = value;
    }
    if (cls.split(" ").includes("view")) props["className"] = "view active";
    if (cls === "modal-back") {
      props["className"] = "modal-back open";
      props["role"] = "dialog";
      props["aria-modal"] = true;
      props["aria-label"] =
        id === "modal-rule" ? "Cadastrar tabela de frete" : "Cadastrar transportadora";
    }
    if (cls.split(" ").includes("editor-pane"))
      props["className"] = `editor-pane ${id === `editor-${tab}` ? "active" : ""}`;
    if (id === "maxRule") {
      props["checked"] = max;
      props["onChange"] = (e: React.ChangeEvent<HTMLInputElement>) => setMax(e.target.checked);
    }
    if (tag === "label") {
      if (!props["htmlFor"]) {
        const child = children.find(
          (c) => typeof c !== "string" && ["input", "select", "textarea"].includes(c.tag),
        );
        if (child && typeof child !== "string") props["htmlFor"] = child.attrs["id"];
      }
      const parentChildren = children;
      return createElement(
        tag,
        props,
        parentChildren.map((c, i) => render(c, `${key}-${i}`)),
      );
    }
    if (tag === "input" && attrs["type"] === "file")
      props["onChange"] = (e: React.ChangeEvent<HTMLInputElement>) =>
        setFile(e.target.files?.[0] || null);
    if (id === "file-box") props["className"] = `file-box ${file ? "show" : ""}`;
    if (id === "file-name") return <b key={key}>{file?.name}</b>;
    if (id === "validation")
      return (
        <div key={key} className="validation">
          {file
            ? "Arquivo selecionado. Conciliação indisponível até conectar a base."
            : "Aguardando leitura do arquivo."}
        </div>
      );
    if (tag === "form") props["onSubmit"] = (e: React.FormEvent) => e.preventDefault();
    if (tag === "button") {
      const target = String(attrs["data-view"] || attrs["data-goto"] || "");
      if (target && target in destinations) {
        const v = target as AuditView;
        const Icon = icons[v];
        return (
          <Button
            key={key}
            variant="approved"
            size="approved"
            className={`${cls
              .split(" ")
              .filter((name) => name !== "active")
              .join(" ")} ${attrs["data-view"] && view === v ? "active" : ""}`}
            asChild
          >
            <Link to={destinations[v]} title={names[v]}>
              {attrs["data-view"] && <Icon />}
              {children.map((c, i) => render(c, `${key}-${i}`))}
            </Link>
          </Button>
        );
      }
      let action = unavailable;
      if (id === "add-carrier") action = () => setModal("modal-carrier");
      if (id === "add-rule")
        action = () => {
          setTab("commercial");
          setModal("modal-rule");
        };
      if (cls === "close" || children.includes("Cancelar") || children.includes("Fechar"))
        action = close;
      if (id === "download-template") action = downloadTemplate;
      if (id === "choose-file") action = () => document.getElementById("invoice-file")?.click();
      if (id === "remove-file") action = () => setFile(null);
      if (id === "ov-clear")
        action = () => {
          document.querySelectorAll("#view-overview .filters input").forEach((e) => {
            if (e instanceof HTMLInputElement) e.value = "";
          });
          document.querySelectorAll("#view-overview .filters select").forEach((e) => {
            if (e instanceof HTMLSelectElement) e.selectedIndex = 0;
          });
        };
      if (attrs["data-editor-tab"]) action = () => setTab(String(attrs["data-editor-tab"]));
      if (children.some((c) => typeof c === "string" && c.includes("Adicionar faixa")))
        action = () => setBands((prev) => [...prev, { weight: "", value: "" }]);
      if (id === "square-cancel")
        action = () => {
          ["square-name", "square-code", "square-notes"].forEach((x) => {
            const e = document.getElementById(x);
            if (e instanceof HTMLInputElement) e.value = "";
          });
        };
      const saving = ["save-rule", "save-carrier", "square-save", "process-invoice"].includes(id);
      return (
        <Button
          {...props}
          key={key}
          variant="approved"
          size="approved"
          type="button"
          disabled={saving || Boolean(props["disabled"])}
          title={saving ? "Base não conectada" : undefined}
          className={`${cls} ${attrs["data-editor-tab"] === tab ? "active" : ""}`}
          onClick={action}
        >
          {cls === "close" ? (
            <X />
          ) : (
            children.map((c, i) =>
              render(typeof c === "string" ? c.replace(/^[⇩＋⇧]\s*/, "") : c, `${key}-${i}`),
            )
          )}
          {id.includes("export") && <Download />}
          {id === "add-rule" && <Plus />}
        </Button>
      );
    }
    return createElement(tag, props, ...children.map((c, i) => render(c, `${key}-${i}`)));
  }
  return <>{render(layout as LayoutNode, "layout")}</>;
}
