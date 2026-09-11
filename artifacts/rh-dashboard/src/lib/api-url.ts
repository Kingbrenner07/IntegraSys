import { setBaseUrl } from "@workspace/api-client-react";

function getConfiguredApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) {
    return import.meta.env.BASE_URL.replace(/\/$/, "");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("VITE_API_BASE_URL precisa ser uma URL HTTP válida.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("VITE_API_BASE_URL precisa usar HTTP ou HTTPS.");
  }

  return url.toString().replace(/\/+$/, "");
}

export const apiBaseUrl = getConfiguredApiBaseUrl();

setBaseUrl(apiBaseUrl || null);

export function apiUrl(path: `/api${string}`) {
  return `${apiBaseUrl}${path}`;
}