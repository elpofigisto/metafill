import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { hasProp } from "./errors";
import {
  AI_PROVIDERS,
  APP_PLATFORMS,
  isAiProvider,
  type AiApiKeys,
  type AiProvider,
  type AppConfig,
  type AppPlatform,
  type Credentials,
  type RawConfig,
  type ResolvedSettings,
  type Settings,
} from "./types";

// Re-exported so existing importers (`import { AI_PROVIDERS } from "app-registry"`)
// keep working after the constants moved to ./types.
export { AI_PROVIDERS, APP_PLATFORMS };

const CONFIG_FILE = "apps.config.json";

const DEFAULT_APPS = [
  {
    id: "tidyshot",
    name: "Tidyshot",
    metadataPath: "fastlane/metadata",
  },
];

// The env var each provider's key falls back to.
const AI_KEY_ENV: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

// Global App Store Connect settings share these env-var fallbacks so existing
// .env setups keep working.
const SETTINGS_ENV = {
  teamId: "APP_STORE_CONNECT_TEAM_ID",
  apiKeyId: "APP_STORE_CONNECT_API_KEY_ID",
  apiIssuerId: "APP_STORE_CONNECT_API_ISSUER_ID",
  apiKeyPath: "APP_STORE_CONNECT_API_KEY_PATH",
} as const;

type ConfigShape = { apps: AppConfig[]; settings: Settings };

function normalizeApp(rawApp: unknown): AppConfig {
  if (!rawApp || typeof rawApp !== "object") {
    throw new Error("Each app config entry must be an object.");
  }

  const source = rawApp as Record<string, unknown>;
  const get = (key: string) => String(source[key] ?? "").trim();

  const id = get("id");
  const name = get("name");
  const metadataPath = get("metadataPath");
  const platform = (get("platform") || "ios").toLowerCase();

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    throw new Error(`Invalid app id "${id}". Use letters, numbers, underscores, or hyphens.`);
  }

  if (!(APP_PLATFORMS as readonly string[]).includes(platform)) {
    throw new Error(`App "${id}" has invalid platform "${platform}". Use one of: ${APP_PLATFORMS.join(", ")}.`);
  }

  if (!name) {
    throw new Error(`App "${id}" is missing a name.`);
  }

  if (!metadataPath) {
    throw new Error(`App "${id}" is missing metadataPath.`);
  }

  if (path.isAbsolute(metadataPath) || metadataPath.split(path.sep).includes("..")) {
    throw new Error(`App "${id}" metadataPath must be a safe relative path.`);
  }

  return {
    id,
    name,
    metadataPath,
    appStoreId: get("appStoreId"),
    bundleId: get("bundleId"),
    platform: platform as AppPlatform,
    teamId: get("teamId"),
    apiKeyId: get("apiKeyId"),
    apiIssuerId: get("apiIssuerId"),
    apiKeyPath: get("apiKeyPath"),
  };
}

function normalizeSettings(rawSettings: unknown): Settings {
  const source = (
    rawSettings && typeof rawSettings === "object" ? rawSettings : {}
  ) as Record<string, unknown>;
  const get = (key: string) => String(source[key] ?? "").trim();

  const aiProviderRaw = get("aiProvider").toLowerCase();
  if (aiProviderRaw && !isAiProvider(aiProviderRaw)) {
    throw new Error(`Invalid AI provider "${aiProviderRaw}". Use one of: ${AI_PROVIDERS.join(", ")}.`);
  }
  const aiProvider: AiProvider | "" = isAiProvider(aiProviderRaw) ? aiProviderRaw : "";

  // Each provider keeps its own key, so switching providers in the UI never
  // sends the wrong credential. A legacy single `aiApiKey` (from before keys
  // were split) is folded into the slot for whichever provider was active when
  // it was saved, so existing configs keep working without a manual migration.
  const incomingKeys = (
    source.aiApiKeys && typeof source.aiApiKeys === "object" ? source.aiApiKeys : {}
  ) as Record<string, unknown>;
  const aiApiKeys = {} as AiApiKeys;
  for (const provider of AI_PROVIDERS) {
    aiApiKeys[provider] = String(incomingKeys[provider] ?? "").trim();
  }
  const legacyKey = String(source.aiApiKey ?? "").trim();
  if (legacyKey) {
    const legacyProvider: AiProvider = aiProvider || "anthropic";
    aiApiKeys[legacyProvider] = aiApiKeys[legacyProvider] || legacyKey;
  }

  return {
    teamId: get("teamId"),
    apiKeyId: get("apiKeyId"),
    apiIssuerId: get("apiIssuerId"),
    apiKeyPath: get("apiKeyPath"),
    aiProvider,
    aiModel: get("aiModel"),
    aiApiKeys,
  };
}

function assertUniqueIds(apps: AppConfig[]): void {
  const seen = new Set<string>();

  for (const app of apps) {
    if (seen.has(app.id)) {
      throw new Error(`Duplicate app id "${app.id}" in ${CONFIG_FILE}.`);
    }

    seen.add(app.id);
  }
}

