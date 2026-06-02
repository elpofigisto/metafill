import Link from "next/link";

export function TopBar({ actions, computed, state }) {
  const { activeApp, apps, dirty, loading, saving, selectedAppId, selectedLocale, summary } =
    state;

  return (
    <header className="aso-topbar">
      <div className="aso-brand">
        <label className="app-picker">
          <span>App</span>
          <select
            disabled={loading || saving || apps.length === 0}
            value={selectedAppId}
            onChange={(event) => actions.changeApp(event.target.value)}
          >
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
        <p className="aso-path">
          {activeApp ? `${activeApp.metadataPath}/${selectedLocale}` : "fastlane metadata"}
        </p>
      </div>

      <div className="aso-topbar-actions">
        <span className="progress-pill" title="Locales marked reviewed">
          {summary.reviewed}/{summary.total} reviewed
        </span>
        {computed.hasLimitWarnings ? <span className="warning-pill">Limits exceeded</span> : null}
        <span className={dirty ? "dirty-pill" : "clean-pill"}>
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
        <Link className="nav-link" href="/apps">
          Apps
        </Link>
        <Link className="nav-link" href="/settings">
          Settings
        </Link>
      </div>
    </header>
  );
}
