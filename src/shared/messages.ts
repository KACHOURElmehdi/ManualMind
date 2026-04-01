import type { ExtractedQuestion, ExtensionSettings, ParserMode } from "./types";

export type ExtensionRequest =
  | {
      type: "EXTRACT_VISIBLE_QUESTION";
      payload?: {
        parserMode?: ParserMode;
        debugMode?: boolean;
      };
    }
  | {
      type: "ANALYZE_TEXT_QUESTION";
      payload: {
        input: ExtractedQuestion;
      };
    }
  | {
      type: "TRANSCRIBE_AUDIO_BLOB";
      payload: {
        audioBlob: Blob;
      };
    }
  | {
      type: "ANALYZE_TRANSCRIPT";
      payload: {
        transcript: string;
        questionText?: string;
        options?: ExtractedQuestion["options"];
        contextText?: string;
      };
    }
  | {
      type: "GET_SETTINGS";
    }
  | {
      type: "SET_SETTINGS";
      payload: {
        settings: Partial<ExtensionSettings>;
      };
    }
  | {
      type: "SELECT_ANSWER";
      payload: {
        answerId: string;
        autoValidate?: boolean;
      };
    }
  | {
      type: "CLICK_VALIDATE";
    }
  | {
      type: "ANALYZE_AND_SELECT";
      payload?: {
        parserMode?: ParserMode;
        debugMode?: boolean;
        autoValidate?: boolean;
      };
    };

export type ErrorCode =
  | "BAD_REQUEST"
  | "NO_ACTIVE_TAB"
  | "CONTENT_UNAVAILABLE"
  | "PARSER_EMPTY"
  | "PROVIDER_ERROR"
  | "STORAGE_ERROR"
  | "UNKNOWN_ERROR"
  | "NO_QUESTION"
  | "SELECTION_FAILED"
  | "SELECTION_ERROR"
  | "NO_VALIDATE_BUTTON"
  | "VALIDATE_ERROR"
  | "NO_RESPONSE";

export interface ExtensionError {
  code: ErrorCode;
  message: string;
  details?: string;
}

export type MessageResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ExtensionError;
    };

const REQUEST_TYPES = new Set<ExtensionRequest["type"]>([
  "EXTRACT_VISIBLE_QUESTION",
  "ANALYZE_TEXT_QUESTION",
  "TRANSCRIBE_AUDIO_BLOB",
  "ANALYZE_TRANSCRIPT",
  "GET_SETTINGS",
  "SET_SETTINGS",
  "SELECT_ANSWER",
  "CLICK_VALIDATE",
  "ANALYZE_AND_SELECT"
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  return REQUEST_TYPES.has(value.type as ExtensionRequest["type"]);
}

export function successResponse<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: string
): MessageResponse<never> {
  const error: ExtensionError = details
    ? {
        code,
        message,
        details
      }
    : {
        code,
        message
      };

  return {
    ok: false,
    error
  };
}
