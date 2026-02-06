import type { JsonSchema } from '../../types/llm-types';
import { MessageTypes } from '../../utils/message-types';

async function updateIcon(isDark: boolean) {
  const iconName = isDark ? 'icon-dark.svg' : 'icon-light.svg';
  const url = chrome.runtime.getURL(iconName);

  try {
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(undefined);
      img.onerror = () => reject(new Error(`Failed to load icon: ${url}`));
    });

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to get 2d context');

    ctx.drawImage(img, 0, 0, 128, 128);
    const imageData = ctx.getImageData(0, 0, 128, 128);

    chrome.runtime.sendMessage({
      type: MessageTypes.UPDATE_ICON,
      imageData: {
        width: imageData.width,
        height: imageData.height,
        data: Array.from(imageData.data),
      },
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
    const status = await window.ai.languageModel.availability();
    return status === 'available' || status === 'readily';
  } catch (_e) {
    return false;
  }
}

// Session cache
let cachedSession: AILanguageModel | null = null;
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
      const options: AILanguageModelCreateOptions = {};
      if (systemPrompt) {
        options.initialPrompts = [{ role: 'system', content: systemPrompt }];
      }

      console.log('[Offscreen] Creating LanguageModel session with options:', JSON.stringify(options));
      cachedSession = await window.ai.languageModel.create(options);
      cachedSystemPrompt = systemPrompt;
    }

    // Currently dom-chromium-ai types might not support promptOptions fully or schema
    // But we pass it if supported by the browser implementation
    // The prompt method signature in recent specs is prompt(input, options?)

    // Construct prompt options if schema is provided (assuming structured output support)
    // Note: 'responseConstraint' might be specific to some implementations or future spec
    // We will pass it blindly as `any` to avoid TS errors if types are old
    const promptOptions: any = {};
    if (schema) {
      promptOptions.responseConstraint = schema;
    }

    console.log('[Offscreen] Prompting session with:', { prompt, promptOptions: JSON.stringify(promptOptions) });

    // Cast to any to bypass strict type checks if needed
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
