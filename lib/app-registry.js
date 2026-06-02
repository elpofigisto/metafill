import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_FILE = "apps.config.json";

const DEFAULT_APPS = [
  {
    id: "tidyshot",
    name: "Tidyshot",
    metadataPath: "fastlane/metadata",
  },
];

// Global App Store Connect settings shared by every app. Per-app fields of the
// same name override these, and environment variables are the final fallback so
// existing .env setups keep working.
const SETTINGS_FIELDS = [
  "teamId",
  "apiKeyId",
  "apiIssuerId",
  "apiKeyPath",
  "aiProvider",
  "aiModel",
  "aiApiKey",
];

// Fastlane deliver --platform values. App Store Connect treats each platform's
// metadata/versions separately, so a Mac app must use "osx" or deliver looks at
// the (nonexistent) iOS version and fails with "Cannot find edit app store version".
export const APP_PLATFORMS = ["ios", "osx", "appletvos"];

// Translation AI providers and the env var each one's key falls back to.
export const AI_PROVIDERS = ["anthropic", "openai", "google"];
const AI_KEY_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

const SETTINGS_ENV = {
  teamId: "APP_STORE_CONNECT_TEAM_ID",
  apiKeyId: "APP_STORE_CONNECT_API_KEY_ID",
  apiIssuerId: "APP_STORE_CONNECT_API_ISSUER_ID",
  apiKeyPath: "APP_STORE_CONNECT_API_KEY_PATH",
};

function normalizeApp(rawApp) {
  if (!rawApp || typeof rawApp !== "object") {
    throw new Error("Each app config entry must be an object.");
  }

  const id = String(rawApp.id ?? "").trim();
  const name = String(rawApp.name ?? "").trim();
  const metadataPath = String(rawApp.metadataPath ?? "").trim();
  const appStoreId = String(rawApp.appStoreId ?? "").trim();
  const bundleId = String(rawApp.bundleId ?? "").trim();
  const teamId = String(rawApp.teamId ?? "").trim();
  const apiKeyId = String(rawApp.apiKeyId ?? "").trim();
  const apiIssuerId = String(rawApp.apiIssuerId ?? "").trim();
  const apiKeyPath = String(rawApp.apiKeyPath ?? "").trim();
  const platform = (String(rawApp.platform ?? "").trim() || "ios").toLowerCase();

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    throw new Error(`Invalid app id "${id}". Use letters, numbers, underscores, or hyphens.`);
  }

  if (!APP_PLATFORMS.includes(platform)) {
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
    appStoreId,
    bundleId,
    platform,
    teamId,
    apiKeyId,
    apiIssuerId,
    apiKeyPath,
  };
}

function normalizeSettings(rawSettings) {
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const settings = {};

  for (const field of SETTINGS_FIELDS) {
    settings[field] = String(source[field] ?? "").trim();
  }

  settings.aiProvider = settings.aiProvider.toLowerCase();
  if (settings.aiProvider && !AI_PROVIDERS.includes(settings.aiProvider)) {
    throw new Error(`Invalid AI provider "${settings.aiProvider}". Use one of: ${AI_PROVIDERS.join(", ")}.`);
  }

  return settings;
}

function assertUniqueIds(apps) {
  const seen = new Set();

  for (const app of apps) {
    if (seen.has(app.id)) {
      throw new Error(`Duplicate app id "${app.id}" in ${CONFIG_FILE}.`);
    }

    seen.add(app.id);
  }
}

async function readRawConfig(rootDir) {
  try {
    const rawConfig = await readFile(path.join(rootDir, CONFIG_FILE), "utf8");
    return JSON.parse(rawConfig);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { apps: DEFAULT_APPS, settings: {} };
    }

    throw error;
  }
}

export async function loadConfig(rootDir = process.cwd()) {
  const parsed = await readRawConfig(rootDir);
  const apps = (parsed.apps ?? []).map(normalizeApp);

  if (apps.length === 0) {
    throw new Error(`${CONFIG_FILE} must define at least one app.`);
  }

  assertUniqueIds(apps);

  return {
    apps,
    settings: normalizeSettings(parsed.settings),
  };
}

export async function loadApps(rootDir = process.cwd()) {
  const { apps } = await loadConfig(rootDir);
  return apps;
}

// Resolved global settings with environment-variable fallback. Use this when
// you need usable credential values (vs. the raw stored config).
export async function loadSettings(rootDir = process.cwd()) {
  const { settings } = await loadConfig(rootDir);
  const resolved = {};

  for (const [field, envVar] of Object.entries(SETTINGS_ENV)) {
    resolved[field] = settings[field] || (process.env[envVar] ?? "").trim();
  }

  // AI provider/model/key: provider defaults to anthropic; the key falls back
  // to the provider-specific env var.
  const provider = settings.aiProvider || (process.env.AI_PROVIDER ?? "").trim() || "anthropic";
  resolved.aiProvider = provider;
  resolved.aiModel = settings.aiModel || (process.env.AI_MODEL ?? "").trim() || "";
  resolved.aiApiKey = settings.aiApiKey || (process.env[AI_KEY_ENV[provider]] ?? "").trim() || "";

  return resolved;
}

async function writeConfig(rootDir, { apps, settings }) {
  await writeFile(
    path.join(rootDir, CONFIG_FILE),
    `${JSON.stringify({ settings, apps }, null, 2)}\n`,
    "utf8",
  );
}

export async function saveApps(apps, rootDir = process.cwd()) {
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

export async function saveSettings(rawSettings, rootDir = process.cwd()) {
  const settings = normalizeSettings(rawSettings);
  const existing = await readRawConfig(rootDir);
  const apps = (existing.apps ?? DEFAULT_APPS).map(normalizeApp);

  await writeConfig(rootDir, { apps, settings });

  return settings;
}

export async function findApp(appId, rootDir = process.cwd()) {
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
export function resolveCredentials(app, settings) {
  return {
    teamId: app.teamId || settings.teamId || "",
    apiKeyId: app.apiKeyId || settings.apiKeyId || "",
    apiIssuerId: app.apiIssuerId || settings.apiIssuerId || "",
    apiKeyPath: app.apiKeyPath || settings.apiKeyPath || "",
  };
}

export function metadataRootForApp(rootDir, app) {
  return path.join(rootDir, app.metadataPath);
}
