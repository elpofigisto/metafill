// Central data contracts shared across the Next app and the CLI scripts.
// Keeping the shapes here (rather than inferring them ad hoc) is the main payoff
// of the TS migration: the settings/config objects that flow between disk, the
// API routes, and the React forms now have one authoritative definition.

// --- AI providers ----------------------------------------------------------

export const AI_PROVIDERS = ["anthropic", "openai", "google"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/** Per-provider API keys. Every provider always has a slot (possibly empty). */
export type AiApiKeys = Record<AiProvider, string>;

// --- App Store Connect settings -------------------------------------------

export const APP_PLATFORMS = ["ios", "osx", "appletvos"] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** Global App Store Connect settings as stored in apps.config.json. */
export interface Settings {
  teamId: string;
  apiKeyId: string;
  apiIssuerId: string;
  apiKeyPath: string;
  /** Empty string until the user picks a provider. */
  aiProvider: AiProvider | "";
  aiModel: string;
  aiApiKeys: AiApiKeys;
}

/**
 * Settings with environment-variable fallback applied. Use this when you need
 * usable credential values. `aiProvider` always resolves to a concrete provider
 * and `aiApiKey` is that provider's key (kept for code that wants a single key).
 */
export interface ResolvedSettings {
  teamId: string;
  apiKeyId: string;
  apiIssuerId: string;
  apiKeyPath: string;
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKeys: AiApiKeys;
  aiApiKey: string;
}

// --- Apps ------------------------------------------------------------------

/** A fully-normalized app entry from apps.config.json. */
export interface AppConfig {
  id: string;
  name: string;
  metadataPath: string;
  appStoreId: string;
  bundleId: string;
  platform: AppPlatform;
  teamId: string;
  apiKeyId: string;
  apiIssuerId: string;
  apiKeyPath: string;
}

/** Effective App Store Connect credentials for a given app. */
export interface Credentials {
  teamId: string;
  apiKeyId: string;
  apiIssuerId: string;
  apiKeyPath: string;
}

/** Raw, unvalidated config as read from disk or an import file. */
export interface RawConfig {
  apps?: unknown;
  settings?: unknown;
}
