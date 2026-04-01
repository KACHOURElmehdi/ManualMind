import type { ExtensionSettings, ParserMode } from "../types";

const STORAGE_KEY = "studyAssistantSettings";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabledSites: ["https://example.com/*"],
  debugMode: false,
  preferredParserMode: "auto"
};

const PARSER_MODES = new Set<ParserMode>(["auto", "quiz", "aggressive"]);

function sanitizeSettings(input: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  const enabledSites = Array.isArray(input?.enabledSites)
    ? input.enabledSites.filter((site) => typeof site === "string" && site.trim().length > 0)
    : DEFAULT_SETTINGS.enabledSites;

  const debugMode =
    typeof input?.debugMode === "boolean" ? input.debugMode : DEFAULT_SETTINGS.debugMode;

  const preferredParserMode = PARSER_MODES.has(input?.preferredParserMode as ParserMode)
    ? (input?.preferredParserMode as ParserMode)
    : DEFAULT_SETTINGS.preferredParserMode;

  return {
    enabledSites,
    debugMode,
    preferredParserMode
  };
}

async function readFromStorageArea(
  area: "sync" | "local"
): Promise<Partial<ExtensionSettings> | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(STORAGE_KEY, (items) => {
      const runtimeError = chrome.runtime.lastError?.message;
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      resolve(items[STORAGE_KEY] as Partial<ExtensionSettings> | undefined);
    });
  });
}

async function writeToStorageAreas(settings: ExtensionSettings): Promise<void> {
  const payload = { [STORAGE_KEY]: settings };

  await Promise.all(
    (["sync", "local"] as const).map(
      (area) =>
        new Promise<void>((resolve, reject) => {
          chrome.storage[area].set(payload, () => {
            const runtimeError = chrome.runtime.lastError?.message;
            if (runtimeError) {
              reject(new Error(runtimeError));
              return;
            }

            resolve();
          });
        })
    )
  );
}

export async function getSettings(): Promise<ExtensionSettings> {
  try {
    const fromSync = await readFromStorageArea("sync");
    if (fromSync) {
      return sanitizeSettings(fromSync);
    }
  } catch {
    const fromLocal = await readFromStorageArea("local");
    return sanitizeSettings(fromLocal);
  }

  const fromLocal = await readFromStorageArea("local");
  return sanitizeSettings(fromLocal);
}

export async function updateSettings(
  patch: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const merged = sanitizeSettings({
    ...current,
    ...patch
  });

  await writeToStorageAreas(merged);
  return merged;
}
