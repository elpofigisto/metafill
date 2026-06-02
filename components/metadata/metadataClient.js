async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw Object.assign(new Error(payload.error || "Request failed."), payload);
  }

  return payload;
}

// POST a JSON body and consume the response. If the server streams newline-
// delimited JSON events (long operations), `onChunk` is called with each output
// chunk live and the resolved value is the final "done" event. If the server
// replies with plain JSON (validation errors, fast in-process ops), it behaves
// like requestJson.
async function postStream(url, body, onChunk) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("ndjson")) {
    const payload = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || "Request failed."), payload);
    }
    return payload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = {};

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "out") {
        onChunk?.(event.text);
      } else if (event.type === "done") {
        result = event;
      } else if (event.type === "error") {
        throw Object.assign(new Error(event.message || "Operation failed."), event);
      }
    }
  }

  return result;
}

export function loadApps() {
  return requestJson("/api/apps", { cache: "no-store" });
}

export function loadOverview(appId) {
  return requestJson(`/api/overview?app=${encodeURIComponent(appId)}`, { cache: "no-store" });
}

export function loadSettings() {
  return requestJson("/api/settings", { cache: "no-store" });
}

export function saveSettings(settings) {
  return requestJson("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings }),
  });
}

export function uploadKeyFile(filename, content) {
  return requestJson("/api/settings/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });
}

export function exportConfig() {
  return requestJson("/api/config", { cache: "no-store" });
}

export function importConfig(config) {
  return requestJson("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
}

export function fetchModels(provider, apiKey) {
  return requestJson("/api/ai/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
}

export function lookupApp({ bundleId, appStoreId }) {
  return requestJson("/api/app-lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bundleId, appStoreId }),
  });
}

export function loadMetadata(appId, locale) {
  return requestJson(
    `/api/metadata?app=${encodeURIComponent(appId)}&locale=${encodeURIComponent(locale)}`,
    { cache: "no-store" },
  );
}

export function saveMetadata(appId, locale, files) {
  return requestJson(
    `/api/metadata?app=${encodeURIComponent(appId)}&locale=${encodeURIComponent(locale)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files }),
    },
  );
}

export function saveApps(apps) {
  return requestJson("/api/apps", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apps }),
  });
}

export function fetchMetadata(appId, source, onChunk) {
  return postStream("/api/fetch-metadata", { appId, source }, onChunk);
}

export function translateMetadata(appId, locales, onChunk) {
  return postStream("/api/translate", { appId, locales }, onChunk);
}

export function markReviewed(appId, locale) {
  return requestJson(`/api/review?app=${encodeURIComponent(appId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ locale, reviewed: true }),
  });
}

export function publishMetadata(appId, locales, onChunk) {
  return postStream("/api/publish", { appId, locales, confirmed: true }, onChunk);
}
