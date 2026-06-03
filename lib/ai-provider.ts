// Provider-agnostic text translation for the metadata translator.
// Supports Anthropic, OpenAI, and Google (Gemini) via their REST APIs.

import type { AiProvider } from "./types";

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  defaultModel: string;
  envKey: string;
}

export interface AiModel {
  id: string;
  label: string;
}

interface CallArgs {
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}

type Caller = (args: CallArgs) => Promise<string>;
type ModelLister = (apiKey: string) => Promise<AiModel[]>;

export const AI_PROVIDER_INFO: ProviderInfo[] = [
  { id: "anthropic", label: "Anthropic (Claude)", defaultModel: "claude-sonnet-4-6", envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o", envKey: "OPENAI_API_KEY" },
  { id: "google", label: "Google (Gemini)", defaultModel: "gemini-1.5-pro", envKey: "GEMINI_API_KEY" },
];

export function providerInfo(provider: string): ProviderInfo {
  return AI_PROVIDER_INFO.find((entry) => entry.id === provider) || AI_PROVIDER_INFO[0];
}

export function defaultModel(provider: string): string {
  return providerInfo(provider).defaultModel;
}

async function callAnthropic({ model, apiKey, system, user, maxTokens, temperature }: CallArgs): Promise<string> {
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

  const payload = JSON.parse(text) as { content?: Array<{ type: string; text?: string }> };
  return (payload.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function callOpenAI({ model, apiKey, system, user, maxTokens, temperature }: CallArgs): Promise<string> {
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

  const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  return (payload.choices?.[0]?.message?.content || "").trim();
}

async function callGoogle({ model, apiKey, system, user, maxTokens, temperature }: CallArgs): Promise<string> {
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

  const payload = JSON.parse(text) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

const CALLERS: Record<AiProvider, Caller> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  google: callGoogle,
};

// --- Model discovery -------------------------------------------------------
// Each provider exposes a "list models" endpoint. We normalise the responses to
// [{ id, label }] and filter out models that can't do text generation.

async function listAnthropicModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }

  const payload = JSON.parse(text) as { data?: Array<{ id: string; display_name?: string }> };
  return (payload.data || []).map((model) => ({
    id: model.id,
    label: model.display_name || model.id,
  }));
}

async function listOpenAIModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  // OpenAI returns embeddings, audio, image, and moderation models too - keep
  // only the text/chat ones.
  const EXCLUDE =
    /embedding|whisper|tts|audio|dall-e|image|moderation|realtime|transcribe|search|babbage|davinci|ada|curie/i;
  const payload = JSON.parse(text) as { data?: Array<{ id: string }> };
  return (payload.data || [])
    .map((model) => model.id)
    .filter((id) => id && !EXCLUDE.test(id))
    .map((id) => ({ id, label: id }));
}

async function listGoogleModels(apiKey: string): Promise<AiModel[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(
      apiKey,
    )}`,
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google Gemini API error ${response.status}: ${text}`);
  }

  const payload = JSON.parse(text) as {
    models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>;
  };
  return (payload.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
    .map((model) => {
      const id = (model.name || "").replace(/^models\//, "");
      return { id, label: model.displayName || id };
    })
    .filter((model) => model.id);
}

const MODEL_LISTERS: Record<AiProvider, ModelLister> = {
  anthropic: listAnthropicModels,
  openai: listOpenAIModels,
  google: listGoogleModels,
};

export async function listModels({
  provider,
  apiKey,
}: {
  provider: string;
  apiKey: string;
}): Promise<AiModel[]> {
  const lister = (MODEL_LISTERS as Record<string, ModelLister | undefined>)[provider];
  if (!lister) {
    throw new Error(`Unknown AI provider "${provider}". Use one of: ${Object.keys(MODEL_LISTERS).join(", ")}.`);
  }

  if (!apiKey) {
    throw new Error(`Add an API key for "${provider}" before fetching models.`);
  }

  const models = await lister(apiKey);
  const byId = new Map<string, AiModel>();
  for (const model of models) {
    if (model.id) {
      byId.set(model.id, model);
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function translateText({
  provider,
  model,
  apiKey,
  system,
  user,
  maxTokens = 1500,
  temperature = 0.35,
}: {
  provider: string;
  model?: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const caller = (CALLERS as Record<string, Caller | undefined>)[provider];
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
