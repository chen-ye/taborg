import type { JsonSchema } from '../../types/llm-types';
import { MessageTypes } from '../../utils/message-types';

declare global {
  interface Window {
    LanguageModel: typeof LanguageModel;
  }
}

async function updateIcon(isDark: boolean) {
  const iconName = isDark ? 'icon-dark.svg' : 'icon-light.svg';
  const url = chrome.runtime.getURL(iconName);

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, { resizeWidth: 128, resizeHeight: 128 });

    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, 128, 128);

    chrome.runtime.sendMessage({
      type: MessageTypes.UPDATE_ICON,
      imageData: imageData,
    });
  } catch (error) {
    console.error('Failed to generate icon:', error);
  }
}

// Initial check

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageTypes.CHECK_CHROME_AI_AVAILABILITY) {
    checkAvailability().then((success) => sendResponse({ success }));
    return true; // Keep channel open
  }

  if (message.type === MessageTypes.EXECUTE_AI_PROMPT) {
    executePrompt(message.prompt, message.systemPrompt, message.schema)
      .then((text) => sendResponse({ success: true, text }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open
  }
});

async function checkAvailability() {
  try {
    const status = await window.LanguageModel.availability();
    return status === 'available';
  } catch (_e) {
    return false;
  }
}

// Session cache
let cachedSession: LanguageModel | null = null;
let cachedSystemPrompt: string | undefined;

async function executePrompt(prompt: string, systemPrompt?: string, schema?: JsonSchema) {
  try {
    // Check if we can reuse the existing session
    if (cachedSession) {
      if (cachedSystemPrompt === systemPrompt) {
        console.log('[Offscreen] Reusing cached session');
      } else {
        console.log('[Offscreen] System prompt changed, destroying cached session');
        cachedSession.destroy();
        cachedSession = null;
        cachedSystemPrompt = undefined;
      }
    }

    if (!cachedSession) {
      const options: LanguageModelCreateOptions = {};
      if (systemPrompt) {
        options.initialPrompts = [{ role: 'system', content: systemPrompt }];
      }

      console.log('[Offscreen] Creating LanguageModel session with options:', JSON.stringify(options));
      cachedSession = await window.LanguageModel.create(options);
      cachedSystemPrompt = systemPrompt;
    }

    const promptOptions: LanguageModelPromptOptions = {};
    if (schema) {
      promptOptions.responseConstraint = schema as Record<string, unknown>;
    }

    console.log('[Offscreen] Prompting session with:', { prompt, promptOptions: JSON.stringify(promptOptions) });
    const result = await cachedSession.prompt(prompt, promptOptions);
    console.log('[Offscreen] Prompt success, result length:', result.length);

    // Keep session alive for reuse
    return result;
  } catch (e) {
    console.error('[Offscreen] Execution failed:', e);
    // If execution fails, destroy the session to be safe
    if (cachedSession) {
      cachedSession.destroy();
      cachedSession = null;
      cachedSystemPrompt = undefined;
    }
    throw e;
  }
}

// Listen for changes
function initThemeListener() {
  if (typeof window === 'undefined' || !window.matchMedia) return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  updateIcon(mediaQuery.matches);

  mediaQuery.addEventListener('change', (e) => {
    updateIcon(e.matches);
  });
}

initThemeListener();
