"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SOURCE_LOCALE,
  TARGET_LOCALES,
  METADATA_FILES,
  LOCALE_LABELS,
} from "../../lib/app-store-metadata";
import {
  fetchMetadata,
  loadApps as apiLoadApps,
  loadMetadata as apiLoadMetadata,
  loadOverview as apiLoadOverview,
  markReviewed,
  publishMetadata,
  saveMetadata as apiSaveMetadata,
  translateMetadata,
} from "./metadataClient";
import { emptyFiles, normalizeLoadedFiles, statusFor } from "./metadataHelpers";

const STORAGE_KEY = "selectedMetadataAppId";

export function useMetadataEditor() {
  const [apps, setApps] = useState([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedLocale, setSelectedLocale] = useState(SOURCE_LOCALE);
  const [activeApp, setActiveApp] = useState(null);
  const [files, setFiles] = useState(emptyFiles);
  const [missing, setMissing] = useState([]);
  const [reviewState, setReviewState] = useState({});
  const [overview, setOverview] = useState({});
  const [summary, setSummary] = useState({ total: 0, reviewed: 0, translated: 0 });
  const [bulkLocales, setBulkLocales] = useState([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [operationOutput, setOperationOutput] = useState("");

  const statuses = useMemo(
    () =>
      Object.fromEntries(
        METADATA_FILES.map((fileName) => [fileName, statusFor(fileName, files[fileName])]),
      ),
    [files],
  );

  const hasLimitWarnings = useMemo(
    () => Object.values(statuses).some((status) => status.overLimit),
    [statuses],
  );

  // 1) Load the configured apps once and pick the active app.
  useEffect(() => {
    let active = true;

    apiLoadApps()
      .then((payload) => {
        if (!active) {
          return;
        }

        const storedAppId = window.localStorage.getItem(STORAGE_KEY);
        const nextAppId =
          payload.apps.find((app) => app.id === storedAppId)?.id ||
          payload.defaultAppId ||
          payload.apps[0]?.id ||
          "";

        setApps(payload.apps);
        setAiConfigured(Boolean(payload.aiConfigured));
        setSelectedAppId(nextAppId);

        if (!nextAppId) {
          setLoading(false);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // 2) Load metadata for the selected app + locale.
  useEffect(() => {
    if (!selectedAppId) {
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError("");

    apiLoadMetadata(selectedAppId, selectedLocale)
      .then((payload) => {
        if (!active) {
          return;
        }

        setActiveApp(payload.app);
        setApps((currentApps) => payload.apps || currentApps);
        setFiles({ ...emptyFiles(), ...normalizeLoadedFiles(payload.files) });
        setMissing(payload.missing || []);
        setReviewState(payload.reviewState || {});
        setDirty(false);
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
  }, [selectedAppId, selectedLocale, reloadNonce]);

  // 3) Load the per-locale overview (status badges + progress) for the app.
  useEffect(() => {
    if (!selectedAppId) {
      return undefined;
    }

    let active = true;

    apiLoadOverview(selectedAppId)
      .then((payload) => {
        if (!active) {
          return;
        }

        setOverview(payload.locales || {});
        setSummary(payload.summary || { total: 0, reviewed: 0, translated: 0 });
      })
      .catch(() => {
        /* overview is non-critical; ignore transient errors */
      })
      .finally(() => {
        if (active) {
          setRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedAppId, reloadNonce, refreshNonce]);

  const confirmDiscard = useCallback(
    (question) => !dirty || window.confirm(question),
    [dirty],
  );

  const changeApp = useCallback(
    (nextAppId) => {
      if (!confirmDiscard("Discard unsaved changes and switch apps?")) {
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, nextAppId);
      setSelectedAppId(nextAppId);
      setSelectedLocale(SOURCE_LOCALE);
      setBulkLocales([]);
      setMessage("");
      setError("");
      setOperationOutput("");
    },
    [confirmDiscard],
  );

  const changeLocale = useCallback(
    (nextLocale) => {
      if (nextLocale === selectedLocale) {
        return;
      }

      if (!confirmDiscard("Discard unsaved changes and switch languages?")) {
        return;
      }

      setSelectedLocale(nextLocale);
      setMessage("");
      setError("");
    },
    [confirmDiscard, selectedLocale],
  );

  const updateFile = useCallback((fileName, value) => {
    setFiles((current) => ({ ...current, [fileName]: value }));
    setDirty(true);
    setMessage("");
  }, []);

  // Re-scan disk: always refresh the sidebar overview (badges/progress); also
  // reload the open locale's files unless there are unsaved edits to protect.
  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((current) => current + 1);

    if (!dirty) {
      setReloadNonce((current) => current + 1);
    }
  }, [dirty]);

  const toggleBulkLocale = useCallback((locale) => {
    setBulkLocales((current) =>
      current.includes(locale)
        ? current.filter((entry) => entry !== locale)
        : [...current, locale],
    );
  }, []);

  const setBulkSelection = useCallback((locales) => {
    setBulkLocales(locales);
  }, []);

  const runAction = useCallback(async (actionName, action) => {
    setBusyAction(actionName);
    setError("");
    setMessage("");
    setOperationOutput("");

    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
      // Keep any output already streamed into the panel; only fall back to a
      // captured stdout/stderr blob if nothing was streamed.
      const extra = [actionError.stdout, actionError.stderr].filter(Boolean).join("\n");
      if (extra) {
        setOperationOutput((prev) => prev || extra);
      }
    } finally {
      setBusyAction("");
    }
  }, []);

  const appendOutput = useCallback((text) => {
    setOperationOutput((prev) => prev + text);
  }, []);

  const saveMetadata = useCallback(
    async (event) => {
      if (event?.preventDefault) {
        event.preventDefault();
      }

      setSaving(true);
      setError("");
      setMessage("");

      try {
        const payload = await apiSaveMetadata(selectedAppId, selectedLocale, files);

        setActiveApp(payload.app);
        setApps((currentApps) => payload.apps || currentApps);
        setFiles({ ...emptyFiles(), ...normalizeLoadedFiles(payload.files) });
        setMissing([]);
        setReviewState(payload.reviewState || {});
        setDirty(false);
        setMessage(`Saved ${LOCALE_LABELS[selectedLocale]} metadata for ${payload.app.name}.`);
        setReloadNonce((current) => current + 1);
      } catch (saveError) {
        setError(saveError.message);
      } finally {
        setSaving(false);
      }
    },
    [files, selectedAppId, selectedLocale],
  );

  const fetchFromAppStore = useCallback(
    (source) =>
      runAction(source === "public" ? "fetch-public" : "fetch-fastlane", async () => {
        const payload = await fetchMetadata(selectedAppId, source, appendOutput);

        setMessage(`Fetched metadata for ${payload.app?.name || ""}.`.trim());
        // The public branch returns a JSON summary (no stream); show it.
        if (payload.stdout) {
          setOperationOutput(payload.stdout);
        }
        setReloadNonce((current) => current + 1);
      }),
    [appendOutput, runAction, selectedAppId],
  );

  const translateBulk = useCallback(() => {
    const targets = bulkLocales.filter((locale) => TARGET_LOCALES.includes(locale));

    if (targets.length === 0) {
      setError("Select one or more target locales to translate.");
      return undefined;
    }

    return runAction("translate", async () => {
      const payload = await translateMetadata(selectedAppId, targets, appendOutput);
      const done = payload.locales || targets;

      setMessage(`Translated ${done.join(", ")} for ${payload.app?.name || ""}.`);
      setSelectedLocale(done[0] || selectedLocale);
      setReloadNonce((current) => current + 1);
    });
  }, [appendOutput, bulkLocales, runAction, selectedAppId, selectedLocale]);

  const translateSelectedLocale = useCallback(() => {
    if (!TARGET_LOCALES.includes(selectedLocale)) {
      setError("Pick a target language to translate - the en-US source can't be translated.");
      return undefined;
    }

    if (
      dirty &&
      !confirmDiscard("Translating overwrites this language from en-US. Discard unsaved changes?")
    ) {
      return undefined;
    }

    return runAction("translate", async () => {
      const payload = await translateMetadata(selectedAppId, [selectedLocale], appendOutput);
      const done = payload.locales || [selectedLocale];

      setMessage(`Translated ${done.join(", ")} for ${payload.app?.name || ""}.`);
      setReloadNonce((current) => current + 1);
    });
  }, [appendOutput, confirmDiscard, dirty, runAction, selectedAppId, selectedLocale]);

  const markSelectedLocaleReviewed = useCallback(
    () =>
      runAction("review", async () => {
        const payload = await markReviewed(selectedAppId, selectedLocale);

        setReviewState(payload.reviewState || {});
        setMessage(`Marked ${LOCALE_LABELS[selectedLocale]} as reviewed.`);
        setBulkLocales((current) =>
          current.includes(selectedLocale) ? current : [...current, selectedLocale],
        );
        setReloadNonce((current) => current + 1);
      }),
    [runAction, selectedAppId, selectedLocale],
  );

  const publishBulk = useCallback(() => {
    const publishable = bulkLocales.filter((locale) => reviewState[locale]?.reviewed);

    if (publishable.length === 0) {
      setError("Select one or more reviewed locales to publish.");
      return undefined;
    }

    if (!window.confirm(`Publish metadata for ${publishable.join(", ")} to App Store Connect?`)) {
      return undefined;
    }

    return runAction("publish", async () => {
      const payload = await publishMetadata(selectedAppId, publishable, appendOutput);

      setMessage(`Published ${(payload.locales || publishable).join(", ")} for ${payload.app?.name || ""}.`);
      setReloadNonce((current) => current + 1);
    });
  }, [appendOutput, bulkLocales, reviewState, runAction, selectedAppId]);

  const selectedLocaleReviewed = Boolean(reviewState[selectedLocale]?.reviewed);
  const selectedLocaleHasSource = Boolean(overview[SOURCE_LOCALE]?.hasContent);
  const canTranslateSelected =
    aiConfigured && TARGET_LOCALES.includes(selectedLocale) && selectedLocaleHasSource;
  const translateSelectionCount = bulkLocales.filter((locale) =>
    TARGET_LOCALES.includes(locale),
  ).length;
  const publishSelectionCount = bulkLocales.filter(
    (locale) => reviewState[locale]?.reviewed,
  ).length;

  return {
    actions: {
      changeApp,
      changeLocale,
      fetchFromAppStore,
      markSelectedLocaleReviewed,
      publishBulk,
      refresh,
      saveMetadata,
      setBulkSelection,
      toggleBulkLocale,
      translateBulk,
      translateSelectedLocale,
      updateFile,
    },
    computed: {
      canPublicFetch: Boolean(activeApp?.appStoreId || activeApp?.bundleId),
      canSync: Boolean(activeApp?.bundleId),
      canPublish:
        publishSelectionCount > 0 && !dirty && Boolean(activeApp?.bundleId),
      canTranslateSelected,
      aiConfigured,
      selectedLocaleHasSource,
      hasLimitWarnings,
      publishSelectionCount,
      selectedLocaleReviewed,
      statuses,
      translateSelectionCount,
    },
    state: {
      activeApp,
      apps,
      bulkLocales,
      busyAction,
      dirty,
      error,
      files,
      loading,
      message,
      missing,
      operationOutput,
      overview,
      refreshing,
      reviewState,
      saving,
      selectedAppId,
      selectedLocale,
      summary,
    },
  };
}
