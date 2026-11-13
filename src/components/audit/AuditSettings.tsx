import { useState } from "react";
import {
  Building2,
  Truck,
  Users,
  SlidersHorizontal,
  ShieldCheck,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Link2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const sections = [
  { id: "users", label: "Usuários", icon: Users },
  { id: "branches", label: "Filiais", icon: Building2 },
  { id: "carriers", label: "Transportadoras", icon: Truck },
  { id: "parameters", label: "Parametrizações", icon: SlidersHorizontal },
  { id: "access", label: "Acessos e histórico", icon: ShieldCheck },
  { id: "connection", label: "Conexões", icon: Link2 },
] as const;
type Section = (typeof sections)[number]["id"];
const forms = {
  users: {
    title: "Cadastrar usuário",
    columns: ["Nome", "E-mail", "Equipe", "Perfil de acesso", "Situação"],
    fields: ["Nome completo", "E-mail", "Equipe"],
  },
  branches: {
    title: "Cadastrar filial",
    columns: ["Código", "Filial", "CNPJ", "Município / UF", "Situação"],
    fields: ["Código da filial", "Nome da filial", "CNPJ", "Município", "UF", "Endereço"],
  },
  carriers: {
    title: "Cadastrar transportadora",
    columns: ["Razão social", "Nome de exibição", "CNPJ", "Situação", "Última alteração"],
    fields: ["Razão social", "Nome de exibição", "CNPJ"],
  },
};
type Registration = keyof typeof forms;

export function AuditSettings({ onCarrier }: { onCarrier: () => void }) {
  const [section, setSection] = useState<Section>("users");
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [search, setSearch] = useState("");
  const form =
    section === "users" || section === "branches" || section === "carriers" ? forms[section] : null;
  return (
    <section className="view active settings-view">
      <div className="page-head">
        <div>
          <div className="eyebrow">ADMINISTRAÇÃO DA OPERAÇÃO</div>
          <h1>Configurações</h1>
          <p className="subtitle">Cadastros, parâmetros comerciais e governança.</p>
        </div>
        <span className="connection-badge">
          <Link2 /> Base não conectada
        </span>
      </div>
      <nav className="settings-tabs" aria-label="Áreas de configurações">
        {sections.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="approved"
            size="approved"
            aria-pressed={section === id}
            className={section === id ? "active" : ""}
            onClick={() => {
              setSection(id);
              setSearch("");
            }}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </nav>
      <div className="connection-notice">
        <Link2 />
        <div>
          <b>Conexão da base original pendente</b>
          <p>
            Cadastros e alterações indisponíveis até conectar os registros e validar as permissões
            de acesso.
          </p>
        </div>
      </div>
      {form ? (
        <>
          <div className="settings-toolbar">
            <h2>{sections.find((item) => item.id === section)?.label}</h2>
            <div className="settings-commands">
              <label className="search-field">
                <Search />
                <input
                  aria-label="Pesquisar cadastros"
                  placeholder="Pesquisar cadastros"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <Button
                variant="approved"
                size="approved"
                className="btn-primary"
                onClick={() => {
                  if (section === "carriers") onCarrier();
                  else if (section === "users" || section === "branches") setRegistration(section);
                }}
              >
                <Plus />
                {form.title}
              </Button>
            </div>
          </div>
          <div className="settings-registers table-wrap">
            <table>
              <thead>
                <tr>
                  {form.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={form.columns.length} className="empty">
                    {search
                      ? "Nenhum cadastro disponível para a pesquisa."
                      : "Nenhum cadastro disponível. Base não conectada."}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>0 registros</span>
            <div>
              <Button variant="approved" size="approved" aria-label="Página anterior" disabled>
                <ChevronLeft />
              </Button>
              <span>0 de 0</span>
              <Button variant="approved" size="approved" aria-label="Próxima página" disabled>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      ) : section === "parameters" ? (
        <div className="settings-section">
          <h2>Parâmetros da auditoria</h2>
          <div className="parameter-lines">
            <div>
              <b>Tabelas comerciais e regras de cálculo</b>
              <span>Componentes, faixas de peso, composição e arredondamento.</span>
              <Button asChild variant="approved" size="approved">
                <Link to="/tabelas-frete">Abrir tabelas de frete</Link>
              </Button>
            </div>
            <div>
              <b>Vigências, versões e praças</b>
              <span>Condições negociadas por filial, destino e período.</span>
              <Button asChild variant="approved" size="approved">
                <Link to="/tabelas-frete">Abrir parametrizações</Link>
              </Button>
            </div>
            <div>
              <b>Conciliação de faturas</b>
              <span>Mapeamento de rubricas, duplicidades e pendências de associação.</span>
              <span className="tag gray">Aguardando conexão</span>
            </div>
          </div>
        </div>
      ) : section === "access" ? (
        <div className="settings-section">
          <h2>Acessos e rastreabilidade</h2>
          <div className="parameter-lines">
            <div>
              <b>Administradores</b>
              <span>Gestão de usuários, permissões e configurações.</span>
              <span className="tag gray">Aguardando validação</span>
            </div>
            <div>
              <b>Transportes</b>
              <span>Cadastros comerciais, tabelas, regras, vigências e tratativas.</span>
              <span className="tag gray">Aguardando validação</span>
            </div>
            <div>
              <b>Consulta</b>
              <span>Consulta das informações autorizadas, sem edição comercial.</span>
              <span className="tag gray">Aguardando validação</span>
            </div>
          </div>
          <h3>Histórico de alterações</h3>
          <p className="empty">Nenhuma alteração disponível na base conectada.</p>
        </div>
      ) : (
        <div className="settings-section">
          <h2>Base de documentos e cadastros</h2>
          <div className="parameter-lines">
            <div>
              <b>Base original de CT-es</b>
              <span>Não conectada</span>
              <span className="tag gray">Pendente</span>
            </div>
            <div>
              <b>Documentos DACTE / PDF</b>
              <span>Origem e permissões ainda não verificadas.</span>
              <span className="tag gray">Pendente</span>
            </div>
          </div>
          <p className="connection-instructions">
            No Lovable, abra Configurações → Geral → External Supabase → Connect para conectar a
            base original.
          </p>
        </div>
      )}
      <Dialog
        open={registration !== null}
        onOpenChange={(open) => {
          if (!open) setRegistration(null);
        }}
      >
        <DialogContent className="registration-dialog">
          <DialogTitle>{registration ? forms[registration].title : "Cadastro"}</DialogTitle>
          <DialogDescription>
            Gravação indisponível enquanto a base original não estiver conectada.
          </DialogDescription>
          <form onSubmit={(event) => event.preventDefault()}>
            <div className="form-grid">
              {registration &&
                forms[registration].fields.map((field, index) => (
                  <div className="field" key={field}>
                    <label htmlFor={`settings-field-${index}`}>{field}</label>
                    <input
                      id={`settings-field-${index}`}
                      type={field === "E-mail" ? "email" : "text"}
                      required
                      maxLength={field === "UF" ? 2 : undefined}
                    />
                  </div>
                ))}
              {registration === "users" && (
                <div className="field">
                  <label htmlFor="settings-role">Perfil de acesso</label>
                  <select id="settings-role" defaultValue="">
                    <option value="" disabled>
                      Selecionar
                    </option>
                    <option>Consulta</option>
                    <option>Transportes</option>
                    <option>Administrador</option>
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="settings-status">Situação</label>
                <select id="settings-status">
                  <option>Ativo</option>
                  <option>Inativo</option>
                </select>
              </div>
            </div>
            <div className="detail-footer">
              <Button
                variant="approved"
                size="approved"
                type="button"
                onClick={() => setRegistration(null)}
              >
                <X />
                Cancelar
              </Button>
              <Button
                variant="approved"
                size="approved"
                className="btn-primary"
                disabled
                title="Base não conectada"
              >
                Salvar cadastro
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
