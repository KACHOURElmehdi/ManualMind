import type { AnalysisResult } from "../types";
import { localDevConfig } from "@local-dev-config";
import { MockAnalysisProvider } from "./mockProvider";
import type { AnalysisProvider, TextQuestionInput, TranscriptAnalysisInput } from "./types";

const SAFETY_NOTICE =
  "Manual-assist mode only. Verify all suggestions yourself. This extension never auto-fills answers or submits forms.";

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeConfidence(value: unknown): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return 0.45;
  }

  return clamp(numeric, 0, 1);
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1]) as Record<string, unknown>;
      } catch {
        // ignored
      }
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    return null;
  }
}

function fromPayload(payload: Record<string, unknown>, source: string): AnalysisResult {
  const suggestedAnswer =
    typeof payload.suggestedAnswer === "string" && payload.suggestedAnswer.trim().length > 0
      ? payload.suggestedAnswer.trim()
      : "No answer suggested";

  const explanation =
    typeof payload.explanation === "string" && payload.explanation.trim().length > 0
      ? payload.explanation.trim()
      : "Model response did not include a clear explanation.";

  const likelyProblem =
    typeof payload.likelyProblem === "string" && payload.likelyProblem.trim().length > 0
      ? payload.likelyProblem.trim()
      : undefined;

  const recommendedNextStep =
    typeof payload.recommendedNextStep === "string" && payload.recommendedNextStep.trim().length > 0
      ? payload.recommendedNextStep.trim()
      : undefined;

  return {
    suggestedAnswer,
    confidence: normalizeConfidence(payload.confidence),
    explanation,
    ...(likelyProblem ? { likelyProblem } : {}),
    ...(recommendedNextStep ? { recommendedNextStep } : {}),
    safetyNotice: SAFETY_NOTICE,
    source
  };
}

function ensureApiKey(): string {
  const apiKey = localDevConfig.openRouter.apiKey.trim();
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is missing. Create src/shared/config/localDevConfig.ts and set openRouter.apiKey."
    );
  }

  return apiKey;
}

function buildSystemPrompt(): string {
  return [
    "You are a manual-review study assistant.",
    "Never provide automation or interaction instructions for websites.",
    "Return only valid JSON with keys:",
    "suggestedAnswer (string), explanation (string), confidence (number 0..1), likelyProblem (string), recommendedNextStep (string)."
  ].join(" ");
}

function buildTextAnalysisPrompt(input: TextQuestionInput): string {
  return JSON.stringify(
    {
      task: "Analyze a visible text question for manual review.",
      questionText: input.questionText,
      options: input.options,
      contextText: input.contextText,
      rawExtractedText: input.rawText
    },
    null,
    2
  );
}

function buildTranscriptPrompt(input: TranscriptAnalysisInput): string {
  return JSON.stringify(
    {
      task: "Analyze a transcript question for manual review.",
      transcript: input.transcript,
      relatedQuestionText: input.questionText ?? "",
      options: input.options ?? [],
      contextText: input.contextText ?? ""
    },
    null,
    2
  );
}

export class OpenRouterAnalysisProvider implements AnalysisProvider {
  private readonly mockProvider = new MockAnalysisProvider();

  async analyzeTextQuestion(input: TextQuestionInput): Promise<AnalysisResult> {
    return this.requestOpenRouter(buildTextAnalysisPrompt(input));
  }

  async transcribeAudio(audioBlob: Blob) {
    return this.mockProvider.transcribeAudio(audioBlob);
  }

  async analyzeTranscript(input: TranscriptAnalysisInput): Promise<AnalysisResult> {
    return this.requestOpenRouter(buildTranscriptPrompt(input));
  }

  private async requestOpenRouter(userPrompt: string): Promise<AnalysisResult> {
    const config = localDevConfig.openRouter;
    const apiKey = ensureApiKey();
    const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    if (config.httpReferer && config.httpReferer.trim()) {
      headers["HTTP-Referer"] = config.httpReferer.trim();
    }

    if (config.appTitle && config.appTitle.trim()) {
      headers["X-OpenRouter-Title"] = config.appTitle.trim();
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: clamp(config.temperature, 0, 1),
        max_tokens: Math.max(64, Math.floor(config.maxTokens)),
        messages: [
          {
            role: "system",
            content: buildSystemPrompt()
          },
          {
            role: "user",
            content: userPrompt
          }
        ]
      })
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed with HTTP ${response.status}. ${rawBody.slice(0, 300)}`
      );
    }

    const parsed = tryParseJsonObject(rawBody) as OpenRouterChatCompletionResponse | null;
    const content = parsed?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenRouter response missing choices[0].message.content.");
    }

    const structuredPayload = tryParseJsonObject(content);
    if (!structuredPayload) {
      throw new Error("OpenRouter response content is not valid JSON.");
    }

    return fromPayload(structuredPayload, `openrouter:${config.model}`);
  }
}
