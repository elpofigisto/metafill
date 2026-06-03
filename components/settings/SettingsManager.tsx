"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { toMessage } from "../../lib/errors";
import type { AiApiKeys, AiProvider } from "../../lib/types";
import type { AiModel } from "../../lib/ai-provider";
import {
  exportConfig,
  fetchModels,
  importConfig,
  loadSettings,
  saveSettings,
  uploadKeyFile,
  type KeyFileInfo,
} from "../metadata/metadataClient";

// String-valued scalar fields editable through `updateField`.
type ScalarFormKey = "teamId" | "apiKeyId" | "apiIssuerId" | "apiKeyPath" | "aiProvider" | "aiModel";

interface SettingsForm {
  teamId: string;
  apiKeyId: string;
  apiIssuerId: string;
  apiKeyPath: string;
  aiProvider: string;
  aiModel: string;
  aiApiKeys: AiApiKeys;
}

interface SettingsField {
  key: "teamId" | "apiKeyId" | "apiIssuerId" | "apiKeyPath";
  label: string;
  placeholder: string;
  hint: string;
}

// `fromEnv` mirrors the form keys with boolean flags; `aiApiKeys` is nested.
interface FromEnv {
  teamId?: boolean;
  apiKeyId?: boolean;
  apiIssuerId?: boolean;
  apiKeyPath?: boolean;
  aiApiKeys?: Partial<Record<string, boolean>>;
  [key: string]: unknown;
}

const FIELDS: SettingsField[] = [
  {
    key: "teamId",
    label: "Team ID",
    placeholder: "ABCDE12345",
    hint: "App Store Connect team identifier, passed to Fastlane as --team_id.",
  },
  {
    key: "apiKeyId",
    label: "API Key ID",
    placeholder: "2X9R4HXF34",
    hint: "Key ID of your App Store Connect API key.",
  },
  {
    key: "apiIssuerId",
    label: "API Issuer ID",
    placeholder: "00000000-0000-0000-0000-000000000000",
    hint: "Users and Access → Integrations → App Store Connect API.",
  },
  {
    key: "apiKeyPath",
    label: ".p8 key path",
    placeholder: "./AuthKey_XXXXXXXXXX.p8",
    hint: "Path to the AuthKey .p8 file, or upload one below. Kept out of version control.",
  },
];

const AI_PROVIDER_OPTIONS: Array<[AiProvider, string, string]> = [
  ["anthropic", "Anthropic (Claude)", "claude-sonnet-4-6"],
  ["openai", "OpenAI", "gpt-4o"],
  ["google", "Google (Gemini)", "gemini-1.5-pro"],
];

const EMPTY: SettingsForm = {
  teamId: "",
  apiKeyId: "",
  apiIssuerId: "",
  apiKeyPath: "",
  aiProvider: "anthropic",
  aiModel: "",
  aiApiKeys: { anthropic: "", openai: "", google: "" },
};

// Build form state from a resolved-settings payload. We drop the scalar
// `aiApiKey` (the active provider's key, kept only for server-side translate
// code) so it can't sneak back in via the legacy-migration path on save.
function toForm(resolved: Record<string, unknown> | null | undefined): SettingsForm {
  const { aiApiKey: _ignore, aiApiKeys, ...rest } = resolved || {};
  return {
    ...EMPTY,
    ...rest,
    aiApiKeys: { ...EMPTY.aiApiKeys, ...((aiApiKeys as Partial<AiApiKeys>) || {}) },
  };
}

