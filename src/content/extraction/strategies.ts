import type { ParserMode, QuestionOption } from "../../shared/types";
import {
  getVisibleInnerText,
  isElementVisible,
  normalizeWhitespace,
  truncate,
  uniqueNormalized
} from "./visibility";

export interface ParseCandidate {
  strategy: string;
  score: number;
  container: HTMLElement;
  questionText: string;
  options: QuestionOption[];
  contextText: string;
  rawText: string;
  debugLog: string[];
}

export interface ParserStrategy {
  name: string;
  parse(root: Document, mode: ParserMode): ParseCandidate | null;
}

function collectVisibleTextBySelectors(container: Element, selectors: string[]): string[] {
  const texts: string[] = [];

  for (const selector of selectors) {
    const matches = container.querySelectorAll(selector);
    for (const match of matches) {
      const text = getVisibleInnerText(match);
      if (text) {
        texts.push(text);
      }
    }
  }

  return uniqueNormalized(texts);
}

function toQuestionOptions(optionTexts: string[]): QuestionOption[] {
  return optionTexts.map((text, index) => ({
    id: String.fromCharCode(97 + index),
    text
  }));
}

function extractOptions(container: Element): QuestionOption[] {
  const optionTexts = collectVisibleTextBySelectors(container, [
    "[data-option]",
    "[data-choice]",
    ".option",
    ".choice",
    "[role='option']",
    "[role='radio']",
    "label",
    "li"
  ]).filter((text) => text.length >= 1 && text.length <= 180);

  return toQuestionOptions(optionTexts.slice(0, 8));
}

function guessQuestionFromRawText(rawText: string): string {
  const lines = rawText
    .split(/[\n\r]|(?<=[.?!])\s+/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 8);

  const withQuestionMark = lines.find((line) => line.includes("?"));
  if (withQuestionMark) {
    return withQuestionMark;
  }

  return lines[0] ?? "";
}

function extractQuestionText(container: Element): string {
  const explicitCandidates = collectVisibleTextBySelectors(container, [
    "[data-question]",
    "[data-question-text]",
    ".question",
    ".question-text",
    ".prompt",
    ".quiz-question",
    "legend",
    "h1",
    "h2",
    "h3",
    "h4",
    "p"
  ]).filter((text) => text.length > 8);

  const explicitWithQuestionMark = explicitCandidates.find((text) => text.includes("?"));
  if (explicitWithQuestionMark) {
    return explicitWithQuestionMark;
  }

  if (explicitCandidates.length > 0) {
    return explicitCandidates[0];
  }

  const rawText = getVisibleInnerText(container);
  return guessQuestionFromRawText(rawText);
}

function extractContextText(container: HTMLElement): string {
  const contexts = collectVisibleTextBySelectors(container, [
    ".instructions",
    ".instruction",
    ".context",
    ".description",
    ".hint",
    "[data-instruction]",
    "[data-context]"
  ]);

  if (contexts.length > 0) {
    return contexts.join(" ");
  }

  const previous = container.previousElementSibling;
  if (previous && isElementVisible(previous)) {
    return truncate(getVisibleInnerText(previous), 300);
  }

  return "";
}

function scoreCandidate(
  questionText: string,
  options: QuestionOption[],
  contextText: string,
  rawText: string,
  baseScore: number
): number {
  const questionSignal = questionText.includes("?") ? 2.4 : Math.min(questionText.length / 60, 1.5);
  const optionSignal =
    options.length >= 2 ? Math.min(options.length * 1.3, 4.2) : Math.min(options.length * 0.35, 0.7);
  const contextSignal = contextText ? Math.min(contextText.length / 140, 1.3) : 0;
  const rawSignal = Math.min(rawText.length / 240, 1.2);

  return baseScore + questionSignal + optionSignal + contextSignal + rawSignal;
}

function createCandidate(
  strategy: string,
  container: HTMLElement,
  baseScore: number,
  debugLog: string[]
): ParseCandidate | null {
  const rawText = truncate(getVisibleInnerText(container));
  if (rawText.length < 20) {
    return null;
  }

  const options = extractOptions(container);
  const questionText = extractQuestionText(container);
  const contextText = extractContextText(container);

  if (!questionText) {
    return null;
  }

  const score = scoreCandidate(questionText, options, contextText, rawText, baseScore);
  return {
    strategy,
    score,
    container,
    questionText,
    options,
    contextText,
    rawText,
    debugLog
  };
}

function pickBest(candidates: ParseCandidate[]): ParseCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((best, current) => (current.score > best.score ? current : best));
}

function visibleMatches(root: Document, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)).filter(isElementVisible);
}

export const quizStrategy: ParserStrategy = {
  name: "quiz-strategy",
  parse(root) {
    const selectors = [
      "[data-question]",
      ".question",
      ".quiz-question",
      ".question-card",
      ".quiz-item",
      ".question-container",
      "fieldset",
      "article",
      "section"
    ];

    const candidates: ParseCandidate[] = [];
    for (const selector of selectors) {
      const matches = visibleMatches(root, selector);
      for (const match of matches) {
        const candidate = createCandidate(this.name, match, 1.8, [
          `Quiz selector match: ${selector}`
        ]);
        if (!candidate) {
          continue;
        }

        if (candidate.options.length >= 2 || candidate.questionText.includes("?")) {
          candidates.push(candidate);
        }
      }
    }

    return pickBest(candidates);
  }
};

export const formLikeStrategy: ParserStrategy = {
  name: "form-like-strategy",
  parse(root) {
    const selectors = ["form fieldset", "fieldset", "form", ".form-group", ".question-group"];
    const candidates: ParseCandidate[] = [];

    for (const selector of selectors) {
      const matches = visibleMatches(root, selector);
      for (const match of matches) {
        const candidate = createCandidate(this.name, match, 1.2, [
          `Form selector match: ${selector}`
        ]);
        if (!candidate) {
          continue;
        }

        const looksFormLike = match.querySelector("input, select, textarea, button, label") !== null;
        if (!looksFormLike) {
          continue;
        }

        candidates.push(candidate);
      }
    }

    return pickBest(candidates);
  }
};

export const genericVisibleBlockStrategy: ParserStrategy = {
  name: "generic-visible-block-strategy",
  parse(root, mode) {
    const matches = Array.from(root.querySelectorAll<HTMLElement>("main, article, section, div")).slice(0, 400);
    const candidates: ParseCandidate[] = [];

    for (const match of matches) {
      if (!isElementVisible(match)) {
        continue;
      }

      const rawText = getVisibleInnerText(match);
      if (rawText.length < 60 || rawText.length > 2_000) {
        continue;
      }

      const candidate = createCandidate(this.name, match, mode === "aggressive" ? 0.95 : 0.4, [
        `Generic container length: ${rawText.length}`
      ]);
      if (!candidate) {
        continue;
      }

      if (!candidate.questionText.includes("?") && mode !== "aggressive") {
        continue;
      }

      candidates.push(candidate);
    }

    return pickBest(candidates);
  }
};
