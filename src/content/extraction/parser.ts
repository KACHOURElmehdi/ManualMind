import type { ExtractedQuestion, ParserMode } from "../../shared/types";
import {
  formLikeStrategy,
  genericVisibleBlockStrategy,
  type ParseCandidate,
  type ParserStrategy,
  quizStrategy
} from "./strategies";

const DEBUG_ATTRIBUTE = "data-study-assistant-debug";
const DEBUG_COLORS = ["#10b981", "#3b82f6", "#f59e0b"];

function clearDebugMarkers(): void {
  const tagged = document.querySelectorAll<HTMLElement>(`[${DEBUG_ATTRIBUTE}]`);
  for (const element of tagged) {
    element.style.outline = "";
    element.style.outlineOffset = "";
    element.style.boxShadow = "";
    element.removeAttribute(DEBUG_ATTRIBUTE);
  }
}

function applyDebugMarker(candidate: ParseCandidate, rank: number): void {
  const color = DEBUG_COLORS[rank] ?? "#f59e0b";
  candidate.container.setAttribute(DEBUG_ATTRIBUTE, `${candidate.strategy}:${candidate.score.toFixed(2)}`);
  candidate.container.style.outline = `2px dashed ${color}`;
  candidate.container.style.outlineOffset = "2px";
  candidate.container.style.boxShadow = `0 0 0 1px ${color}55`;
}

function chooseStrategies(parserMode: ParserMode): ParserStrategy[] {
  if (parserMode === "quiz") {
    return [quizStrategy];
  }

  if (parserMode === "aggressive") {
    return [quizStrategy, formLikeStrategy, genericVisibleBlockStrategy];
  }

  return [quizStrategy, formLikeStrategy, genericVisibleBlockStrategy];
}

export function extractQuestionFromDocument(options: {
  parserMode: ParserMode;
  debugMode: boolean;
}): ExtractedQuestion | null {
  const { parserMode, debugMode } = options;
  const strategies = chooseStrategies(parserMode);
  const candidates: ParseCandidate[] = [];

  for (const strategy of strategies) {
    const candidate = strategy.parse(document, parserMode);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    clearDebugMarkers();
    return null;
  }

  const ranked = candidates.sort((left, right) => right.score - left.score);
  const selected = ranked[0];
  if (!selected) {
    clearDebugMarkers();
    return null;
  }

  if (debugMode) {
    clearDebugMarkers();
    ranked.slice(0, 3).forEach((candidate, index) => applyDebugMarker(candidate, index));
  } else {
    clearDebugMarkers();
  }

  const debugLog = ranked.slice(0, 3).map((candidate, index) => {
    const position = index + 1;
    return `${position}. ${candidate.strategy} score=${candidate.score.toFixed(2)} | ${
      candidate.debugLog.join("; ") || "No extra notes"
    }`;
  });

  return {
    questionText: selected.questionText,
    options: selected.options,
    contextText: selected.contextText,
    rawText: selected.rawText,
    strategy: selected.strategy,
    extractedAt: new Date().toISOString(),
    debugLog
  };
}
