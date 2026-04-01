/**
 * 7speaking.com specific extraction strategy
 * Targets the exact DOM structure of 7speaking quiz pages
 */

import type { QuestionOption } from "../../shared/types";

export interface SevenSpeakingQuestion {
  questionText: string;
  options: SevenSpeakingOption[];
  validateButton: HTMLButtonElement | null;
  container: HTMLElement | null;
}

export interface SevenSpeakingOption {
  id: string;
  text: string;
  value: string;
  button: HTMLButtonElement;
}

/**
 * Extract question data from 7speaking.com quiz pages
 */
export function extract7SpeakingQuestion(): SevenSpeakingQuestion | null {
  // Find the question container
  const container = document.querySelector<HTMLElement>(".question-container");
  if (!container) {
    console.log("[7speaking] No .question-container found");
    return null;
  }

  // Extract question title
  const titleElement = container.querySelector<HTMLElement>(".question__title");
  const questionText = titleElement?.textContent?.trim() ?? "";
  if (!questionText) {
    console.log("[7speaking] No .question__title found");
    return null;
  }

  // Find the form
  const form = container.querySelector<HTMLFormElement>(".question__form");
  if (!form) {
    console.log("[7speaking] No .question__form found");
    return null;
  }

  // Find answer container and extract options
  const answerContainer = form.querySelector<HTMLElement>(".answer-container");
  if (!answerContainer) {
    console.log("[7speaking] No .answer-container found");
    return null;
  }

  // Get all answer buttons
  const buttons = answerContainer.querySelectorAll<HTMLButtonElement>("button");
  const options: SevenSpeakingOption[] = [];

  buttons.forEach((button, index) => {
    const labelElement = button.querySelector<HTMLElement>(".question__customLabel");
    const text = labelElement?.textContent?.trim() ?? "";
    const value = button.getAttribute("value") ?? String(index);

    if (text) {
      options.push({
        id: String.fromCharCode(97 + index), // a, b, c, d...
        text,
        value,
        button
      });
    }
  });

  if (options.length === 0) {
    console.log("[7speaking] No options found in .answer-container");
    return null;
  }

  // Find validate button
  const btnsContainer = form.querySelector<HTMLElement>(".question__btns__container");
  const validateButton = btnsContainer?.querySelector<HTMLButtonElement>("button[type='submit']") ?? null;

  console.log("[7speaking] Extracted question:", {
    questionText,
    optionsCount: options.length,
    hasValidateButton: !!validateButton
  });

  return {
    questionText,
    options,
    validateButton,
    container
  };
}

/**
 * Convert 7speaking options to standard QuestionOption format
 */
export function toStandardOptions(options: SevenSpeakingOption[]): QuestionOption[] {
  return options.map((opt) => ({
    id: opt.id,
    text: opt.text
  }));
}

/**
 * Select an answer by clicking the corresponding button
 */
export function selectAnswer(options: SevenSpeakingOption[], answerId: string): boolean {
  const option = options.find((opt) => opt.id === answerId);
  if (!option) {
    console.log("[7speaking] Option not found:", answerId);
    return false;
  }

  console.log("[7speaking] Selecting answer:", option.text);
  option.button.click();
  return true;
}

/**
 * Click the validate button to submit the answer
 */
export function clickValidate(validateButton: HTMLButtonElement | null): boolean {
  if (!validateButton) {
    console.log("[7speaking] No validate button available");
    return false;
  }

  console.log("[7speaking] Clicking validate button");
  validateButton.click();
  return true;
}

/**
 * Check if current page is a 7speaking quiz page
 */
export function is7SpeakingQuizPage(): boolean {
  const url = window.location.href;
  return url.includes("7speaking.com") && document.querySelector(".question-container") !== null;
}
