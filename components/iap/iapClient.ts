import type { IapChange, IapDocument } from "../../lib/in-app-purchases";
import type { AppConfig } from "../../lib/types";
import { requestJson } from "../metadata/metadataClient";

export interface IapResponse {
  app: AppConfig;
  apps: AppConfig[];
  document: IapDocument | null;
  filePath: string;
  problems: string[];
}

export interface IapPublishResponse {
  changes: IapChange[];
  applied: number;
  failed?: Array<{ productId: string; locale: string; error: string }>;
}

const json = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function loadIap(appId: string): Promise<IapResponse> {
  return requestJson<IapResponse>(`/api/iap?app=${encodeURIComponent(appId)}`, { cache: "no-store" });
}

export function saveIap(appId: string, document: IapDocument): Promise<IapResponse> {
  return requestJson<IapResponse>(`/api/iap?app=${encodeURIComponent(appId)}`, {
    method: "PUT",
    ...json({ document }),
  });
}

export function fetchIap(appId: string): Promise<{ document: IapDocument }> {
  return requestJson("/api/iap/fetch", { method: "POST", ...json({ appId }) });
}

/** Dry run unless `confirmed`; works from the saved file. */
export function publishIap(appId: string, confirmed: boolean): Promise<IapPublishResponse> {
  return requestJson<IapPublishResponse>("/api/iap/publish", {
    method: "POST",
    ...json({ appId, confirmed }),
  });
}
