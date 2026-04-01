import type { AnalysisResult, QuestionOption, TranscriptResult } from "../types";
import { SAMPLE_AUDIO_TRANSCRIPTS } from "../mock/mockData";
import type { AnalysisProvider, TextQuestionInput } from "./types";

const SAFETY_NOTICE =
  "Manual-assist mode only. Verify all suggestions yourself. This extension never auto-fills answers or submits forms.";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreOption(option: QuestionOption, question: string, context: string): number {
  const optionTokens = new Set(tokenize(option.text));
  const questionTokens = tokenize(question);
  const contextTokens = tokenize(context);

  const questionHits = questionTokens.filter((token) => optionTokens.has(token)).length;
  const contextHits = contextTokens.filter((token) => optionTokens.has(token)).length;

  return option.text.length * 0.02 + questionHits * 1.2 + contextHits * 0.6;
}

function buildAnalysisResult(
  answer: string,
  confidence: number,
  explanation: string
): AnalysisResult {
  return {
    suggestedAnswer: answer,
    confidence: clamp(confidence, 0, 1),
    explanation,
    safetyNotice: SAFETY_NOTICE,
    source: "mock-provider-v1"
  };
}

export class MockAnalysisProvider implements AnalysisProvider {
  async analyzeTextQuestion(input: TextQuestionInput): Promise<AnalysisResult> {
    const question = input.questionText.trim();
    if (!question) {
      return buildAnalysisResult(
        "No answer suggested",
        0.05,
        "No readable question text was provided to the analyzer."
      );
    }

    if (input.options.length === 0) {
      return buildAnalysisResult(
        "No structured options detected",
        0.32,
        "The question has no clear choices, so this suggestion is based only on question/context keywords."
      );
    }

    const ranked = input.options
      .map((option) => ({
        option,
        score: scoreOption(option, input.questionText, input.contextText)
      }))
      .sort((left, right) => right.score - left.score);

    const topChoice = ranked[0]?.option.text ?? "No answer suggested";
    const gap = (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0);
    const confidence = 0.5 + clamp(gap * 0.12, 0.04, 0.4);

    return buildAnalysisResult(
      topChoice,
      confidence,
      "Mock heuristic selected the option with strongest token overlap and contextual relevance. Review manually before using."
    );
  }

  async transcribeAudio(audioBlob: Blob): Promise<TranscriptResult> {
    if (audioBlob.size === 0) {
      return {
        transcript: "",
        confidence: 0,
        language: "und",
        debugNotes: "Audio blob is empty."
      };
    }

    const sampleIndex = audioBlob.size % SAMPLE_AUDIO_TRANSCRIPTS.length;
    const selected = SAMPLE_AUDIO_TRANSCRIPTS[sampleIndex] ?? SAMPLE_AUDIO_TRANSCRIPTS[0];
    if (!selected) {
      return {
        transcript: "",
        confidence: 0,
        language: "und",
        debugNotes: "No mock transcript samples are configured."
      };
    }
    const confidence = clamp(0.56 + Math.min(audioBlob.size / 250_000, 0.32), 0.56, 0.88);

    return {
      transcript: selected.transcript,
      confidence,
      language: selected.language,
      debugNotes: `Mock transcript selected deterministically via blob size modulo ${
        SAMPLE_AUDIO_TRANSCRIPTS.length
      } (size=${audioBlob.size}).`
    };
  }

  async analyzeTranscript(transcript: string): Promise<AnalysisResult> {
    const normalized = transcript.toLowerCase();
    if (!normalized.trim()) {
      return buildAnalysisResult(
        "No answer suggested",
        0.04,
        "The transcript is empty, so no reliable suggestion can be made."
      );
    }

    if (normalized.includes("securely transfer web pages") || normalized.includes("protocol")) {
      return buildAnalysisResult(
        "HTTPS (HTTP Secure)",
        0.79,
        "The transcript asks for the secure protocol used for web pages, which maps to HTTPS."
      );
    }

    if (normalized.includes("first in first out") || normalized.includes("fifo")) {
      return buildAnalysisResult(
        "Queue",
        0.82,
        "FIFO behavior corresponds to a queue data structure."
      );
    }

    if (normalized.includes("two factor") || normalized.includes("authentication")) {
      return buildAnalysisResult(
        "An additional verification factor (e.g., one-time code or hardware token)",
        0.74,
        "Two-factor authentication combines a password with a second independent factor."
      );
    }

    return buildAnalysisResult(
      "Insufficient signal for a specific answer",
      0.38,
      "Mock transcript analysis could not match a known pattern. Use transcript text for manual review."
    );
  }
}
