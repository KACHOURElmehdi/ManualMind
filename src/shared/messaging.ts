import type { ExtensionRequest, MessageResponse } from "./messages";

function getRuntimeErrorMessage(): string | undefined {
  return chrome.runtime.lastError?.message;
}

export async function sendRuntimeRequest<TResponse>(
  request: ExtensionRequest
): Promise<MessageResponse<TResponse>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: MessageResponse<TResponse>) => {
      const runtimeError = getRuntimeErrorMessage();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      resolve(response);
    });
  });
}

export async function sendTabRequest<TResponse>(
  tabId: number,
  request: ExtensionRequest
): Promise<MessageResponse<TResponse>> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, request, (response: MessageResponse<TResponse>) => {
      const runtimeError = getRuntimeErrorMessage();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      resolve(response);
    });
  });
}

export function requireSuccess<T>(response: MessageResponse<T>): T {
  if (!response.ok) {
    throw new Error(`${response.error.code}: ${response.error.message}`);
  }

  return response.data;
}
