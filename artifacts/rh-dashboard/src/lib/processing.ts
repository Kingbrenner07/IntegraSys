import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export type ProcessingModule = "payroll" | "attendance" | "hr-documents";

export type UploadedJob = {
  id: number;
  moduleId: string;
  fileName: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  pages: number;
  outputCount: number;
  errorMessage?: string;
  createdAt: string;
};

export type ProcessingOutput = {
  id: number;
  name: string;
  description: string;
  downloadUrl: string;
};

export const DEFAULT_UPLOAD_ERROR = "Falha ao iniciar processamento.";

export function getProcessingErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : DEFAULT_UPLOAD_ERROR;
}

function apiPath(path: string) {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api${path}`;
}

async function authHeaders() {
  const session = (await supabase?.auth.getSession())?.data.session;
  const headers: Record<string, string> = {};
  if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function parseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Não foi possível concluir o processamento.";
}

export async function uploadProcessingFile(params: {
  file: File;
  moduleId: ProcessingModule;
  month?: string;
  year?: string;
}): Promise<UploadedJob> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("moduleId", params.moduleId);
  if (params.month) form.append("month", params.month);
  if (params.year) form.append("year", params.year);
  const response = await fetch(apiPath("/processing/jobs/upload"), {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as UploadedJob;
}

export async function listProcessingOutputs(jobId: number): Promise<ProcessingOutput[]> {
  const response = await fetch(apiPath(`/processing/jobs/${jobId}/outputs`), {
    headers: await authHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as ProcessingOutput[];
}

export function useProcessingOutputs(jobId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["processing-outputs", jobId],
    queryFn: () => listProcessingOutputs(jobId),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

function fileNameFromHeader(response: Response, fallback: string) {
  const header = response.headers.get("content-disposition");
  const match = header?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadProcessingFile(
  jobId: number,
  outputId?: number,
): Promise<void> {
  const path =
    outputId === undefined
      ? `/processing/jobs/${jobId}/download`
      : `/processing/jobs/${jobId}/outputs/${outputId}`;
  const response = await fetch(apiPath(path), { headers: await authHeaders() });
  if (!response.ok) throw new Error(await parseError(response));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileNameFromHeader(
    response,
    outputId === undefined ? `processamento-${jobId}.zip` : "documento.pdf",
  );
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}