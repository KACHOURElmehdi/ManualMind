# Study Assistant Chrome Extension (MV3)

Manual-review extension for study/practice on authorized sites.

This project is still local extension-first:
- no backend
- no Docker
- no auto-answering on page

It now supports **two analysis providers**:
- `mock`
- `openrouter` (for text/transcript analysis)

Audio transcription stays mocked (`MediaRecorder` + mock transcript mapping).

## Safety Constraints
- No auto-clicking answers
- No auto-filling inputs
- No auto-submitting forms
- No keyboard/mouse simulation
- No stealth/bypass behavior
- Manual review only in side panel

## Project Structure (Relevant)
```text
.
├── manifest.json
├── package.json
├── README.md
├── sidepanel.html
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
└── src/
    ├── background/
    │   └── index.ts
    ├── content/
    │   └── extraction/
    ├── sidepanel/
    │   └── App.tsx
    └── shared/
        ├── types.ts
        ├── messages.ts
        ├── storage/
        │   └── settingsStorage.ts
        ├── config/
        │   ├── localDevConfig.fallback.ts
        │   ├── localDevConfig.ts.example
        │   └── localDevConfig.types.ts
        └── analysis/
            ├── mockProvider.ts
            ├── openRouterProvider.ts
            ├── providerFactory.ts
            └── types.ts
```

## OpenRouter Local Config (Do Not Commit Secrets)
1. Copy example file:
   ```bash
   cp src/shared/config/localDevConfig.ts.example src/shared/config/localDevConfig.ts
   ```
   PowerShell:
   ```powershell
   Copy-Item src/shared/config/localDevConfig.ts.example src/shared/config/localDevConfig.ts
   ```
2. Edit `src/shared/config/localDevConfig.ts` and set your key:
   - `openRouter.apiKey`
   - optional `httpReferer`
   - optional `appTitle`

`src/shared/config/localDevConfig.ts` is git-ignored and should never be committed.

If this file is missing, the app uses safe fallback config with empty key, and OpenRouter mode will fail gracefully.

## Manifest Notes
- MV3 compliant
- toolbar `action` configured with icons/title
- side panel configured
- host permissions include:
  - `https://openrouter.ai/*`
  - `https://example.com/*` (replace with your authorized sites)

## Install / Validate / Build
```bash
npm install
npm run typecheck
npm run lint
npm run build
```

## Recommended Local Run Mode (No SW Registration Errors)
- Use `npm run build` for static unpacked output.
- Use `npm run dev` for watch rebuilds (also static output, safe for unpacked loading).
- `npm run dev:hmr` is available, but it injects localhost dev worker behavior and is not recommended for stable unpacked loading.
- `npm run build` now runs `verify:dist` to ensure `dist/service-worker-loader.js` is static.

## Load Unpacked in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select: `D:\Ynov\M2\Extension lang\dist`
5. If extension was already loaded, click **Reload** after each new build.

## Show Extension in Toolbar
1. Click puzzle icon (Extensions menu)
2. Find **Study Assistant (Manual Review)**
3. Click pin icon
4. Extension icon becomes visible in toolbar

## Switch Provider
In side panel settings:
- `Analysis provider`: `mock` or `openrouter`
- `Fallback to mock when provider request fails`: on/off

Recommended for local testing:
- Start with `mock`
- Then switch to `openrouter`
- Keep fallback enabled for resilience

## Test Flows
### Text question flow
1. Open an authorized page (matching manifest and content script scope)
2. Open side panel
3. Click **Analyze page question**
4. Verify:
   - question/options/context extracted
   - suggested answer, explanation, confidence
   - likely problem, recommended next step
   - logs/debug history

### Audio flow
1. Click **Start recording**
2. Speak question
3. Click **Stop recording**
4. Verify:
   - transcript is generated via mock transcription
   - transcript analysis uses selected provider (`mock` or `openrouter`)

## Troubleshooting
- OpenRouter key missing:
  - create `src/shared/config/localDevConfig.ts`
  - set `openRouter.apiKey`
- OpenRouter request error:
  - check internet connectivity
  - verify key/model in local config
  - keep fallback-to-mock enabled
- No extraction:
  - confirm page URL is allowed in manifest and enabled sites setting
  - reload extension after manifest changes
