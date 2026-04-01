import type { ExtractedQuestion } from "../types";

export interface MockTranscriptSample {
  id: string;
  transcript: string;
  language: string;
}

export const SAMPLE_TEXT_QUESTIONS: ExtractedQuestion[] = [
  {
    questionText: "Which HTTP status code means that a requested resource was not found?",
    options: [
      { id: "a", text: "200 OK" },
      { id: "b", text: "201 Created" },
      { id: "c", text: "404 Not Found" },
      { id: "d", text: "500 Internal Server Error" }
    ],
    contextText: "This appears in a basic web development multiple-choice quiz.",
    rawText:
      "Which HTTP status code means that a requested resource was not found? 200 OK 201 Created 404 Not Found 500 Internal Server Error",
    strategy: "mock-sample",
    extractedAt: new Date(0).toISOString(),
    debugLog: ["Sample fixture loaded for text analysis testing."]
  },
  {
    questionText: "What does the acronym SQL stand for?",
    options: [
      { id: "a", text: "Structured Query Language" },
      { id: "b", text: "System Query Logic" },
      { id: "c", text: "Simple Question Language" },
      { id: "d", text: "Sequential Query Link" }
    ],
    contextText: "Database fundamentals practice test.",
    rawText:
      "What does the acronym SQL stand for? Structured Query Language System Query Logic Simple Question Language Sequential Query Link",
    strategy: "mock-sample",
    extractedAt: new Date(0).toISOString(),
    debugLog: ["Sample fixture loaded for text analysis testing."]
  }
];

export const SAMPLE_AUDIO_TRANSCRIPTS: MockTranscriptSample[] = [
  {
    id: "networking",
    transcript:
      "In networking, what protocol is commonly used to securely transfer web pages over the internet?",
    language: "en-US"
  },
  {
    id: "algorithms",
    transcript: "What data structure uses first in first out order for processing elements?",
    language: "en-US"
  },
  {
    id: "security",
    transcript: "In cyber security, what does two factor authentication add beyond a password?",
    language: "en-US"
  }
];
