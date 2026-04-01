import { getAnalysisProvider } from "../shared/analysis/providerFactory";
import { errorResponse, isExtensionRequest, successResponse, type MessageResponse } from "../shared/messages";
import { getSettings, updateSettings } from "../shared/storage/settingsStorage";
import type { AnalysisResult } from "../shared/types";

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
        const settings = await getSettings();
        const provider = getAnalysisProvider(settings.analysisProvider);

        try {
          const result = await provider.analyzeTextQuestion(message.payload.input);
          return successResponse(result);
        } catch (error) {
          if (settings.analysisProvider === "openrouter" && settings.fallbackToMockOnProviderError) {
            return runTextFallback(message.payload.input, error);
          }
          return providerErrorResponse(error, "Text analysis request failed.");
        }
      }
      case "TRANSCRIBE_AUDIO_BLOB": {
        const settings = await getSettings();
        const provider = getAnalysisProvider(settings.analysisProvider);

        try {
          const transcript = await provider.transcribeAudio(message.payload.audioBlob);
          return successResponse(transcript);
        } catch (error) {
          return providerErrorResponse(error, "Audio transcription request failed.");
        }
      }
      case "ANALYZE_TRANSCRIPT": {
        const settings = await getSettings();
        const provider = getAnalysisProvider(settings.analysisProvider);

        try {
          const analysis = await provider.analyzeTranscript(message.payload);
          return successResponse(analysis);
        } catch (error) {
          if (settings.analysisProvider === "openrouter" && settings.fallbackToMockOnProviderError) {
            return runTranscriptFallback(message.payload, error);
          }
          return providerErrorResponse(error, "Transcript analysis request failed.");
        }
      }
      case "SELECT_ANSWER":
      case "CLICK_VALIDATE": {
        // Forward these messages to content script
        let activeTab: ActiveTabContext;
        try {
          activeTab = await getActiveTabContext();
        } catch (error) {
          const details = error instanceof Error ? error.message : "Unable to resolve active tab.";
          return errorResponse("NO_ACTIVE_TAB", "No active tab available.", details);
        }

        return new Promise((resolve) => {
          chrome.tabs.sendMessage(activeTab.id, message, (response) => {
            if (chrome.runtime.lastError) {
              resolve(errorResponse("CONTENT_UNAVAILABLE", chrome.runtime.lastError.message ?? "Failed to reach content script."));
              return;
            }
            resolve(response ?? errorResponse("NO_RESPONSE", "No response from content script."));
          });
        });
      }
      case "ANALYZE_AND_SELECT": {
        // Combined flow: Extract → Analyze → Select
        let activeTab: ActiveTabContext;
        try {
          activeTab = await getActiveTabContext();
        } catch (error) {
          const details = error instanceof Error ? error.message : "Unable to resolve active tab.";
          return errorResponse("NO_ACTIVE_TAB", "No active tab available.", details);
        }

        const settings = await getSettings();
        if (activeTab.url && !isUrlAllowed(activeTab.url, settings.enabledSites)) {
          return errorResponse("BAD_REQUEST", "Site not in enabled list.", activeTab.url);
        }

        // Step 1: Extract question
        const extractionResponse = await sendExtractionRequestToTab(activeTab.id, message.payload);
        if (!extractionResponse.ok) {
          return extractionResponse;
        }

        const extracted = extractionResponse.data as {
          questionText: string;
          options: { id: string; text: string }[];
          contextText: string;
          rawText: string;
        };

        // Step 2: Analyze with AI
        const provider = getAnalysisProvider(settings.analysisProvider);
        let analysisResult;
        try {
          analysisResult = await provider.analyzeTextQuestion({
            questionText: extracted.questionText,
            options: extracted.options,
            contextText: extracted.contextText,
            rawText: extracted.rawText
          });
        } catch (error) {
          if (settings.fallbackToMockOnProviderError) {
            const fallbackResponse = await runTextFallback(extracted, error);
            if (!fallbackResponse.ok) {
              return fallbackResponse;
            }
            analysisResult = fallbackResponse.data;
          } else {
            return providerErrorResponse(error, "Analysis failed.");
          }
        }

        // Step 3: Select the answer
        const selectResponse = await new Promise<MessageResponse<unknown>>((resolve) => {
          chrome.tabs.sendMessage(
            activeTab.id,
            {
              type: "SELECT_ANSWER",
              payload: {
                answerId: analysisResult.suggestedAnswer,
                autoValidate: message.payload?.autoValidate ?? false
              }
            },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve(errorResponse("SELECTION_FAILED", chrome.runtime.lastError.message ?? "Failed to select answer."));
                return;
              }
              resolve(response ?? errorResponse("NO_RESPONSE", "No response from content script."));
            }
          );
        });

        return successResponse({
          extracted,
          analysis: analysisResult,
          selection: selectResponse
        });
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

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    console.error("No tab ID available");
    return;
  }

  // Check if sidePanel API is available
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => {
        console.log("Side panel opened successfully");
      })
      .catch((error) => {
        console.error("Failed to open side panel:", error);
      });
  } else {
    console.error("Side Panel API not available. Check permissions and browser compatibility.");
  }
});

function providerErrorResponse(error: unknown, fallbackMessage: string): MessageResponse<never> {
  if (error instanceof Error) {
    return errorResponse("PROVIDER_ERROR", fallbackMessage, error.message);
  }

  return errorResponse("PROVIDER_ERROR", fallbackMessage);
}

async function runTextFallback(
  input: {
    questionText: string;
    options: { id: string; text: string }[];
    contextText: string;
    rawText: string;
  },
  originalError: unknown
): Promise<MessageResponse<AnalysisResult>> {
  try {
    const mockProvider = getAnalysisProvider("mock");
    const fallbackResult = await mockProvider.analyzeTextQuestion(input);
    const withFallbackInfo: AnalysisResult = {
      ...fallbackResult,
      source: "mock-fallback-after-openrouter-error",
      explanation: `${fallbackResult.explanation} OpenRouter error: ${errorToMessage(originalError)}`
    };

    return successResponse(withFallbackInfo);
  } catch (fallbackError) {
    const details = [
      `primary=${errorToMessage(originalError)}`,
      `fallback=${errorToMessage(fallbackError)}`
    ].join(" | ");
    return errorResponse(
      "PROVIDER_ERROR",
      "Text analysis failed in both OpenRouter and mock fallback paths.",
      details
    );
  }
}

async function runTranscriptFallback(
  input: {
    transcript: string;
    questionText?: string;
    options?: { id: string; text: string }[];
    contextText?: string;
  },
  originalError: unknown
): Promise<MessageResponse<AnalysisResult>> {
  try {
    const mockProvider = getAnalysisProvider("mock");
    const fallbackResult = await mockProvider.analyzeTranscript(input);
    const withFallbackInfo: AnalysisResult = {
      ...fallbackResult,
      source: "mock-fallback-after-openrouter-error",
      explanation: `${fallbackResult.explanation} OpenRouter error: ${errorToMessage(originalError)}`
    };

    return successResponse(withFallbackInfo);
  } catch (fallbackError) {
    const details = [
      `primary=${errorToMessage(originalError)}`,
      `fallback=${errorToMessage(fallbackError)}`
    ].join(" | ");
    return errorResponse(
      "PROVIDER_ERROR",
      "Transcript analysis failed in both OpenRouter and mock fallback paths.",
      details
    );
  }
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown provider error";
}
