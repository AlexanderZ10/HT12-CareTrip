/**
 * Shared AI utility — calls the configured Gemini model.
 */

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_AI_MODEL = "gemini-2.5-flash";

function resolveAIModel() {
  const configuredModel = process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim();
  return configuredModel || DEFAULT_AI_MODEL;
}

export const AI_MODEL = resolveAIModel();

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
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const endpoint = `${GEMINI_API_BASE_URL}/models/${AI_MODEL}:generateContent?key=${encodeURIComponent(
    params.apiKey
  )}`;

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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ai-request-failed:${response.status}:${errorText}`);
  }

  const data = await response.json();
  const text = extractGeminiText(data);

  if (!text) {
    throw new Error("empty-ai-response");
  }

  return text;
}

export function getAIApiKey(): string | null {
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? null;
}
