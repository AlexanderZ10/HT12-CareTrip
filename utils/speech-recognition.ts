import Constants, { ExecutionEnvironment } from "expo-constants";

type SpeechRecognitionStartOptions = {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  maxAlternatives?: number;
};

type SpeechRecognitionPermissionResult = {
  granted: boolean;
};

type SpeechSubscription = { remove: () => void };

type SpeechRecognitionModule = {
  start: (options: SpeechRecognitionStartOptions) => void;
  stop: () => void;
  requestPermissionsAsync: () => Promise<SpeechRecognitionPermissionResult>;
  addListener: (event: string, listener: (payload: unknown) => void) => SpeechSubscription;
};

let cached: SpeechRecognitionModule | null | undefined;

function loadModule(): SpeechRecognitionModule | null {
  if (cached !== undefined) {
    return cached;
  }

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    cached = null;
    return cached;
  }

  try {
    const mod = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule: SpeechRecognitionModule;
    };
    cached = mod.ExpoSpeechRecognitionModule ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isSpeechRecognitionSupported(): boolean {
  return loadModule() !== null;
}

export function getSpeechRecognitionModule(): SpeechRecognitionModule | null {
  return loadModule();
}
