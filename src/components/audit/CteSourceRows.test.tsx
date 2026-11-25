import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CteDetails, CteRows } from "./CteDetails";
import { mapSilverCte } from "@/lib/cte-mapping";

const record = mapSilverCte({
  id_cte: "10",
  nr_cte: "000123",
  nr_chave_acesso_cte: "3".repeat(44),
  dt_emissao: "2026-11-24T15:00:00.000Z",
  nm_emitente: "TRANSPORTADORA EXEMPLO",
  nm_envolvido: "REDE ANCORA - PR",
  nm_remetente: "INDUSTRIA EXEMPLO",
  nm_tomador: "INDUSTRIA EXEMPLO",
  nm_destinatario: "REDE ANCORA PR",
  nm_municipio_inicio: "SAO PAULO",
  sg_uf_inicio: "SP",
  nm_municipio_termino: "SAO JOSE DOS PINHAIS",
  sg_uf_termino: "PR",
  vl_total_prestacao_servico: "696.25",
  vl_total_carga: "8543.06",
  nr_notas_fiscais: "000143930",
});

describe("Auditoria de CT-es com dados da base original", () => {
  it("mostra a mensagem de vazio recebida", () => {
    render(
      <table>
        <CteRows
          records={[]}
          onSelect={() => {}}
          emptyText="Nenhum CT-e encontrado para os filtros."
        />
      </table>,
    );
    expect(screen.getByText("Nenhum CT-e encontrado para os filtros.")).toBeInTheDocument();
  });

  it("lista o CT-e mapeado com valores informados e campos ausentes explícitos", () => {
    const onSelect = vi.fn();
    render(
      <table>
        <CteRows records={[record]} onSelect={onSelect} />
      </table>,
    );
    const row = screen.getByRole("row", { name: "Detalhar CT-e 123" });
    expect(row).toHaveTextContent("TRANSPORTADORA EXEMPLO");
    expect(row).toHaveTextContent("R$ 696,25");
    expect(row).toHaveTextContent("Pendente de parametrização");
    expect(row).toHaveTextContent("Não informado");
    expect(row).toHaveTextContent("Sem fatura");
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(record);
  });

  it("detalha origem, destino e partes sem decompor o que a origem não traz", () => {
    render(<CteDetails record={record} onClose={() => {}} />);
    expect(screen.getByText("SAO PAULO / SP → SAO JOSE DOS PINHAIS / PR")).toBeInTheDocument();
    expect(screen.getByText("R$ 8.543,06")).toBeInTheDocument();
    expect(screen.getByText("Decomposição não disponível neste documento.")).toBeInTheDocument();
  });
});
