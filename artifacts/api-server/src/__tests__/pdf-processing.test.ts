import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  classifyHrDocument,
  identifyName,
  processPdf,
} from "../lib/pdf-processing";

describe("identificação de nomes em documentos de RH", () => {
  it.each([
    ["Nome: João da Silva\nCPF: 123.456.789-00", "JOAO DA SILVA"],
    ["NOME DO FUNCIONÁRIO: MARIA APARECIDA DE SOUZA   Matrícula: 1042", "MARIA APARECIDA DE SOUZA"],
    ["Empregado - CARLOS EDUARDO DOS SANTOS\nCargo: Operador", "CARLOS EDUARDO DOS SANTOS"],
    ["NOME DO COLABORADOR:\nANA PAULA FERREIRA\nCHAPA: 0098", "ANA PAULA FERREIRA"],
    ["Trabalhador: José Antônio de Oliveira   PIS: 123", "JOSE ANTONIO DE OLIVEIRA"],
    [
      "CADASTRO     NOME                         DATA ADMISSÃO   CARGO   CBO\n101003849 ANGELO CAMPANHOLA CERETA             02/03/2026      ELETRICISTA",
      "ANGELO CAMPANHOLA CERETA",
    ],
    [
      "CADASTRO NOME DATA ADMISSÃO CARGO CBO\n101003541 JEFFERSON ESTADULHO DOS SANTOS11/11/2025 ENGENHEIRO ELETRICISTA",
      "JEFFERSON ESTADULHO DOS SANTOS",
    ],
  ])("reconhece %s", (text, expected) => {
    expect(identifyName(text)).toBe(expected);
  });

  it("não confunde títulos do contracheque com o nome", () => {
    expect(identifyName("DEMONSTRATIVO DE PAGAMENTO\nTOTAL DE VENCIMENTOS")).toBeNull();
  });
});

describe("classificação de documentos rescisórios", () => {
  it.each([
    "TERMO DE RESCISÃO DE CONTRATO DE TRABALHO",
    "TERMO DE QUITAÇÃO DE RESCISÃO DE CONTRATO DE TRABALHO",
    "parte integrante do presente Termo de Quitação",
  ])("agrupa %s no termo de rescisão", (text) => {
    expect(classifyHrDocument(text)).toBe("03 - TERMO DE RESCISÃO CONTRATUAL");
  });
});

describe("classificação de documentos GRRF", () => {
  it("prioriza a guia de pagamento mesmo quando há texto de detalhamento", () => {
    expect(
      classifyHrDocument(
        "GFD - Guia do FGTS Digital\nPagar este documento até\nO detalhamento da guia pode ser consultado",
      ),
    ).toBe("08 - GUIA GRRF");
  });

  it("classifica o detalhe emitido como demonstrativo", () => {
    expect(
      classifyHrDocument(
        "Detalhe da Guia Emitida\nQtd. Trabalhadores FGTS: 1\nVencimento da Guia: 18/09/2026",
      ),
    ).toBe("07 - DEMONSTRATIVO GRRF");
  });
});

describe("classificação de documentos contratuais", () => {
  it("separa a autorização de desconto do plano de saúde", () => {
    expect(
      classifyHrDocument(
        "TERMO DE AUTORIZAÇÃO\nDESCONTO EM FOLHA DE PAGAMENTO - PLANO DE SAÚDE",
      ),
    ).toBe("10 - AUTORIZAÇÃO DE DESCONTO DO PLANO DE SAÚDE");
  });

  it("separa a autorização para descontos sindicais", () => {
    expect(
      classifyHrDocument(
        "AUTORIZAÇÃO PARA DESCONTOS SINDICAIS\nSIM AUTORIZO OS DESCONTOS da contribuição sindical",
      ),
    ).toBe("07 - AUTORIZAÇÃO PARA DESCONTOS SINDICAIS");
  });

  it.each([
    "Plano odontológico disponível\nPlano Escolhido\nDADOS DOS DEPENDENTES",
    "Beneficiários Dependentes incluídos no plano odontológico objeto deste instrumento",
  ])("agrupa as páginas do plano odontológico: %s", (text) => {
    expect(classifyHrDocument(text)).toBe(
      "22 - AUTORIZAÇÃO DE INCLUSÃO DO PLANO ODONTOLÓGICO",
    );
  });

  it("mantém a primeira página do consentimento na categoria LGPD", () => {
    expect(
      classifyHrDocument(
        "CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS - LGPD\n1 - Da Autorização\nbenefícios de vale transporte",
      ),
    ).toBe("23 - CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS LGPD");
  });

  it("classifica pelo título específico da declaração de vale-transporte", () => {
    expect(
      classifyHrDocument("Declaração de Renúncia do Vale Transporte"),
    ).toBe("14 - DECLARAÇÃO DE VT");
  });

  it("exige o título de dependentes para classificar o documento 04", () => {
    expect(classifyHrDocument("DECLARAÇÃO DE DEPENDENTES PARA IR")).toBe(
      "04 - DECLARAÇÃO DE DEPENDENTES PARA IR",
    );
    expect(
      classifyHrDocument(
        "Cláusula 3 - este benefício não será computado para o cálculo do imposto de renda.",
      ),
    ).not.toBe("04 - DECLARAÇÃO DE DEPENDENTES PARA IR");
  });

  it.each([
    "Cláusula 2 - Das obrigações e responsabilidades do colaborador. A empregadora fará o agendamento das passagens de transporte.",
    "E, por estarem assim justas e contratadas, as partes assinam o presente Termo. Assinatura do Colaborador.",
  ])("mantém as páginas de continuação no termo 43: %s", (text) => {
    expect(classifyHrDocument(text)).toBe(
      "43 - TERMO DE FORNECIMENTO DE TRANSPORTE",
    );
  });
});

describe("falhas de leitura do PDF", () => {
  it("não conclui o processamento quando nenhuma página contém texto legível", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);

    await expect(
      processPdf({
        data: Buffer.from(await pdf.save()),
        moduleId: "hr-documents",
        fileName: "DOCUMENTOS - TESTE.pdf",
      }),
    ).rejects.toThrow("Não foi possível ler o conteúdo do PDF");
  }, 30_000);
});