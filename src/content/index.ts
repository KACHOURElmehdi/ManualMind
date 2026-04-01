import { extractQuestionFromDocument } from "./extraction/parser";
import {
  extract7SpeakingQuestion,
  selectAnswer,
  clickValidate,
  toStandardOptions,
  is7SpeakingQuizPage,
  type SevenSpeakingQuestion
} from "./extraction/sevenSpeaking";
import { errorResponse, isExtensionRequest, successResponse } from "../shared/messages";

let debugModeEnabled = false;
let currentQuestion: SevenSpeakingQuestion | null = null;

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  if (!isExtensionRequest(rawMessage)) {
    return false;
  }

  switch (rawMessage.type) {
    case "EXTRACT_VISIBLE_QUESTION": {
      const parserMode = rawMessage.payload?.parserMode ?? "auto";
      debugModeEnabled = rawMessage.payload?.debugMode ?? debugModeEnabled;

      try {
        // Try 7speaking-specific extraction first
        if (is7SpeakingQuizPage()) {
          const sevenSpeakingData = extract7SpeakingQuestion();
          if (sevenSpeakingData) {
            currentQuestion = sevenSpeakingData;
            sendResponse(
              successResponse({
                questionText: sevenSpeakingData.questionText,
                options: toStandardOptions(sevenSpeakingData.options),
                contextText: "",
                rawText: sevenSpeakingData.questionText,
                strategy: "7speaking",
                extractedAt: new Date().toISOString(),
                debugLog: [`[7speaking] Extracted ${sevenSpeakingData.options.length} options`],
                source: "7speaking",
                hasValidateButton: !!sevenSpeakingData.validateButton
              })
            );
            return true;
          }
        }

        // Fallback to generic extraction
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
          return true;
        }

        sendResponse(successResponse(extracted));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected extraction failure.";
        sendResponse(errorResponse("UNKNOWN_ERROR", "Failed to extract page content.", message));
      }
      return true;
    }

    case "SELECT_ANSWER": {
      const { answerId, autoValidate } = rawMessage.payload ?? {};

      if (!currentQuestion) {
        sendResponse(errorResponse("NO_QUESTION", "No question data available. Extract first."));
        return true;
      }

      try {
        const selected = selectAnswer(currentQuestion.options, answerId);
        if (!selected) {
          sendResponse(errorResponse("SELECTION_FAILED", `Could not find option: ${answerId}`));
          return true;
        }

        // Optionally auto-validate
        if (autoValidate && currentQuestion.validateButton) {
          // Small delay to ensure selection is registered
          setTimeout(() => {
            clickValidate(currentQuestion?.validateButton ?? null);
          }, 300);
        }

        sendResponse(successResponse({ selected: true, answerId, autoValidate }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Selection failed.";
        sendResponse(errorResponse("SELECTION_ERROR", message));
      }
      return true;
    }

    case "CLICK_VALIDATE": {
      if (!currentQuestion?.validateButton) {
        sendResponse(errorResponse("NO_VALIDATE_BUTTON", "No validate button available."));
        return true;
      }

      try {
        clickValidate(currentQuestion.validateButton);
        sendResponse(successResponse({ validated: true }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Validation click failed.";
        sendResponse(errorResponse("VALIDATE_ERROR", message));
      }
      return true;
    }

    default:
      return false;
  }
});
