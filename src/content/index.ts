import { extractQuestionFromDocument } from "./extraction/parser";
import { errorResponse, isExtensionRequest, successResponse } from "../shared/messages";

let debugModeEnabled = false;

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  if (!isExtensionRequest(rawMessage)) {
    return false;
  }

  if (rawMessage.type !== "EXTRACT_VISIBLE_QUESTION") {
    return false;
  }

  const parserMode = rawMessage.payload?.parserMode ?? "auto";
  debugModeEnabled = rawMessage.payload?.debugMode ?? debugModeEnabled;

  try {
    const extracted = extractQuestionFromDocument({
      parserMode,
      debugMode: debugModeEnabled
    });

    if (!extracted) {
      sendResponse(
        errorResponse(
          "PARSER_EMPTY",
          "No visible question-like content was detected on the current page."
        )
      );
      return false;
    }

    sendResponse(successResponse(extracted));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected extraction failure.";
    sendResponse(errorResponse("UNKNOWN_ERROR", "Failed to extract page content.", message));
  }

  return false;
});
