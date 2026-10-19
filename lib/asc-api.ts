// Minimal App Store Connect REST API client. fastlane `deliver` covers the app
// listing, but it can't touch in-app purchase localizations, so those go
// straight to the API with the same .p8 key metafill already uses.

import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Credentials } from "./types";

const API_ROOT = "https://api.appstoreconnect.apple.com";
// Apple rejects tokens that live longer than 20 minutes.
const TOKEN_TTL_SECONDS = 19 * 60;

export interface AscResource<A = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: A;
}

interface AscListResponse<A> {
  data: AscResource<A>[];
  links?: { next?: string };
}

export interface AscClient {
  list<A>(pathOrUrl: string): Promise<AscResource<A>[]>;
  send<A>(method: "POST" | "PATCH", apiPath: string, body: unknown): Promise<AscResource<A>>;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signToken(creds: Credentials, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: creds.apiKeyId, typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: creds.apiIssuerId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      aud: "appstoreconnect-v1",
    }),
  );
  const signature = createSign("SHA256")
    .update(`${header}.${payload}`)
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

  return `${header}.${payload}.${base64Url(signature)}`;
}

// Apple's error body is { errors: [{ title, detail }] }; surface the details.
function describeError(status: number, body: unknown): string {
  const errors =
    body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)
      ? ((body as { errors: Array<{ title?: string; detail?: string }> }).errors)
      : [];
  const details = errors.map((error) => error.detail || error.title).filter(Boolean);

  return `App Store Connect API ${status}: ${details.join("; ") || "request failed"}`;
}

export async function createAscClient(
  creds: Credentials,
  rootDir: string = process.cwd(),
): Promise<AscClient> {
  const keyPath = creds.apiKeyPath?.trim();

  if (!keyPath || !creds.apiKeyId || !creds.apiIssuerId) {
    throw new Error(
      "In-app purchases need an App Store Connect API key: set Key ID, Issuer ID, and the .p8 key path in Settings.",
    );
  }

  if (keyPath.toLowerCase().endsWith(".json")) {
    throw new Error("In-app purchases need the raw .p8 key path, not a fastlane JSON descriptor.");
  }

  const privateKey = await readFile(path.resolve(rootDir, keyPath), "utf8");
  let token = "";
  let tokenExpiresAt = 0;

  function authHeader(): string {
    // Refresh a minute early so long pushes never send an expired token.
    if (Date.now() / 1000 > tokenExpiresAt - 60) {
      token = signToken(creds, privateKey);
      tokenExpiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    }
    return `Bearer ${token}`;
  }

  async function request(method: string, url: string, body?: unknown): Promise<unknown> {
    const response = await fetch(url.startsWith("http") ? url : `${API_ROOT}${url}`, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(describeError(response.status, json));
    }

    return json;
  }

  return {
    async list<A>(pathOrUrl: string) {
      const items: AscResource<A>[] = [];
      let next: string | undefined = pathOrUrl;

      while (next) {
        const page = (await request("GET", next)) as AscListResponse<A>;
        items.push(...page.data);
        next = page.links?.next;
      }

      return items;
    },
    async send<A>(method: "POST" | "PATCH", apiPath: string, body: unknown) {
      const result = (await request(method, apiPath, body)) as { data: AscResource<A> };
      return result.data;
    },
  };
}
