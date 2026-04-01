import { getAnalysisProvider } from "../shared/analysis/providerFactory";
import { errorResponse, isExtensionRequest, successResponse, type MessageResponse } from "../shared/messages";
import { getSettings, updateSettings } from "../shared/storage/settingsStorage";

async function getActiveTabId(): Promise<number> {
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

  return activeTab.id;
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
      (response: MessageResponse<unknown>) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          reject(new Error(runtimeError));
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
        let tabId: number;
        try {
          tabId = await getActiveTabId();
        } catch (error) {
          const details = error instanceof Error ? error.message : "Unable to resolve active tab.";
          return errorResponse("NO_ACTIVE_TAB", "No active tab is available for extraction.", details);
        }

        try {
          const extractionResponse = await sendExtractionRequestToTab(tabId, message.payload);
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
