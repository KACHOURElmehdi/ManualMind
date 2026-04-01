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
let autoAnswerEnabled = true; // Auto-answer on page changes

// Trigger auto-answer flow via background script
async function triggerAutoAnswer(autoValidate = true): Promise<void> {
  console.log("[7speaking] Triggering auto-answer...");
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_AND_SELECT",
      payload: {
        parserMode: "auto",
        debugMode: debugModeEnabled,
        autoValidate
      }
    });
    
    if (response?.ok) {
      console.log("[7speaking] Auto-answer completed:", response.data);
    } else {
      console.log("[7speaking] Auto-answer failed:", response?.error);
    }
  } catch (error) {
    console.error("[7speaking] Auto-answer error:", error);
  }
}

// Listen for keyboard shortcut (Ctrl + ,)
document.addEventListener("keydown", (event) => {
  // Ctrl + , (comma)
  if (event.ctrlKey && event.key === ",") {
    event.preventDefault();
    console.log("[7speaking] Keyboard shortcut triggered (Ctrl+,)");
    if (is7SpeakingQuizPage()) {
      void triggerAutoAnswer(true);
    }
  }
  
  // Ctrl + . (period) - answer without auto-validate
  if (event.ctrlKey && event.key === ".") {
    event.preventDefault();
    console.log("[7speaking] Keyboard shortcut triggered (Ctrl+.)");
    if (is7SpeakingQuizPage()) {
      void triggerAutoAnswer(false);
    }
  }
});

// Watch for question changes on the page (MutationObserver)
let lastQuestionText = "";
const questionObserver = new MutationObserver(() => {
  if (!autoAnswerEnabled || !is7SpeakingQuizPage()) {
    return;
  }
  
  const questionElement = document.querySelector(".question__title");
  const currentQuestionText = questionElement?.textContent?.trim() ?? "";
  
  // Only trigger if question changed
  if (currentQuestionText && currentQuestionText !== lastQuestionText) {
    lastQuestionText = currentQuestionText;
    console.log("[7speaking] New question detected:", currentQuestionText.substring(0, 50) + "...");
    
    // Small delay to ensure DOM is fully updated
    setTimeout(() => {
      void triggerAutoAnswer(true);
    }, 500);
  }
});

// Start observing when on 7speaking
if (is7SpeakingQuizPage()) {
  console.log("[7speaking] Quiz page detected, starting observer...");
  questionObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Initial auto-answer after page load
  setTimeout(() => {
    const questionElement = document.querySelector(".question__title");
    lastQuestionText = questionElement?.textContent?.trim() ?? "";
    if (lastQuestionText) {
      console.log("[7speaking] Initial question found, auto-answering...");
      void triggerAutoAnswer(true);
    }
  }, 1000);
}

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
    
    case "SET_AUTO_ANSWER": {
      autoAnswerEnabled = rawMessage.payload?.enabled ?? true;
      sendResponse(successResponse({ autoAnswerEnabled }));
      return true;
    }

    default:
      return false;
  }
});
