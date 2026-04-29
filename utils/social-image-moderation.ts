import { AI_MODEL, getAIApiKey } from "./ai";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export type SocialImageVerdict = {
  allowed: boolean;
  reason: string;
  travelRelated: boolean;
  appropriate: boolean;
};

const ALLOW: SocialImageVerdict = {
  allowed: true,
  reason: "",
  travelRelated: true,
  appropriate: true,
};

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = DATA_URL_PATTERN.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  return { mimeType: match[1], data: match[2] };
}

const MODERATION_INSTRUCTION = [
  "You are a content moderator for CareTrip, a travel app where users share travel photos.",
  "Inspect the attached image and answer with strict JSON only.",
  "An image is travel-related if it depicts travel destinations, landmarks, scenery, food while traveling, hotels, transport, maps, travelers, or similar.",
  "An image is inappropriate if it contains nudity, sexual content, graphic violence, gore, hate symbols, illegal drugs, or harassment.",
  "Selfies and group photos are allowed only if a travel context is visible (location, scenery, transport, accommodation).",
  'Respond with EXACTLY: {"travelRelated":boolean,"appropriate":boolean,"reason":"<short reason>"}.',
  "If the image is allowed, set reason to an empty string.",
].join("\n");

export async function moderateSocialImage(
  imageDataUrl: string
): Promise<SocialImageVerdict> {
  if (!imageDataUrl) {
    return ALLOW;
  }

  const apiKey = getAIApiKey();
  if (!apiKey) {
    return ALLOW;
  }

  const parsed = parseDataUrl(imageDataUrl);
  if (!parsed) {
    return ALLOW;
  }

  const endpoint = `${GEMINI_API_BASE_URL}/models/${AI_MODEL}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Moderate this image for CareTrip." },
          { inlineData: { mimeType: parsed.mimeType, data: parsed.data } },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: MODERATION_INSTRUCTION }] },
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return ALLOW;
  }

  if (!response.ok) {
    return ALLOW;
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return ALLOW;
  }

  const text =
    (raw as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    return ALLOW;
  }

  let parsedResult: { travelRelated?: unknown; appropriate?: unknown; reason?: unknown };
  try {
    parsedResult = JSON.parse(text);
  } catch {
    return ALLOW;
  }

  const travelRelated = parsedResult.travelRelated !== false;
  const appropriate = parsedResult.appropriate !== false;
  const reason =
    typeof parsedResult.reason === "string" ? parsedResult.reason.trim() : "";

  return {
    travelRelated,
    appropriate,
    allowed: travelRelated && appropriate,
    reason,
  };
}