async function readRawConfig(rootDir: string): Promise<RawConfig> {
  try {
    const rawConfig = await readFile(path.join(rootDir, CONFIG_FILE), "utf8");
    return JSON.parse(rawConfig) as RawConfig;
  } catch (error) {
    if (hasProp(error, "code") && error.code === "ENOENT") {
      return { apps: DEFAULT_APPS, settings: {} };
    }

    throw error;
  }
}

export async function loadConfig(rootDir: string = process.cwd()): Promise<ConfigShape> {
  const parsed = await readRawConfig(rootDir);
  const rawApps = Array.isArray(parsed.apps) ? parsed.apps : [];
  const apps = rawApps.map(normalizeApp);

  if (apps.length === 0) {
    throw new Error(`${CONFIG_FILE} must define at least one app.`);
  }

  assertUniqueIds(apps);

  return {
    apps,
    settings: normalizeSettings(parsed.settings),
  };
}

export async function loadApps(rootDir: string = process.cwd()): Promise<AppConfig[]> {
  const { apps } = await loadConfig(rootDir);
  return apps;
}

// Resolved global settings with environment-variable fallback. Use this when
// you need usable credential values (vs. the raw stored config).
export async function loadSettings(rootDir: string = process.cwd()): Promise<ResolvedSettings> {
  const { settings } = await loadConfig(rootDir);

  const envOr = (stored: string, envVar: string) =>
    stored || (process.env[envVar] ?? "").trim();

  // AI provider/model/keys: provider defaults to anthropic. Resolve EVERY
  // provider's key (stored value, then its provider-specific env var) so the UI
  // can switch providers without carrying over the wrong key.
  const providerRaw = settings.aiProvider || (process.env.AI_PROVIDER ?? "").trim();
  const provider: AiProvider = isAiProvider(providerRaw) ? providerRaw : "anthropic";

  const aiApiKeys = {} as AiApiKeys;
  for (const candidate of AI_PROVIDERS) {
    aiApiKeys[candidate] =
      settings.aiApiKeys[candidate] || (process.env[AI_KEY_ENV[candidate]] ?? "").trim();
  }

  return {
    teamId: envOr(settings.teamId, SETTINGS_ENV.teamId),
    apiKeyId: envOr(settings.apiKeyId, SETTINGS_ENV.apiKeyId),
    apiIssuerId: envOr(settings.apiIssuerId, SETTINGS_ENV.apiIssuerId),
    apiKeyPath: envOr(settings.apiKeyPath, SETTINGS_ENV.apiKeyPath),
    aiProvider: provider,
    aiModel: settings.aiModel || (process.env.AI_MODEL ?? "").trim(),
    aiApiKeys,
    // The active provider's key, kept for downstream code that wants one key.
    aiApiKey: aiApiKeys[provider] || "",
  };
}

async function writeConfig(rootDir: string, { apps, settings }: ConfigShape): Promise<void> {
  await writeFile(
    path.join(rootDir, CONFIG_FILE),
    `${JSON.stringify({ settings, apps }, null, 2)}\n`,
    "utf8",
  );
}

export async function saveApps(
  apps: unknown[],
  rootDir: string = process.cwd(),
): Promise<AppConfig[]> {
  const normalizedApps = apps.map(normalizeApp);

  if (normalizedApps.length === 0) {
    throw new Error(`${CONFIG_FILE} must define at least one app.`);
  }

  assertUniqueIds(normalizedApps);

  const existing = await readRawConfig(rootDir);
  await writeConfig(rootDir, {
    apps: normalizedApps,
    settings: normalizeSettings(existing.settings),
  });

  return normalizedApps;
}

export async function saveSettings(
  rawSettings: unknown,
  rootDir: string = process.cwd(),
): Promise<Settings> {
  const settings = normalizeSettings(rawSettings);
  const existing = await readRawConfig(rootDir);
  const rawApps = Array.isArray(existing.apps) ? existing.apps : DEFAULT_APPS;
  const apps = rawApps.map(normalizeApp);

  await writeConfig(rootDir, { apps, settings });

  return settings;
}

export async function findApp(
  appId: string,
  rootDir: string = process.cwd(),
): Promise<{ app: AppConfig; apps: AppConfig[]; settings: ResolvedSettings }> {
  const { apps } = await loadConfig(rootDir);
  const settings = await loadSettings(rootDir);
  const selectedId = appId || apps[0].id;
  const app = apps.find((candidate) => candidate.id === selectedId);

  if (!app) {
    throw new Error(`Unknown app "${selectedId}". Available apps: ${apps.map(({ id }) => id).join(", ")}`);
  }

  return {
    app,
    apps,
    settings,
  };
}

// Effective credentials for an app: per-app override wins, then global
// settings (which already fold in environment variables).
export function resolveCredentials(app: AppConfig, settings: Credentials): Credentials {
  return {
    teamId: app.teamId || settings.teamId || "",
    apiKeyId: app.apiKeyId || settings.apiKeyId || "",
    apiIssuerId: app.apiIssuerId || settings.apiIssuerId || "",
    apiKeyPath: app.apiKeyPath || settings.apiKeyPath || "",
  };
}

export function metadataRootForApp(rootDir: string, app: AppConfig): string {
  return path.join(rootDir, app.metadataPath);
}
