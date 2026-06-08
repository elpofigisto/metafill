"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { hasProp, toMessage } from "../../lib/errors";
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
  type AppPayload,
  type LocaleOverview,
  type OverviewSummary,
  type ReviewState,
} from "./metadataClient";
import {
  emptyFiles,
  normalizeLoadedFiles,
  statusFor,
  type FileStatus,
  type MetadataFiles,
} from "./metadataHelpers";

const STORAGE_KEY = "selectedMetadataAppId";

type LocaleOverviewMap = Record<string, LocaleOverview>;
type StatusMap = Record<string, FileStatus>;

/** A translation request awaiting field selection in the popup. */
export interface PendingTranslate {
  locales: string[];
}

export interface MetadataEditorState {
  activeApp: AppPayload | null;
  apps: AppPayload[];
  bulkLocales: string[];
  busyAction: string;
  dirty: boolean;
  error: string;
  files: MetadataFiles;
  loading: boolean;
  message: string;
  missing: string[];
  operationOutput: string;
  overview: LocaleOverviewMap;
  pendingTranslate: PendingTranslate | null;
  refreshing: boolean;
  reviewState: ReviewState;
  saving: boolean;
  selectedAppId: string;
  selectedLocale: string;
  summary: OverviewSummary;
}

export interface MetadataEditorComputed {
  canPublicFetch: boolean;
  canSync: boolean;
  canPublish: boolean;
  canTranslateSelected: boolean;
  aiConfigured: boolean;
  selectedLocaleHasSource: boolean;
  hasLimitWarnings: boolean;
  publishSelectionCount: number;
  selectedLocaleReviewed: boolean;
  statuses: StatusMap;
  translateSelectionCount: number;
}

export interface MetadataEditorActions {
  cancelTranslate: () => void;
  changeApp: (nextAppId: string) => void;
  changeLocale: (nextLocale: string) => void;
  confirmTranslate: (fields: string[]) => Promise<void> | undefined;
  fetchFromAppStore: (source: string) => Promise<void> | undefined;
  markSelectedLocaleReviewed: () => Promise<void>;
  publishBulk: () => Promise<void> | undefined;
  refresh: () => void;
  saveMetadata: (event?: React.FormEvent<HTMLFormElement>) => Promise<void>;
  setBulkSelection: (locales: string[]) => void;
  toggleBulkLocale: (locale: string) => void;
  translateBulk: () => void;
  translateSelectedLocale: () => void;
  updateFile: (fileName: string, value: string) => void;
}

export interface MetadataEditor {
  actions: MetadataEditorActions;
  computed: MetadataEditorComputed;
  state: MetadataEditorState;
}

export function useMetadataEditor(): MetadataEditor {
  const [apps, setApps] = useState<AppPayload[]>([]);
  const [aiConfigured, setAiConfigured] = useState<boolean>(false);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [selectedLocale, setSelectedLocale] = useState<string>(SOURCE_LOCALE);
  const [activeApp, setActiveApp] = useState<AppPayload | null>(null);
  const [files, setFiles] = useState<MetadataFiles>(emptyFiles);
  const [missing, setMissing] = useState<string[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState>({});
  const [overview, setOverview] = useState<LocaleOverviewMap>({});
  const [summary, setSummary] = useState<OverviewSummary>({ total: 0, reviewed: 0, translated: 0 });
  const [bulkLocales, setBulkLocales] = useState<string[]>([]);
  const [pendingTranslate, setPendingTranslate] = useState<PendingTranslate | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string>("");
  const [dirty, setDirty] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [operationOutput, setOperationOutput] = useState<string>("");

  const statuses = useMemo<StatusMap>(
    () =>
      Object.fromEntries(
        METADATA_FILES.map((fileName: string) => [fileName, statusFor(fileName, files[fileName])]),
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
          setError(toMessage(loadError));
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
    (question: string) => !dirty || window.confirm(question),
    [dirty],
  );

  const changeApp = useCallback(
    (nextAppId: string) => {
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
    (nextLocale: string) => {
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

  const updateFile = useCallback((fileName: string, value: string) => {
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

  const toggleBulkLocale = useCallback((locale: string) => {
    setBulkLocales((current) =>
      current.includes(locale)
        ? current.filter((entry) => entry !== locale)
        : [...current, locale],
    );
  }, []);

  const setBulkSelection = useCallback((locales: string[]) => {
    setBulkLocales(locales);
  }, []);

  const runAction = useCallback(async (actionName: string, action: () => Promise<void>) => {
    setBusyAction(actionName);
    setError("");
    setMessage("");
    setOperationOutput("");

    try {
      await action();
    } catch (actionError) {
      setError(toMessage(actionError));
      // Keep any output already streamed into the panel; only fall back to a
      // captured stdout/stderr blob if nothing was streamed.
      const stdout = hasProp(actionError, "stdout") ? actionError.stdout : undefined;
      const stderr = hasProp(actionError, "stderr") ? actionError.stderr : undefined;
      const extra = [stdout, stderr].filter(Boolean).join("\n");
      if (extra) {
        setOperationOutput((prev) => prev || extra);
      }
    } finally {
      setBusyAction("");
    }
  }, []);

  const appendOutput = useCallback((text: string) => {
    setOperationOutput((prev) => prev + text);
  }, []);

  const saveMetadata = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
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
        setError(toMessage(saveError));
      } finally {
        setSaving(false);
      }
    },
    [files, selectedAppId, selectedLocale],
  );

  const fetchFromAppStore = useCallback(
    (source: string) =>
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

  // Both translate buttons open the field-selection popup instead of firing
  // immediately; confirmTranslate runs the request once fields are chosen.
  const translateBulk = useCallback(() => {
    const targets = bulkLocales.filter((locale) => TARGET_LOCALES.includes(locale));

    if (targets.length === 0) {
      setError("Select one or more target locales to translate.");
      return;
    }

    setError("");
    setPendingTranslate({ locales: targets });
  }, [bulkLocales]);

  const translateSelectedLocale = useCallback(() => {
    if (!TARGET_LOCALES.includes(selectedLocale)) {
      setError("Pick a target language to translate - the en-US source can't be translated.");
      return;
    }

    if (
      dirty &&
      !confirmDiscard("Translating overwrites this language from en-US. Discard unsaved changes?")
    ) {
      return;
    }

    setError("");
    setPendingTranslate({ locales: [selectedLocale] });
  }, [confirmDiscard, dirty, selectedLocale]);

  const cancelTranslate = useCallback(() => {
    setPendingTranslate(null);
  }, []);

  const confirmTranslate = useCallback(
    (fields: string[]) => {
      const pending = pendingTranslate;

      if (!pending) {
        return undefined;
      }

      setPendingTranslate(null);

      if (fields.length === 0) {
        setError("Select at least one field to translate.");
        return undefined;
      }

      return runAction("translate", async () => {
        const payload = await translateMetadata(
          selectedAppId,
          pending.locales,
          fields,
          appendOutput,
        );
        const done = payload.locales || pending.locales;

        setMessage(`Translated ${done.join(", ")} for ${payload.app?.name || ""}.`);
        setSelectedLocale(done[0] || selectedLocale);
        setReloadNonce((current) => current + 1);
      });
    },
    [appendOutput, pendingTranslate, runAction, selectedAppId, selectedLocale],
  );

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
      cancelTranslate,
      changeApp,
      changeLocale,
      confirmTranslate,
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
      pendingTranslate,
      refreshing,
      reviewState,
      saving,
      selectedAppId,
      selectedLocale,
      summary,
    },
  };
}
