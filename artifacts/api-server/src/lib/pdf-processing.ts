import { PDFDocument } from "pdf-lib";
import {
  createPdfTextExtractor,
  type PdfTextExtractor,
} from "./node-pdf-runtime";

export type ProcessingModule = "payroll" | "attendance" | "hr-documents";

export type ProcessedOutput = {
  name: string;
  data: Buffer;
  description: string;
};

export type PdfProcessingResult = {
  pages: number;
  outputs: ProcessedOutput[];
};

const HR_DOCUMENT_TYPES: Array<[string[], string]> = [
  [["REGISTRO DE EMPREGADOS"], "01 - FICHA DE REGISTRO (FRENTE E VERSO)"],
  [["EXPERIENCIA", "CONTRATO DE EXPERIENCIA", "EM PODER DA EMPREGADORA"], "02 - CONTRATO DE TRABALHO"],
  [[
    "01 CNPJ/CEI",
    "TERMO DE RESCISAO",
    "TERMO DE QUITACAO DE RESCISAO",
    "TERMO DE QUITACAO",
    "PRESENTE TERMO DE QUITACAO",
  ], "03 - TERMO DE RESCISÃO CONTRATUAL"],
  [[
    "DECLARACAO DE DEPENDENTES",
    "DEPENDENTES PARA IR",
    "DEPENDENTES PARA IMPOSTO DE RENDA",
  ], "04 - DECLARAÇÃO DE DEPENDENTES PARA IR"],
  [["HOMOLOGACAO"], "05 - COMPROVANTE DE DEVOLUÇÃO DA CTPS"],
  [["EXTRATO DE CONTA", "CSE"], "06 - EXTRATO FGTS"],
  [["GFD - GUIA DO FGTS DIGITAL", "GUIA DO FGTS DIGITAL", "PAGAR ESTE DOCUMENTO ATE"], "08 - GUIA GRRF"],
  [["DETALHE DA GUIA", "VENCIMENTO DA GUIA", "TRABALHADORES FGTS", "RELACAO DE TRABALHADORES", "RELACAO DE CATEGORIAS"], "07 - DEMONSTRATIVO GRRF"],
  [["CAMERAS", "USO DE SOM E IMAGEM"], "09 - TERMO DE AUTORIZAÇÃO DE USO DA IMAGEM"],
  [["COMUNICACAO DE DISPENSA", "SEGURO-DESEMPREGO", "POLEGAR DIREITO"], "10 - GUIA SEGURO-DESEMPREGO"],
  [["ALCOOL E DROGAS", "EXAME PRE-ADMISSIONAL"], "11 - TERMO PARA AUTORIZAÇÃO DE TESTES DE IDENTIFICAÇÃO DE ÁLCOOL E DROGAS"],
  [[
    "DECLARACAO DE RENUNCIA DO VALE TRANSPORTE",
    "DECLARACAO DE OPCÃO PELO VALE TRANSPORTE",
    "DECLARACAO DE OPCAO PELO VALE TRANSPORTE",
  ], "14 - DECLARAÇÃO DE VT"],
  [["CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS", "LEI GERAL DE PROTECAO DE DADOS PESSOAIS", "LGPD"], "23 - CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS LGPD"],
  [["GESTAO DE QUALIDADE", "FORQSMS"], "24 - FORMULÁRIO PROGRAMA TODOS PELA VIDA"],
  [["LOGIN NOS SISTEMAS", "USO DO CPF"], "31 - TERMO DE AUTORIZAÇÃO PARA USO DO CPF COMO LOGIN"],
  [["CONTA SALARIO"], "36 - TERMO DE CIÊNCIA DE ABERTURA DE CONTA SALÁRIO"],
  [["ALOJAMENTOS", "DEPREDACAO DO PATRIMONIO"], "39 - TERMO DE RESPONSABILIDADE DE USABILIDADE DE ALOJAMENTOS"],
  [["CONDICOES PARA O FORNECIMENTO", "CLAUSULA 1", "CLAUSULA 2", "JUSTAS E CONTRATADAS"], "43 - TERMO DE FORNECIMENTO DE TRANSPORTE"],
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function safeName(value: string, fallback: string): string {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/*?:"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned || fallback;
}

function uniqueName(name: string, used: Set<string>): string {
  const base = name.replace(/\.pdf$/i, "");
  let candidate = `${base}.pdf`;
  let counter = 1;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}.pdf`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const NAME_LABEL =
  String.raw`(?:NOME(?:\s+DO)?\s*(?:COLABORADOR|FUNCIONARIO|EMPREGADO|TRABALHADOR)?|COLABORADOR|FUNCIONARIO|EMPREGADO|TRABALHADOR)`;
const FIELD_AFTER_NAME =
  String.raw`CPF|CODIGO|MATRICULA|REGISTRO|CHAPA|CARGO|FUNCAO|PIS|PASEP|CTPS|ADMISSAO|EMPRESA|DEPARTAMENTO|SETOR|CENTRO\s+DE\s+CUSTO|DATA`;
const INVALID_NAME_PHRASES = new Set([
  "DADOS DO COLABORADOR",
  "DADOS DO FUNCIONARIO",
  "DEMONSTRATIVO DE PAGAMENTO",
  "RECIBO DE PAGAMENTO",
  "FOLHA DE PAGAMENTO",
  "TOTAL DE VENCIMENTOS",
  "TOTAL DE DESCONTOS",
]);

function cleanNameCandidate(value: string): string | null {
  const cleaned = normalize(value)
    .replace(new RegExp(String.raw`\b(?:${FIELD_AFTER_NAME})\b.*$`), "")
    .replace(/^[^A-Z]+|[^A-Z ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (
    words.length < 2 ||
    words.length > 8 ||
    cleaned.length < 5 ||
    cleaned.length > 80 ||
    /\d/.test(cleaned) ||
    INVALID_NAME_PHRASES.has(cleaned)
  ) {
    return null;
  }
  return safeName(cleaned, "SEM_NOME");
}

function identifyTableEmployee(text: string): {
  registration: string;
  name: string;
} | null {
  const normalized = normalize(text);
  const match = normalized.match(
    /\b(\d{5,})\s+([A-Z][A-Z '’.-]{3,}?)\s*\d{2}\/\d{2}\/\d{4}\b/,
  );
  if (!match) return null;
  const name = cleanNameCandidate(match[2]);
  if (!name) return null;
  return {
    registration: safeName(match[1], match[1]).replace(/\s+/g, "_"),
    name,
  };
}

export function identifyName(text: string): string | null {
  const tableEmployee = identifyTableEmployee(text);
  if (tableEmployee) return tableEmployee.name;

  const lines = text
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
  const normalized = lines.join(" ");

  const sameLinePattern = new RegExp(
    String.raw`\b${NAME_LABEL}\b\s*[:\-–]?\s+(.+?)(?=\s+(?:${FIELD_AFTER_NAME})\b|$)`,
  );
  for (const line of lines) {
    const match = line.match(sameLinePattern);
    const candidate = match?.[1] ? cleanNameCandidate(match[1]) : null;
    if (candidate) return candidate;
  }

  const labelOnlyPattern = new RegExp(String.raw`^\s*${NAME_LABEL}\s*[:\-–]?\s*$`);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (labelOnlyPattern.test(lines[index])) {
      const candidate = cleanNameCandidate(lines[index + 1]);
      if (candidate) return candidate;
    }
  }

  const flattenedMatch = normalized.match(
    new RegExp(
      String.raw`\b${NAME_LABEL}\b\s*[:\-–]?\s+(.+?)(?=\s+(?:${FIELD_AFTER_NAME})\b|$)`,
    ),
  )?.[1];
  return flattenedMatch ? cleanNameCandidate(flattenedMatch) : null;
}

function identifyRegistration(text: string, fallback: string): string {
  const tableEmployee = identifyTableEmployee(text);
  if (tableEmployee) return tableEmployee.registration;

  const match = normalize(text).match(
    /(?:MATRICULA|MATRÍCULA|REGISTRO|CODIGO|CÓDIGO)\s*[:#\-]?\s*([A-Z0-9./-]{2,})/,
  )?.[1];
  return safeName(match ?? fallback, fallback).replace(/\s+/g, "_");
}

export function classifyHrDocument(text: string): string {
  const normalized = normalize(text);
  if (
    normalized.includes("PLANO ODONTOLOGICO") &&
    [
      "PLANO ESCOLHIDO",
      "DADOS DOS DEPENDENTES",
      "BENEFICIARIOS DEPENDENTES",
      "OBJETO DESTE INSTRUMENTO",
      "CAREP",
    ].some((keyword) => normalized.includes(keyword))
  ) {
    return "22 - AUTORIZAÇÃO DE INCLUSÃO DO PLANO ODONTOLÓGICO";
  }
  if (
    normalized.includes("PLANO DE SAUDE") &&
    (
      normalized.includes("DESCONTO EM FOLHA DE PAGAMENTO") ||
      normalized.includes("AUTORIZO A DESCONT")
    )
  ) {
    return "10 - AUTORIZAÇÃO DE DESCONTO DO PLANO DE SAÚDE";
  }
  if (
    normalized.includes("DESCONTOS SINDICAIS") ||
    (
      normalized.includes("CONTRIBUICAO SINDICAL") &&
      normalized.includes("AUTORIZO OS DESCONTOS")
    )
  ) {
    return "07 - AUTORIZAÇÃO PARA DESCONTOS SINDICAIS";
  }
  if (
    normalized.includes("FORNECIMENTO DE TRANSPORTE") ||
    (
      normalized.includes("TRANSPORTE") &&
      normalized.includes("COLABORADOR") &&
      normalized.includes("EMPREGADORA") &&
      (
        normalized.includes("CLAUSULA") ||
        normalized.includes("PASSAGEM") ||
        normalized.includes("ASSINATURA DO COLABORADOR")
      )
    )
  ) {
    return "43 - TERMO DE FORNECIMENTO DE TRANSPORTE";
  }
  for (const [keywords, type] of HR_DOCUMENT_TYPES) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return type;
  }
  if (/\b(TERMO|DECLARACAO|FICHA|CONTRATO)\b/.test(normalized)) {
    return "00 - DOCUMENTO NÃO IDENTIFICADO";
  }
  return "00 - DOCUMENTO NÃO IDENTIFICADO";
}

function assertPdfWasReadable(readablePages: number): void {
  if (readablePages > 0) return;
  throw new Error(
    "Não foi possível ler o conteúdo do PDF. O serviço de leitura/OCR está indisponível ou o arquivo não contém texto legível.",
  );
}

async function createPdf(source: PDFDocument, pageIndexes: number[]): Promise<Buffer> {
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, pageIndexes);
  for (const page of pages) output.addPage(page);
  return Buffer.from(await output.save());
}

async function processPayroll(
  source: PDFDocument,
  extractor: PdfTextExtractor,
  reportProgress: (page: number) => Promise<void>,
): Promise<ProcessedOutput[]> {
  const groups = new Map<string, { pages: number[]; label: string }>();
  const used = new Set<string>();
  let readablePages = 0;
  for (let page = 0; page < source.getPageCount(); page += 1) {
    const extracted = await extractor.extractPage(page);
    if (extracted.source !== "none") readablePages += 1;
    let text = extracted.text;
    let name = identifyName(text);
    if (!name && extracted.source === "text") {
      text = await extractor.extractPageOcr(page);
      name = identifyName(text);
    }
    const registration = identifyRegistration(text, "");
    const identity = registration || name || `documento_${page + 1}`;
    const key = identity.toLowerCase();
    const group = groups.get(key) ?? {
      pages: [],
      label: name ?? identity,
    };
    group.pages.push(page);
    groups.set(key, group);
    await reportProgress(page + 1);
  }
  assertPdfWasReadable(readablePages);
  const outputs: ProcessedOutput[] = [];
  for (const group of groups.values()) {
    outputs.push({
      name: uniqueName(safeName(group.label, "documento"), used),
      data: await createPdf(source, group.pages),
      description: group.label,
    });
  }
  return outputs;
}

async function processAttendance(
  source: PDFDocument,
  extractor: PdfTextExtractor,
  month: string,
  year: string,
  reportProgress: (page: number) => Promise<void>,
): Promise<ProcessedOutput[]> {
  const outputs: ProcessedOutput[] = [];
  const used = new Set<string>();
  let readablePages = 0;
  for (let page = 0; page < source.getPageCount(); page += 1) {
    const extracted = await extractor.extractPage(page);
    if (extracted.source !== "none") readablePages += 1;
    let name = identifyName(extracted.text);
    if (!name && extracted.source === "text") {
      name = identifyName(await extractor.extractPageOcr(page));
    }
    name ??= `documento_${page + 1}`;
    const label = `${month}.${year} - FOLHA DE PONTO - ${name}`;
    outputs.push({
      name: uniqueName(safeName(label, `folha_${page + 1}`), used),
      data: await createPdf(source, [page]),
      description: label,
    });
    await reportProgress(page + 1);
  }
  assertPdfWasReadable(readablePages);
  return outputs;
}

async function processHrDocuments(
  source: PDFDocument,
  extractor: PdfTextExtractor,
  originalName: string,
  reportProgress: (page: number) => Promise<void>,
): Promise<ProcessedOutput[]> {
  const pagesByDocument = new Map<string, number[]>();
  let readablePages = 0;
  const sourcePerson =
    safeName(originalName.replace(/\.pdf$/i, "").split(" - ").at(-1) ?? "", "SEM_NOME");
  for (let page = 0; page < source.getPageCount(); page += 1) {
    const extracted = await extractor.extractPage(page);
    if (extracted.source !== "none") readablePages += 1;
    const { text } = extracted;
    const type = classifyHrDocument(text);
    const key = type;
    const pages = pagesByDocument.get(key) ?? [];
    pages.push(page);
    pagesByDocument.set(key, pages);
    await reportProgress(page + 1);
  }
  assertPdfWasReadable(readablePages);
  const used = new Set<string>();
  const outputs: ProcessedOutput[] = [];
  for (const [type, pages] of pagesByDocument) {
    const fileName = uniqueName(`${type}`, used);
    outputs.push({
      name: `${sourcePerson}/${fileName}`,
      data: await createPdf(source, pages),
      description: `${sourcePerson} / ${type}`,
    });
  }
  return outputs;
}

export async function processPdf(params: {
  data: Buffer;
  moduleId: ProcessingModule;
  fileName: string;
  month?: string;
  year?: string;
  onProgress?: (progress: number) => Promise<void> | void;
}): Promise<PdfProcessingResult> {
  let extractor: PdfTextExtractor | undefined;
  try {
    const source = await PDFDocument.load(params.data);
    extractor = await createPdfTextExtractor(params.data);
    const pages = source.getPageCount();
    if (pages < 1) throw new Error("O PDF não contém páginas.");
    const reportProgress = async (page: number) => {
      await params.onProgress?.(Math.round((page / pages) * 100));
    };
    let outputs: ProcessedOutput[];
    if (params.moduleId === "payroll") {
      outputs = await processPayroll(source, extractor, reportProgress);
    } else if (params.moduleId === "attendance") {
      outputs = await processAttendance(
        source,
        extractor,
        params.month ?? "01",
        params.year ?? String(new Date().getFullYear()),
        reportProgress,
      );
    } else {
      outputs = await processHrDocuments(
        source,
        extractor,
        params.fileName,
        reportProgress,
      );
    }
    if (outputs.length === 0) throw new Error("Nenhum documento foi identificado no PDF.");
    return { pages, outputs };
  } finally {
    await extractor?.close();
  }
}

export async function getPdfPageCount(data: Buffer): Promise<number> {
  const source = await PDFDocument.load(data);
  return source.getPageCount();
}

export async function isPdfData(data: Buffer): Promise<boolean> {
  return data.subarray(0, 5).toString("ascii") === "%PDF-";
}