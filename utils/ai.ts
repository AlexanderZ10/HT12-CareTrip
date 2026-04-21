/**
 * Shared AI utility — calls the configured Gemini model.
 */

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_AI_MODEL = "gemini-2.5-flash-lite";
const RETRYABLE_AI_STATUS_CODES = new Set([429, 503]);
const MAX_AI_RETRIES = 3;

function normalizeConfiguredAIModel(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue || normalizedValue === "gemini-2.5-flash-lte") {
    return DEFAULT_AI_MODEL;
  }

  return normalizedValue;
}

function resolveAIModel() {
  const configuredModel = process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim();
  return normalizeConfiguredAIModel(configuredModel || DEFAULT_AI_MODEL);
}

export const AI_MODEL = resolveAIModel();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterDelayMs(headerValue: string | null) {
  if (!headerValue) {
    return null;
  }

  const seconds = Number(headerValue);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDateMs = Date.parse(headerValue);

  if (!Number.isFinite(retryDateMs)) {
    return null;
  }

  return Math.max(retryDateMs - Date.now(), 0);
}

function getRetryDelayMs(status: number, attempt: number, retryAfterHeader: string | null) {
  const retryAfterDelayMs = getRetryAfterDelayMs(retryAfterHeader);

  if (retryAfterDelayMs !== null) {
    return Math.min(retryAfterDelayMs, 12000);
  }

  const baseDelayMs = status === 429 ? 2200 : 1600;
  const jitterMs = Math.floor(Math.random() * 500);

  return Math.min(baseDelayMs * 2 ** attempt + jitterMs, 12000);
}

function buildGeminiContents(params: {
  prompt: string;
  systemPrompt?: string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
}) {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (params.conversationHistory) {
    for (const message of params.conversationHistory) {
      contents.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      });
    }
  }

  contents.push({
    role: "user",
    parts: [{ text: params.prompt }],
  });

  return contents;
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const candidates =
    "candidates" in data && Array.isArray(data.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const content =
      "content" in candidate && candidate.content && typeof candidate.content === "object"
        ? candidate.content
        : null;

    const parts =
      content && "parts" in content && Array.isArray(content.parts) ? content.parts : [];

    const text = parts
      .map((part: unknown) => {
        if (!part || typeof part !== "object") {
          return "";
        }

        return "text" in part && typeof part.text === "string" ? part.text : "";
      })
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

export async function callAI(params: {
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
  jsonMode?: boolean;
  googleSearchGrounding?: boolean;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const endpoint = `${GEMINI_API_BASE_URL}/models/${AI_MODEL}:generateContent`;

  const systemInstruction = params.jsonMode
    ? [params.systemPrompt, "Return only a valid JSON object. No markdown fences. No commentary."]
        .filter(Boolean)
        .join("\n\n")
    : params.systemPrompt?.trim() || "";

  const body: Record<string, unknown> = {
    contents: buildGeminiContents(params),
    generationConfig: {
      temperature: params.jsonMode ? 0.2 : 0.7,
      responseMimeType: params.jsonMode ? "application/json" : "text/plain",
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (params.googleSearchGrounding) {
    body.tools = [{ google_search: {} }];
  }

  for (let attempt = 0; attempt <= MAX_AI_RETRIES; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      const text = extractGeminiText(data);

      if (!text) {
        throw new Error("empty-ai-response");
      }

      return text;
    }

    const errorText = await response.text();
    const shouldRetry =
      RETRYABLE_AI_STATUS_CODES.has(response.status) && attempt < MAX_AI_RETRIES;

    if (shouldRetry) {
      const retryDelayMs = getRetryDelayMs(
        response.status,
        attempt,
        response.headers.get("retry-after")
      );

      await wait(retryDelayMs);
      continue;
    }

    throw new Error(`ai-request-failed:${response.status}:${errorText}`);
  }

  throw new Error("empty-ai-response");
}

export function getAIApiKey(): string | null {
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? null;
}
