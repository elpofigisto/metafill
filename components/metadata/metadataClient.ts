import type { AppConfig, ResolvedSettings } from "../../lib/types";
import type { AiModel } from "../../lib/ai-provider";

// --- Response shapes -------------------------------------------------------
// Local interfaces describing the JSON each route returns. They cover the
// fields consumed by the editor hook and the manager components.

/** An app entry as returned by the API (all fields present, may be empty). */
export type AppPayload = AppConfig;

/** Per-locale overview info shown in the sidebar badges. */
export interface LocaleOverview {
  exists?: boolean;
  hasContent?: boolean;
  overLimit?: boolean;
  reviewed?: boolean;
}

export interface ReviewEntry {
  reviewed?: boolean;
}

export type ReviewState = Record<string, ReviewEntry>;

export interface OverviewSummary {
  total: number;
  reviewed: number;
  translated: number;
}

export type MetadataFiles = Record<string, string>;

export interface AppsResponse {
  apps: AppPayload[];
  defaultAppId?: string;
  aiConfigured?: boolean;
}

export interface OverviewResponse {
  locales?: Record<string, LocaleOverview>;
  summary?: OverviewSummary;
}

export interface KeyFileInfo {
  path: string;
  exists: boolean;
}

export interface SettingsResponse {
  resolved: ResolvedSettings;
  fromEnv?: Record<string, unknown>;
  keyFile?: KeyFileInfo;
}

export interface SaveSettingsResponse extends SettingsResponse {}

export interface UploadKeyResponse {
  keyPath: string;
  keyFile?: KeyFileInfo;
}

export interface ExportConfigResponse {
  apps?: AppPayload[];
  settings?: unknown;
}

export interface ImportConfigResponse {
  appCount: number;
}

export interface ModelsResponse {
  models?: AiModel[];
}

export interface AppLookupResponse {
  name: string;
  bundleId: string;
  appStoreId: string;
}

export interface MetadataResponse {
  app: AppPayload;
  apps?: AppPayload[];
  files?: MetadataFiles;
  missing?: string[];
  reviewState?: ReviewState;
}

export interface SaveAppsResponse {
  apps: AppPayload[];
}

export interface ReviewResponse {
  reviewState?: ReviewState;
}

/** Final "done" event of a streamed operation, or the JSON of a fast op. */
export interface StreamResult {
  app?: AppPayload;
  locales?: string[];
  stdout?: string;
  [key: string]: unknown;
}

interface StreamEvent {
  type?: string;
  text?: string;
  message?: string;
  [key: string]: unknown;
}

// Error objects from the API carry extra fields (error message, captured
// stdout/stderr) beyond a plain Error.
interface ApiErrorPayload {
  error?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  [key: string]: unknown;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = (await response.json()) as ApiErrorPayload;

  if (!response.ok) {
    throw Object.assign(new Error(payload.error || "Request failed."), payload);
  }

  return payload as unknown as T;
}

// POST a JSON body and consume the response. If the server streams newline-
// delimited JSON events (long operations), `onChunk` is called with each output
// chunk live and the resolved value is the final "done" event. If the server
// replies with plain JSON (validation errors, fast in-process ops), it behaves
// like requestJson.
async function postStream(
  url: string,
  body: unknown,
  onChunk?: (text: string) => void,
): Promise<StreamResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("ndjson")) {
    const payload = (await response.json()) as ApiErrorPayload;
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || "Request failed."), payload);
    }
    return payload as StreamResult;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: StreamResult = {};

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      let event: StreamEvent;
      try {
        event = JSON.parse(line) as StreamEvent;
      } catch {
        continue;
      }

      if (event.type === "out") {
        onChunk?.(event.text ?? "");
      } else if (event.type === "done") {
        result = event;
      } else if (event.type === "error") {
        throw Object.assign(new Error(event.message || "Operation failed."), event);
      }
    }
  }

  return result;
}

export function loadApps(): Promise<AppsResponse> {
  return requestJson<AppsResponse>("/api/apps", { cache: "no-store" });
}

export function loadOverview(appId: string): Promise<OverviewResponse> {
  return requestJson<OverviewResponse>(`/api/overview?app=${encodeURIComponent(appId)}`, {
    cache: "no-store",
  });
}

export function loadSettings(): Promise<SettingsResponse> {
  return requestJson<SettingsResponse>("/api/settings", { cache: "no-store" });
}

export function saveSettings(settings: unknown): Promise<SaveSettingsResponse> {
  return requestJson<SaveSettingsResponse>("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings }),
  });
}

export function uploadKeyFile(filename: string, content: string): Promise<UploadKeyResponse> {
  return requestJson<UploadKeyResponse>("/api/settings/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });
}

export function exportConfig(): Promise<ExportConfigResponse> {
  return requestJson<ExportConfigResponse>("/api/config", { cache: "no-store" });
}

export function importConfig(config: unknown): Promise<ImportConfigResponse> {
  return requestJson<ImportConfigResponse>("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
}

export function fetchModels(provider: string, apiKey: string): Promise<ModelsResponse> {
  return requestJson<ModelsResponse>("/api/ai/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
}

export function lookupApp({
  bundleId,
  appStoreId,
}: {
  bundleId: string;
  appStoreId: string;
}): Promise<AppLookupResponse> {
  return requestJson<AppLookupResponse>("/api/app-lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bundleId, appStoreId }),
  });
}

export function loadMetadata(appId: string, locale: string): Promise<MetadataResponse> {
  return requestJson<MetadataResponse>(
    `/api/metadata?app=${encodeURIComponent(appId)}&locale=${encodeURIComponent(locale)}`,
    { cache: "no-store" },
  );
}

export function saveMetadata(
  appId: string,
  locale: string,
  files: MetadataFiles,
): Promise<MetadataResponse> {
  return requestJson<MetadataResponse>(
    `/api/metadata?app=${encodeURIComponent(appId)}&locale=${encodeURIComponent(locale)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files }),
    },
  );
}

export function saveApps(apps: unknown[]): Promise<SaveAppsResponse> {
  return requestJson<SaveAppsResponse>("/api/apps", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apps }),
  });
}

export function fetchMetadata(
  appId: string,
  source: string,
  onChunk?: (text: string) => void,
): Promise<StreamResult> {
  return postStream("/api/fetch-metadata", { appId, source }, onChunk);
}

export function translateMetadata(
  appId: string,
  locales: string[],
  fields: string[],
  onChunk?: (text: string) => void,
): Promise<StreamResult> {
  return postStream("/api/translate", { appId, locales, fields }, onChunk);
}

export function markReviewed(appId: string, locale: string): Promise<ReviewResponse> {
  return requestJson<ReviewResponse>(`/api/review?app=${encodeURIComponent(appId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale, reviewed: true }),
  });
}

export function publishMetadata(
  appId: string,
  locales: string[],
  onChunk?: (text: string) => void,
): Promise<StreamResult> {
  return postStream("/api/publish", { appId, locales, confirmed: true }, onChunk);
}
