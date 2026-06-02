// Provider-agnostic text translation for the metadata translator.
// Supports Anthropic, OpenAI, and Google (Gemini) via their REST APIs.

export const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-sonnet-4-6", envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o", envKey: "OPENAI_API_KEY" },
  { id: "google", label: "Google (Gemini)", defaultModel: "gemini-1.5-pro", envKey: "GEMINI_API_KEY" },
];

export function providerInfo(provider) {
  return AI_PROVIDERS.find((entry) => entry.id === provider) || AI_PROVIDERS[0];
}

export function defaultModel(provider) {
  return providerInfo(provider).defaultModel;
}

async function callAnthropic({ model, apiKey, system, user, maxTokens, temperature }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const payload = JSON.parse(text);
  return (payload.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

async function callOpenAI({ model, apiKey, system, user, maxTokens, temperature }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const payload = JSON.parse(text);
  return (payload.choices?.[0]?.message?.content || "").trim();
}

async function callGoogle({ model, apiKey, system, user, maxTokens, temperature }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Gemini API error ${response.status}: ${text}`);
  }

  const payload = JSON.parse(text);
  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

const CALLERS = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  google: callGoogle,
};

export async function translateText({
  provider,
  model,
  apiKey,
  system,
  user,
  maxTokens = 1500,
  temperature = 0.35,
}) {
  const caller = CALLERS[provider];
  if (!caller) {
    throw new Error(`Unknown AI provider "${provider}". Use one of: ${Object.keys(CALLERS).join(", ")}.`);
  }

  const output = await caller({
    model: model || defaultModel(provider),
    apiKey,
    system,
    user,
    maxTokens,
    temperature,
  });

  if (!output) {
    throw new Error(`${provider} returned no text.`);
  }

  return output;
}
