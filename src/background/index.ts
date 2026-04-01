import { getAnalysisProvider } from "../shared/analysis/providerFactory";
import { errorResponse, isExtensionRequest, successResponse, type MessageResponse } from "../shared/messages";
import { getSettings, updateSettings } from "../shared/storage/settingsStorage";

interface ActiveTabContext {
  id: number;
  url?: string;
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (items) => {
      const runtimeError = chrome.runtime.lastError?.message;
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      resolve(items);
    });
  });

  const activeTab = tabs.find((tab) => typeof tab.id === "number");
  if (typeof activeTab?.id !== "number") {
    throw new Error("No active tab available.");
  }

  return typeof activeTab.url === "string"
    ? {
        id: activeTab.id,
        url: activeTab.url
      }
    : {
        id: activeTab.id
      };
}

function wildcardToRegExp(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return null;
  }

  const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`);
  } catch {
    return null;
  }
}

function isUrlAllowed(url: string, allowedPatterns: string[]): boolean {
  if (allowedPatterns.length === 0) {
    return true;
  }

  return allowedPatterns.some((pattern) => {
    const regex = wildcardToRegExp(pattern);
    if (!regex) {
      return false;
    }

    return regex.test(url);
  });
}

async function sendExtractionRequestToTab(
  tabId: number,
  payload?: { parserMode?: "auto" | "quiz" | "aggressive"; debugMode?: boolean }
): Promise<MessageResponse<unknown>> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "EXTRACT_VISIBLE_QUESTION",
        payload
      },
      (response: MessageResponse<unknown> | undefined) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }

        if (!response) {
          reject(new Error("No response received from content script."));
          return;
        }

        resolve(response);
      }
    );
  });
}

async function handleMessage(message: unknown): Promise<MessageResponse<unknown>> {
  if (!isExtensionRequest(message)) {
    return errorResponse("BAD_REQUEST", "Invalid request payload.");
  }

  const provider = getAnalysisProvider();

  try {
    switch (message.type) {
      case "GET_SETTINGS": {
        const settings = await getSettings();
        return successResponse(settings);
      }
      case "SET_SETTINGS": {
        const updated = await updateSettings(message.payload.settings);
        return successResponse(updated);
      }
      case "EXTRACT_VISIBLE_QUESTION": {
        let activeTab: ActiveTabContext;
        try {
          activeTab = await getActiveTabContext();
        } catch (error) {
          const details = error instanceof Error ? error.message : "Unable to resolve active tab.";
          return errorResponse("NO_ACTIVE_TAB", "No active tab is available for extraction.", details);
        }

        const settings = await getSettings();
        if (activeTab.url && !isUrlAllowed(activeTab.url, settings.enabledSites)) {
          return errorResponse(
            "BAD_REQUEST",
            "The current tab URL is not in enabled sites. Update settings to allow this site.",
            activeTab.url
          );
        }

        try {
          const extractionResponse = await sendExtractionRequestToTab(activeTab.id, message.payload);
          return extractionResponse;
        } catch (error) {
          const details =
            error instanceof Error ? error.message : "Unable to reach content script on active tab.";
          return errorResponse(
            "CONTENT_UNAVAILABLE",
            "Could not communicate with content script. Check host permissions and current site scope.",
            details
          );
        }
      }
      case "ANALYZE_TEXT_QUESTION": {
        const result = await provider.analyzeTextQuestion(message.payload.input);
        return successResponse(result);
      }
      case "TRANSCRIBE_AUDIO_BLOB": {
        const transcript = await provider.transcribeAudio(message.payload.audioBlob);
        return successResponse(transcript);
      }
      case "ANALYZE_TRANSCRIPT": {
        const analysis = await provider.analyzeTranscript(message.payload.transcript);
        return successResponse(analysis);
      }
      default:
        return errorResponse("BAD_REQUEST", "Unsupported request type.");
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unhandled error in service worker.";
    return errorResponse("UNKNOWN_ERROR", "Background request handling failed.", details);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then((response) => sendResponse(response));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void getSettings();
});
