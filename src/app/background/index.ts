import type { ExtractResult } from "../../contracts/extract-result";
import type { RuntimeMessage } from "../../contracts/runtime";

function storageKey(tabId: number): string {
  return `last-result:${tabId}`;
}

async function setLastResult(tabId: number, result: ExtractResult): Promise<void> {
  await chrome.storage.session.set({
    [storageKey(tabId)]: result
  });
}

async function getLastResult(tabId: number): Promise<ExtractResult | null> {
  const stored = await chrome.storage.session.get(storageKey(tabId));
  return (stored[storageKey(tabId)] as ExtractResult | undefined) ?? null;
}

async function clearLastResult(tabId: number): Promise<void> {
  await chrome.storage.session.remove(storageKey(tabId));
}

async function ensureContentScript(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "ping" } satisfies RuntimeMessage);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "ping" } satisfies RuntimeMessage);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw new Error("Content script not responding");
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearLastResult(tabId);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender?.tab?.id)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  void handleCommand(command);
});

async function handleCommand(command: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  try {
    await ensureContentScript(tab.id);
  } catch {
    return;
  }

  if (command === "extract-page") {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "extract-page" } satisfies RuntimeMessage);
      if (!response?.result) {
        return;
      }
      const result = response.result as ExtractResult;
      if (!result) {
        return;
      }
      await setLastResult(tab.id, result);
      await chrome.tabs.sendMessage(tab.id, { type: "notify-copy", payload: result } satisfies RuntimeMessage);
    } catch {
      // silently fail
    }
  } else if (command === "pick-extract") {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "start-selection" } satisfies RuntimeMessage);
    } catch {
      // silently fail
    }
  }
}

async function handleMessage(message: RuntimeMessage, senderTabId?: number): Promise<unknown> {
  switch (message.type) {
    case "selection-complete":
      if (senderTabId !== undefined) {
        await setLastResult(senderTabId, message.payload);
      }
      return { ok: true };
    case "store-result":
      await setLastResult(message.tabId, message.payload);
      return { ok: true };
    case "get-last-result":
      return { result: await getLastResult(message.tabId) };
    default:
      return { ok: false, error: "Unsupported message." };
  }
}
