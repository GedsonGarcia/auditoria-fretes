import { useMemo, useState, type ClipboardEvent } from "react";
import {
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  MapPin,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuditData } from "./AuditData";
import { errorMessage } from "@/lib/audit-schemas";
import {
  GENERAL_LOCALITY,
  MAX_LOCALITIES,
  normalizeLocality,
  parseLocalities,
} from "@/lib/square-localities";

const UFS =
  "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
type Notice = { tone: "ok" | "error"; text: string } | null;

export function SquareEditor() {
  const { data, canWrite, saveSquare, updateSquare, deleteSquare } = useAuditData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [uf, setUf] = useState("");
  const [carrier, setCarrier] = useState("");
  const [geral, setGeral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pasteBox, setPasteBox] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const carrierName = (id: string | null | undefined) => {
    const found = data.carriers.find((c) => c.id === id);
    return found ? found.display_name || found.legal_name : "—";
  };
  const bySquare = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of data.localities) {
      const list = map.get(item.square_id) ?? [];
      list.push(item.name);
      map.set(item.square_id, list);
    }
    return map;
  }, [data.localities]);
  const rows = data.squares.filter((s) => {
    const term = normalizeLocality(search);
    if (!term) return true;
    const haystack = [s.name, s.state, carrierName(s.carrier_id), ...(bySquare.get(s.id) ?? [])]
      .map(normalizeLocality)
      .join(" | ");
    return haystack.includes(term);
  });

  function missingField() {
    if (!name.trim()) return "Informe o nome da praça.";
    if (!uf) return "Selecione a UF.";
    if (!carrier) return "Selecione a transportadora.";
    return "";
  }

  /** Tabelas de frete (versões) que usam a praça, como praça da tabela ou como região. */
  const tablesUsing = (id: string) =>
    data.versions.filter((v) => {
      const regions = (v as { regions?: unknown }).regions;
      return (
        v.square_id === id ||
        (Array.isArray(regions) &&
          regions.some(
            (r) => typeof r === "object" && r !== null && "square_id" in r && r.square_id === id,
          ))
      );
    }).length;

  function resetForm() {
    setEditingId(null);
    setName("");
    setGeral(false);
    setPasteBox(false);
  }

  const duplicateOf = (excludeId: string | null) =>
    data.squares.find(
      (s) =>
        s.id !== excludeId &&
        s.carrier_id === carrier &&
        s.state === uf &&
        normalizeLocality(s.name) === normalizeLocality(name),
    );

  async function saveEdit() {
    const problem = missingField();
    if (problem || !editingId) {
      setNotice({ tone: "error", text: problem || "Nenhuma praça em edição." });
      return;
    }
    if (duplicateOf(editingId)) {
      setNotice({
        tone: "error",
        text: "Já existe outra praça com este nome, UF e transportadora.",
      });
      return;
    }
    const wasGeneral = isGeneral(editingId);
    if (!geral && wasGeneral) {
      setNotice({
        tone: "error",
        text: "Para trocar Geral por uma lista, copie as localidades na planilha e clique em Substituir localidades.",
      });
      return;
    }
    setBusy(true);
    try {
      await updateSquare({
        id: editingId,
        name: name.trim(),
        state: uf,
        carrier_id: carrier,
        ...(geral && !wasGeneral ? { localities: [GENERAL_LOCALITY] } : {}),
      });
      setNotice({ tone: "ok", text: `Edição da praça "${name.trim()}" salva.` });
      resetForm();
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const square = data.squares.find((s) => s.id === id);
    if (!square) return;
    const used = tablesUsing(id);
    if (used) {
      setNotice({
        tone: "error",
        text: `A praça "${square.name}" é usada em ${used} versão(ões) de tabela de frete (praça ou região) e não pode ser excluída. Remova-a da tabela antes.`,
      });
      return;
    }
    const count = bySquare.get(id)?.length ?? 0;
    if (
      !window.confirm(
        `Excluir a praça "${square.name}" (${square.state} · ${carrierName(square.carrier_id)})${
          isGeneral(id) ? "" : ` e suas ${count} localidade(s)`
        }? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteSquare(id);
      if (editingId === id) resetForm();
      if (expanded === id) setExpanded(null);
      setNotice({ tone: "ok", text: `Praça "${square.name}" excluída.` });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const isGeneral = (id: string) => {
    const list = bySquare.get(id);
    return list?.length === 1 && list[0] === GENERAL_LOCALITY;
  };

  async function importText(text: string) {
    await saveList(parseLocalities(text));
  }

  async function saveList(localities: string[]) {
    const general = localities.length === 1 && localities[0] === GENERAL_LOCALITY;
    if (!localities.length) {
      setNotice({
        tone: "error",
        text: "Nenhuma localidade encontrada. Copie a coluna de localidades na planilha e tente de novo.",
      });
      return;
    }
    if (localities.length > MAX_LOCALITIES) {
      setNotice({ tone: "error", text: "A lista passa do limite de 5.000 localidades." });
      return;
    }
    if (editingId) {
      if (duplicateOf(editingId)) {
        setNotice({
          tone: "error",
          text: "Já existe outra praça com este nome, UF e transportadora.",
        });
        return;
      }
      setBusy(true);
      try {
        await updateSquare({
          id: editingId,
          name: name.trim(),
          state: uf,
          carrier_id: carrier,
          localities,
        });
        setNotice({
          tone: "ok",
          text: general
            ? `Praça "${name.trim()}" agora abrange todas as localidades de ${uf}.`
            : `Localidades da praça "${name.trim()}" substituídas: ${localities.length} localidade(s).`,
        });
        resetForm();
      } catch (error) {
        setNotice({ tone: "error", text: errorMessage(error) });
      } finally {
        setBusy(false);
      }
      return;
    }
    const existing = duplicateOf(null);
    if (
      existing &&
      !window.confirm(
        `A praça "${existing.name}" (${uf} · ${carrierName(carrier)}) já existe com ${
          isGeneral(existing.id)
            ? "todas as localidades da UF (Geral)"
            : `${bySquare.get(existing.id)?.length ?? 0} localidade(s)`
        }. Substituir por ${
          general ? "todas as localidades da UF (Geral)" : `uma nova lista com ${localities.length}`
        }?`,
      )
    )
      return;
    setBusy(true);
    try {
      await saveSquare({ name: name.trim(), state: uf, carrier_id: carrier, localities });
      setNotice({
        tone: "ok",
        text: general
          ? `Praça geral "${name.trim()}" salva: vale para todas as localidades de ${uf} (${carrierName(carrier)}).`
          : `${localities.length} localidade(s) importada(s) para a praça "${name.trim()}" (${uf} · ${carrierName(carrier)}).`,
      });
      setPasteBox(false);
      setName("");
      setGeral(false);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function importFromClipboard() {
    const problem = missingField();
    if (problem) {
      setNotice({ tone: "error", text: problem });
      return;
    }
    setNotice(null);
    if (geral && !editingId) {
      await saveList([GENERAL_LOCALITY]);
      return;
    }
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setPasteBox(true);
      return;
    }
    await importText(text);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    void importText(event.clipboardData.getData("text"));
  }

  function edit(id: string) {
    const square = data.squares.find((s) => s.id === id);
    if (!square) return;
    setName(square.name);
    setUf(square.state);
    setCarrier(square.carrier_id ?? "");
    setGeral(isGeneral(id));
    setEditingId(id);
    setPasteBox(false);
    setNotice({
      tone: "ok",
      text: isGeneral(id)
        ? `Editando "${square.name}" (Geral). Altere nome, UF ou transportadora e clique em Salvar edição.`
        : `Editando "${square.name}". Altere nome, UF ou transportadora e clique em Salvar edição. Para trocar a lista, copie as localidades na planilha e clique em Substituir localidades.`,
    });
  }

  return (
    <div className="square-editor">
      <div className="panel table-panel">
        <div className="panel-head">
          <div className="panel-head-main">
            <span className="panel-icon" aria-hidden="true">
              <MapPin />
            </span>
            <div>
              <div className="panel-title">{editingId ? "Editar praça" : "Nova praça"}</div>
              <div className="panel-sub">
                Dê um nome, escolha a UF e a transportadora. Depois copie a coluna de localidades na
                planilha do Excel e clique em Importar praça. Para a UF inteira, marque Geral.
              </div>
            </div>
          </div>
        </div>
        <div className="panel-body square-form-new">
          <div className="field">
            <label htmlFor="square-new-name">Nome da praça *</label>
            <input
              id="square-new-name"
              placeholder="Ex.: Grande Vitória"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="square-new-uf">UF *</label>
            <select id="square-new-uf" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">Selecione</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="square-new-carrier">Transportadora *</label>
            <select
              id="square-new-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            >
              <option value="">Selecione</option>
              {data.carriers
                .filter((c) => c.active || c.id === carrier)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.legal_name}
                  </option>
                ))}
            </select>
          </div>
          <label className="square-general">
            <input
              type="checkbox"
              checked={geral}
              onChange={(e) => {
                setGeral(e.target.checked);
                if (e.target.checked && !name.trim()) setName("Geral");
                setPasteBox(false);
              }}
            />
            <span>
              <b>Geral</b>
              <small>Abrange todas as localidades da UF</small>
            </span>
          </label>
          {editingId ? (
            <div className="square-edit-actions">
              <Button
                variant="approved"
                size="approved"
                type="button"
                className="btn-primary"
                disabled={busy || !canWrite}
                onClick={() => void saveEdit()}
              >
                <Save />
                {busy ? "Salvando…" : "Salvar edição"}
              </Button>
              {!geral && (
                <Button
                  variant="approved"
                  size="approved"
                  type="button"
                  disabled={busy || !canWrite}
                  onClick={() => void importFromClipboard()}
                >
                  <ClipboardPaste />
                  Substituir localidades
                </Button>
              )}
              <Button
                variant="approved"
                size="approved"
                type="button"
                disabled={busy}
                onClick={() => {
                  resetForm();
                  setNotice(null);
                }}
              >
                <X />
                Cancelar edição
              </Button>
            </div>
          ) : (
            <Button
              variant="approved"
              size="approved"
              type="button"
              className="btn-primary square-import"
              disabled={busy || !canWrite}
              title={canWrite ? undefined : "Seu perfil não pode cadastrar praças"}
              onClick={() => void importFromClipboard()}
            >
              <ClipboardPaste />
              {busy ? "Salvando…" : geral ? "Salvar praça geral" : "Importar praça"}
            </Button>
          )}
        </div>
        {pasteBox && (
          <div className="square-paste">
            <p>
              O navegador não liberou a leitura automática da área de transferência. Clique na caixa
              abaixo e pressione <b>Ctrl+V</b>.
            </p>
            <textarea
              autoFocus
              aria-label="Colar lista de localidades"
              placeholder="Pressione Ctrl+V aqui"
              onPaste={onPaste}
              readOnly={busy}
            />
            <Button
              variant="approved"
              size="approved"
              type="button"
              onClick={() => setPasteBox(false)}
            >
              Cancelar
            </Button>
          </div>
        )}
        {notice && (
          <p
            className={`square-notice ${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
      </div>

      <div className="panel table-panel">
        <div className="panel-head">
          <div className="panel-head-main">
            <span className="panel-icon" aria-hidden="true">
              <MapPin />
            </span>
            <div>
              <div className="panel-title">Praças cadastradas</div>
              <div className="panel-sub">
                Cada praça reúne as localidades de uma UF atendidas por uma transportadora.
              </div>
            </div>
          </div>
          <span className="badge-count">{data.squares.length} praça(s)</span>
        </div>
        <div className="panel-body">
          <label className="search-field square-search">
            <Search />
            <input
              aria-label="Pesquisar praças"
              placeholder="Pesquisar praça, UF, transportadora ou localidade"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Praça</th>
                  <th>UF</th>
                  <th>Transportadora</th>
                  <th>Localidades</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((s) => {
                    const list = bySquare.get(s.id) ?? [];
                    const open = expanded === s.id;
                    return [
                      <tr key={s.id} className={editingId === s.id ? "square-editing" : undefined}>
                        <td>
                          <b>{s.name}</b>
                        </td>
                        <td>{s.state}</td>
                        <td>{carrierName(s.carrier_id)}</td>
                        <td>
                          {isGeneral(s.id) ? (
                            <span className="calc-chip blue">Geral · todas da UF</span>
                          ) : (
                            list.length
                          )}
                        </td>
                        <td className="square-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={!list.length || isGeneral(s.id)}
                            onClick={() => setExpanded(open ? null : s.id)}
                          >
                            {open ? <ChevronUp /> : <ChevronDown />}
                            {open ? "Ocultar" : "Ver localidades"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={!canWrite}
                            onClick={() => edit(s.id)}
                          >
                            <Pencil />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="square-delete"
                            disabled={!canWrite || busy}
                            aria-label={`Excluir praça ${s.name}`}
                            onClick={() => void remove(s.id)}
                          >
                            <Trash2 />
                            Excluir
                          </Button>
                        </td>
                      </tr>,
                      open && (
                        <tr key={`${s.id}-list`} className="square-list-row">
                          <td colSpan={5}>
                            <div className="square-chips">
                              {list.map((item) => (
                                <span key={item}>{item}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="empty">
                      {search
                        ? "Nenhuma praça encontrada para a pesquisa."
                        : "Nenhuma praça cadastrada."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
