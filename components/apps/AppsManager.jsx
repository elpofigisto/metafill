"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadApps, lookupApp, saveApps } from "../metadata/metadataClient";

function slugify(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function newApp(existingIds) {
  let index = existingIds.length + 1;
  let id = `app-${index}`;

  while (existingIds.includes(id)) {
    index += 1;
    id = `app-${index}`;
  }

  return {
    id,
    name: "New app",
    metadataPath: `apps/${id}/fastlane/metadata`,
    appStoreId: "",
    bundleId: "",
    platform: "ios",
    teamId: "",
    apiKeyId: "",
    apiIssuerId: "",
    apiKeyPath: "",
  };
}

const PLATFORMS = [
  ["ios", "iOS / iPadOS"],
  ["osx", "macOS"],
  ["appletvos", "tvOS"],
];

export default function AppsManager() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookupBusy, setLookupBusy] = useState("");

  useEffect(() => {
    let active = true;

    loadApps()
      .then((payload) => {
        if (active) {
          setApps(payload.apps);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message);
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

  function updateApp(appId, patch) {
    setApps((currentApps) =>
      currentApps.map((app) => (app.id === appId ? { ...app, ...patch } : app)),
    );
    setDirty(true);
    setMessage("");
  }

  function addApp() {
    setApps((currentApps) => [...currentApps, newApp(currentApps.map((app) => app.id))]);
    setDirty(true);
    setMessage("");
  }

  function removeApp(appId) {
    setApps((currentApps) =>
      currentApps.length <= 1 ? currentApps : currentApps.filter((app) => app.id !== appId),
    );
    setDirty(true);
    setMessage("");
  }

  async function runLookup(app) {
    setLookupBusy(app.id);
    setError("");
    setMessage("");

    try {
      const info = await lookupApp({ bundleId: app.bundleId, appStoreId: app.appStoreId });
      const isDefaultName = !app.name || app.name === "New app";
      const nextId =
        app.metadataPath.startsWith(`apps/${app.id}/`) || app.id.startsWith("app-")
          ? slugify(info.name || info.bundleId, app.id)
          : app.id;

      updateApp(app.id, {
        name: isDefaultName ? info.name || app.name : app.name,
        appStoreId: info.appStoreId || app.appStoreId,
        bundleId: info.bundleId || app.bundleId,
      });

      if (nextId !== app.id) {
        updateApp(app.id, { id: nextId, metadataPath: `apps/${nextId}/fastlane/metadata` });
      }

      setMessage(`Found "${info.name}" on the App Store.`);
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setLookupBusy("");
    }
  }

  async function submitApps(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = await saveApps(apps);
      setApps(payload.apps);
      setDirty(false);
      setMessage("Saved apps.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="toolbar">
        <div>
          <h1>Apps</h1>
          <p className="eyebrow">apps.config.json</p>
        </div>
        <div className="toolbar-actions">
          <Link className="nav-link" href="/">
            Metadata
          </Link>
          <Link className="nav-link" href="/settings">
            Settings
          </Link>
          <span className={dirty ? "dirty-pill" : "clean-pill"}>
            {dirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>
      </section>

      {loading ? <div className="notice">Loading apps…</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <form className="panel" onSubmit={submitApps}>
        <div className="panel-header">
          <h2>Configured apps</h2>
          <div className="panel-actions">
            <button className="ghost-button" disabled={loading || saving} type="button" onClick={addApp}>
              Add app
            </button>
            <button disabled={loading || saving || !dirty} type="submit">
              {saving ? "Saving…" : "Save apps"}
            </button>
          </div>
        </div>

        <div className="field-stack" style={{ display: "grid", gap: "14px" }}>
          {apps.map((app) => (
            <section className="app-card" key={app.id}>
              <div className="lookup-row">
                <label>
                  <span className="field-label">Bundle ID</span>
                  <input
                    disabled={loading || saving}
                    placeholder="com.example.app"
                    value={app.bundleId}
                    onChange={(event) => updateApp(app.id, { bundleId: event.target.value })}
                  />
                </label>
                <button
                  className="ghost-button"
                  disabled={loading || saving || lookupBusy === app.id || (!app.bundleId && !app.appStoreId)}
                  type="button"
                  onClick={() => runLookup(app)}
                >
                  {lookupBusy === app.id ? "Looking up…" : "Look up"}
                </button>
              </div>

              <div className="app-grid">
                <label>
                  <span className="field-label">Name</span>
                  <input
                    disabled={loading || saving}
                    value={app.name}
                    onChange={(event) => updateApp(app.id, { name: event.target.value })}
                  />
                </label>
                <label>
                  <span className="field-label">App Store ID</span>
                  <input
                    disabled={loading || saving}
                    placeholder="123456789"
                    value={app.appStoreId}
                    onChange={(event) => updateApp(app.id, { appStoreId: event.target.value })}
                  />
                </label>
                <label>
                  <span className="field-label">Platform</span>
                  <select
                    disabled={loading || saving}
                    value={app.platform || "ios"}
                    onChange={(event) => updateApp(app.id, { platform: event.target.value })}
                  >
                    {PLATFORMS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="advanced">
                <details>
                  <summary>Advanced - ID, metadata path, credential overrides</summary>
                  <div className="advanced-grid">
                    <label>
                      <span className="field-label">App ID (folder key)</span>
                      <input
                        disabled={loading || saving}
                        value={app.id}
                        onChange={(event) => updateApp(app.id, { id: event.target.value })}
                      />
                    </label>
                    <label>
                      <span className="field-label">Metadata path</span>
                      <input
                        disabled={loading || saving}
                        value={app.metadataPath}
                        onChange={(event) => updateApp(app.id, { metadataPath: event.target.value })}
                      />
                    </label>
                    <label>
                      <span className="field-label">Team ID (override)</span>
                      <input
                        disabled={loading || saving}
                        placeholder="inherits Settings"
                        value={app.teamId}
                        onChange={(event) => updateApp(app.id, { teamId: event.target.value })}
                      />
                    </label>
                    <label>
                      <span className="field-label">API Key ID (override)</span>
                      <input
                        disabled={loading || saving}
                        placeholder="inherits Settings"
                        value={app.apiKeyId}
                        onChange={(event) => updateApp(app.id, { apiKeyId: event.target.value })}
                      />
                    </label>
                    <label>
                      <span className="field-label">API Issuer ID (override)</span>
                      <input
                        disabled={loading || saving}
                        placeholder="inherits Settings"
                        value={app.apiIssuerId}
                        onChange={(event) => updateApp(app.id, { apiIssuerId: event.target.value })}
                      />
                    </label>
                    <label>
                      <span className="field-label">.p8 key path (override)</span>
                      <input
                        disabled={loading || saving}
                        placeholder="inherits Settings"
                        value={app.apiKeyPath}
                        onChange={(event) => updateApp(app.id, { apiKeyPath: event.target.value })}
                      />
                    </label>
                  </div>
                </details>
              </div>

              <div className="app-card-footer">
                <button
                  className="secondary-button"
                  disabled={loading || saving || apps.length <= 1}
                  type="button"
                  onClick={() => removeApp(app.id)}
                >
                  Remove
                </button>
              </div>
            </section>
          ))}
        </div>
      </form>
    </main>
  );
}