export default function SettingsManager() {
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [fromEnv, setFromEnv] = useState<FromEnv>({});
  const [keyFile, setKeyFile] = useState<KeyFileInfo>({ path: "", exists: false });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    loadSettings()
      .then((payload) => {
        if (active) {
          setForm(toForm(payload.resolved as unknown as Record<string, unknown>));
          setFromEnv((payload.fromEnv as FromEnv) || {});
          setKeyFile(payload.keyFile || { path: "", exists: false });
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(toMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function updateField(key: ScalarFormKey, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFromEnv((current) => ({ ...current, [key]: false }));
    setDirty(true);
    setMessage("");
  }

  function updateApiKey(provider: string, value: string) {
    setForm((current) => ({
      ...current,
      aiApiKeys: { ...(current.aiApiKeys || {}), [provider]: value } as AiApiKeys,
    }));
    setFromEnv((current) => ({
      ...current,
      aiApiKeys: { ...(current.aiApiKeys || {}), [provider]: false },
    }));
    setDirty(true);
    setMessage("");
  }

  async function handleKeyUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const content = await file.text();
      const payload = await uploadKeyFile(file.name, content);

      setForm((current) => ({ ...current, apiKeyPath: payload.keyPath }));
      setFromEnv((current) => ({ ...current, apiKeyPath: false }));
      setKeyFile(payload.keyFile || { path: payload.keyPath, exists: true });
      setMessage(`Uploaded key file and set the path to ${payload.keyPath}.`);
    } catch (uploadError) {
      setError(toMessage(uploadError));
    } finally {
      setUploading(false);
    }
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    setError("");
    setMessage("");

    try {
      const provider = form.aiProvider || "anthropic";
      const payload = await fetchModels(provider, form.aiApiKeys?.[provider as AiProvider] || "");
      const fetched = payload.models || [];

      setModels(fetched);
      setMessage(
        fetched.length > 0
          ? `Loaded ${fetched.length} model(s) from ${provider}.`
          : `No models returned for ${provider}.`,
      );
    } catch (fetchError) {
      setModels([]);
      setError(toMessage(fetchError));
    } finally {
      setFetchingModels(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = await saveSettings(form);
      setForm(toForm(payload.resolved as unknown as Record<string, unknown>));
      setFromEnv((payload.fromEnv as FromEnv) || {});
      setKeyFile(payload.keyFile || { path: "", exists: false });
      setDirty(false);
      setMessage("Saved App Store Connect settings.");
    } catch (saveError) {
      setError(toMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setError("");
    setMessage("");

    try {
      const config = await exportConfig();
      const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "aso-config.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${config.apps?.length || 0} app(s) (without the .p8 key).`);
    } catch (exportError) {
      setError(toMessage(exportError));
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("That file is not valid JSON.");
      }

      const result = await importConfig(parsed);
      const fresh = await loadSettings();

      setForm(toForm(fresh.resolved as unknown as Record<string, unknown>));
      setFromEnv((fresh.fromEnv as FromEnv) || {});
      setKeyFile(fresh.keyFile || { path: "", exists: false });
      setDirty(false);
      setMessage(`Imported configuration - ${result.appCount} app(s). Your .p8 key was kept.`);
    } catch (importError) {
      setError(toMessage(importError));
    } finally {
      setImporting(false);
    }
  }

  const aiDefaultModel =
    (AI_PROVIDER_OPTIONS.find(([id]) => id === form.aiProvider) || AI_PROVIDER_OPTIONS[0])[2];

  const keyStatus = keyFile.exists
    ? { className: "clean-pill", label: "Key file found" }
    : keyFile.path
      ? { className: "warning-pill", label: "Not found on disk" }
      : { className: "dirty-pill", label: "No key file yet" };

  return (
    <main className="page-shell">
      <section className="toolbar">
        <div>
          <h1>Settings</h1>
          <p className="eyebrow">App Store Connect · shared by every app</p>
        </div>
        <div className="toolbar-actions">
          <Link className="nav-link" href="/">
            Metadata
          </Link>
          <Link className="nav-link" href="/apps">
            Apps
          </Link>
          <span className={dirty ? "dirty-pill" : "clean-pill"}>
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>
      </section>

      {loading ? <div className="notice">Loading settings…</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <form className="settings-form" onSubmit={submit}>
        <section className="panel">
        <div className="panel-header">
          <h2>App Store Connect API</h2>
          <div className="panel-actions">
            <button disabled={loading || saving || !dirty} type="submit">
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>

        <p className="field-hint">
          Set your Team ID and API key once here. Every app inherits these values unless it sets an
          override on the Apps screen. Values shown from <code>.env</code> are used as a fallback
          until you save them here.
        </p>

        <div className="settings-grid">
          {FIELDS.map((field) => (
            <label key={field.key}>
              <span className="field-label">
                {field.label}
                {fromEnv[field.key] ? <span className="env-tag">from .env</span> : null}
              </span>
              <input
                disabled={loading || saving}
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={(event) => updateField(field.key, event.target.value)}
              />
              <p className="field-hint">{field.hint}</p>
            </label>
          ))}
        </div>

        <div className="key-file">
          <div className="key-file-status">
            <span className={keyStatus.className}>{keyStatus.label}</span>
            <p className="field-hint">
              {keyFile.path
                ? keyFile.exists
                  ? `Using ${keyFile.path}`
                  : `Configured path ${keyFile.path} was not found - upload the .p8 to fix it.`
                : "Upload your AuthKey .p8 to store it here and set the path automatically."}
            </p>
          </div>
          <div>
            <input
              accept=".p8"
              hidden
              ref={fileInputRef}
              type="file"
              onChange={handleKeyUpload}
            />
            <button
              className="ghost-button"
              disabled={loading || saving || uploading}
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload .p8"}
            </button>
          </div>
        </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>AI translation</h2>
          </div>
          <p className="field-hint">
            Used by Translate. Bring your own key - it is stored locally (git-ignored) and never
            sent anywhere except the provider you choose.
          </p>
          <div className="settings-grid">
            <label>
              <span className="field-label">Provider</span>
              <select
                disabled={loading || saving}
                value={form.aiProvider || "anthropic"}
                onChange={(event) => {
                  updateField("aiProvider", event.target.value);
                  // Fetched models belong to the previous provider.
                  setModels([]);
                }}
              >
                {AI_PROVIDER_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="field-hint">Which model service translates your metadata.</p>
            </label>
            <label>
              <span className="field-label">Model</span>
              {models.length > 0 ? (
                <select
                  disabled={loading || saving}
                  value={models.some((model) => model.id === form.aiModel) ? form.aiModel : ""}
                  onChange={(event) => updateField("aiModel", event.target.value)}
                >
                  <option value="">Default ({aiDefaultModel})</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label === model.id ? model.id : `${model.label} (${model.id})`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  disabled={loading || saving}
                  placeholder={aiDefaultModel}
                  value={form.aiModel}
                  onChange={(event) => updateField("aiModel", event.target.value)}
                />
              )}
              <div className="model-fetch-row">
                <button
                  className="ghost-button"
                  disabled={loading || saving || fetchingModels}
                  type="button"
                  onClick={handleFetchModels}
                >
                  {fetchingModels ? "Fetching…" : "Fetch models"}
                </button>
                {models.length > 0 ? (
                  <button className="text-button" type="button" onClick={() => setModels([])}>
                    Enter manually
                  </button>
                ) : null}
              </div>
              <p className="field-hint">
                {models.length > 0
                  ? `${models.length} model(s) from your provider. Leave on Default to use ${aiDefaultModel}.`
                  : `Leave blank to use the default (${aiDefaultModel}), or fetch the live list from your provider.`}
              </p>
            </label>
            <label>
              <span className="field-label">
                API key
                {fromEnv.aiApiKeys?.[form.aiProvider] ? (
                  <span className="env-tag">from .env</span>
                ) : null}
              </span>
              <input
                autoComplete="off"
                disabled={loading || saving}
                placeholder="sk-…"
                type="password"
                value={form.aiApiKeys?.[form.aiProvider as AiProvider] ?? ""}
                onChange={(event) => updateApiKey(form.aiProvider, event.target.value)}
              />
              <p className="field-hint">
                API key for the selected provider. Each provider keeps its own key. Stored locally;
                excluded from Export.
              </p>
            </label>
          </div>
        </section>
      </form>

      <section className="panel">
        <div className="panel-header">
          <h2>Share configuration</h2>
          <div className="panel-actions">
            <button
              className="ghost-button"
              disabled={loading}
              type="button"
              onClick={handleExport}
            >
              Export JSON
            </button>
            <input
              accept=".json,application/json"
              hidden
              ref={importInputRef}
              type="file"
              onChange={handleImport}
            />
            <button
              className="ghost-button"
              disabled={loading || importing}
              type="button"
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? "Importing…" : "Import JSON"}
            </button>
          </div>
        </div>

        <p className="field-hint">
          Export your Team ID, API Key ID, Issuer ID, and the full apps list as a JSON file to
          share with your team. The <code>.p8</code> key file and its path are never included -
          each teammate uploads their own key. Importing replaces your apps list and shared IDs
          but keeps your local <code>.p8</code>.
        </p>
      </section>
    </main>
  );
}
