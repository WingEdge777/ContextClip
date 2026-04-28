import { extractCurrentPage, extractElement } from "../../extractor";
import type { ExtractResult } from "../../contracts/extract-result";
import type { RuntimeMessage } from "../../contracts/runtime";

function escapeYamlValue(value: string): string {
  if (value.includes("\n")) {
    const lines = value.split("\n").map((l) => escapeYamlValue(l));
    return lines.join("\n  ");
  }
  const single = value.replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `'${single}'`;
}

function withFrontmatter(result: ExtractResult): string {
  const lines = [
    "---",
    `title: ${escapeYamlValue(result.title)}`,
    `source_url: ${escapeYamlValue(result.sourceUrl)}`,
    `site: ${escapeYamlValue(result.site)}`,
    `author: ${escapeYamlValue(result.author ?? "")}`,
    `captured_at: ${escapeYamlValue(result.capturedAt)}`,
    `mode: ${escapeYamlValue(result.mode)}`,
    `selection_hint: ${escapeYamlValue(result.selectionHint ?? "")}`,
    "---"
  ];

  return `${lines.join("\n")}\n\n${result.markdown}\n`;
}

const OVERLAY_ID = "context-clip-overlay";
const RECT_ID = "context-clip-rect";
const TOOLBAR_ID = "context-clip-toolbar";
const IGNORE_CLICK_ATTR = "data-context-clip-ignore";
const LONG_PRESS_MS = 200;

let hoveredElement: HTMLElement | null = null;
let cleanupSelectionMode: (() => void) | null = null;
let messageListenerInstalled = false;

if (!messageListenerInstalled) {
  messageListenerInstalled = true;
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "ping") {
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "extract-page") {
      sendResponse({ result: extractCurrentPage() });
      return false;
    }

    if (message.type === "start-selection") {
      activateSelectionMode();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "notify-copy") {
      void handleNotifyCopy(message.payload);
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}

type DragState =
  | { phase: "idle" }
  | { phase: "pending"; startX: number; startY: number; timer: ReturnType<typeof setTimeout> }
  | { phase: "recting"; startX: number; startY: number };

const TOAST_ID = "context-clip-toast";

async function handleNotifyCopy(result: ExtractResult): Promise<void> {
  try {
    await navigator.clipboard.writeText(withFrontmatter(result));
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = withFrontmatter(result);
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("Copied to clipboard");
}

function showToast(text: string): void {
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.textContent = text;
  toast.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "top:20px",
    "right:20px",
    "padding:10px 18px",
    "border-radius:10px",
    "background:#1f2937",
    "color:#f8fafc",
    "font:13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-weight:600",
    "box-shadow:0 18px 44px rgba(15,23,42,0.16)",
    "pointer-events:none",
    "opacity:0",
    "transition:opacity 200ms ease"
  ].join(";");

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 1800);
}

function activateSelectionMode(): void {
  cleanupSelectionMode?.();
  const theme = getHostTheme();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    `outline:2px solid ${theme.accent}`,
    `background:${theme.overlay}`,
    "border-radius:14px",
    `box-shadow:0 0 0 1px ${theme.overlayBorder}, 0 18px 36px rgba(15,23,42,0.12)`,
    "transition:all 120ms ease"
  ].join(";");

  const rectEl = document.createElement("div");
  rectEl.id = RECT_ID;
  rectEl.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "pointer-events:none",
    `border:2px solid ${theme.accent}`,
    `background:${rgba(theme.accent, 0.08)}`,
    "border-radius:4px",
    "display:none"
  ].join(";");

  const toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "top:16px",
    "right:16px",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "padding:10px 12px",
    `background:${theme.surface}`,
    `color:${theme.text}`,
    "border-radius:14px",
    `border:1px solid ${theme.line}`,
    "font:13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    "box-shadow:0 18px 44px rgba(15,23,42,0.16)",
    "backdrop-filter:blur(16px)"
  ].join(";");
  toolbar.innerHTML = `
    <span data-role="label">Pick block or drag to select</span>
    <button data-action="copy">Copy</button>
    <button data-action="download">Download</button>
    <button data-action="cancel">Cancel</button>
  `;

  const label = toolbar.querySelector<HTMLElement>("[data-role='label']")!;
  label.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "min-height:36px",
    "padding:0 2px 0 0",
    "font-weight:600",
    "white-space:nowrap"
  ].join(";");

  for (const button of toolbar.querySelectorAll("button")) {
    const action = button.getAttribute("data-action");
    (button as HTMLButtonElement).style.cssText = [
      "appearance:none",
      "border:0",
      "min-width:88px",
      "height:36px",
      "border-radius:10px",
      "padding:0 14px",
      "cursor:pointer",
      "font:inherit",
      "font-weight:600",
      "transition:transform 120ms ease, background-color 120ms ease, color 120ms ease, box-shadow 120ms ease",
      action === "copy"
        ? `background:${theme.accent};color:${theme.accentText};box-shadow:inset 0 0 0 1px ${theme.accent}`
        : action === "download"
          ? `background:${theme.soft};color:${theme.accent};box-shadow:inset 0 0 0 1px ${theme.softBorder}`
          : `background:${theme.button};color:${theme.text};box-shadow:inset 0 0 0 1px ${theme.line}`
    ].join(";");
  }

  let currentResult: ExtractResult | null = null;
  let pinnedElement: HTMLElement | null = null;
  let rectPinned = false;
  let drag: DragState = { phase: "idle" };

  function hideOverlay(): void {
    overlay.style.width = "0";
    overlay.style.height = "0";
  }

  function showRect(x1: number, y1: number, x2: number, y2: number): void {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    rectEl.style.left = `${left}px`;
    rectEl.style.top = `${top}px`;
    rectEl.style.width = `${width}px`;
    rectEl.style.height = `${height}px`;
    rectEl.style.display = "block";
  }

  function hideRect(): void {
    rectEl.style.display = "none";
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest(`#${TOOLBAR_ID}`) || target?.closest(`[${IGNORE_CLICK_ATTR}]`)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const timer = setTimeout(() => {
      if (drag.phase === "pending") {
        drag = { phase: "recting", startX: drag.startX, startY: drag.startY };
        hideOverlay();
        label.textContent = "Drag to select area";
      }
    }, LONG_PRESS_MS);

    drag = { phase: "pending", startX: event.clientX, startY: event.clientY, timer };
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (drag.phase === "recting") {
      showRect(drag.startX, drag.startY, event.clientX, event.clientY);
      return;
    }

    if (drag.phase === "pending") {
      const dx = Math.abs(event.clientX - drag.startX);
      const dy = Math.abs(event.clientY - drag.startY);
      if (dx > 5 || dy > 5) {
        clearTimeout(drag.timer);
        drag = { phase: "recting", startX: drag.startX, startY: drag.startY };
        hideOverlay();
        label.textContent = "Drag to select area";
      }
      return;
    }

    if (pinnedElement || rectPinned) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target || target.closest(`#${TOOLBAR_ID}`)) {
      return;
    }

    hoveredElement = pickSemanticElement(target);
    if (!hoveredElement) {
      return;
    }

    const rect = hoveredElement.getBoundingClientRect();
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    if (drag.phase === "pending") {
      clearTimeout(drag.timer);
      drag = { phase: "idle" };

      if (!hoveredElement) {
        return;
      }

      pinnedElement = hoveredElement;
      currentResult = extractElement(pinnedElement);
      rectPinned = false;
      hideRect();
      void chrome.runtime.sendMessage({
        type: "selection-complete",
        payload: currentResult
      } satisfies RuntimeMessage);

      label.textContent = currentResult.title.slice(0, 40);
      return;
    }

    if (drag.phase === "recting") {
      const x1 = drag.startX;
      const y1 = drag.startY;
      const x2 = event.clientX;
      const y2 = event.clientY;

      drag = { phase: "idle" };

      if (Math.abs(x2 - x1) < 10 || Math.abs(y2 - y1) < 10) {
        hideRect();
        return;
      }

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const right = Math.max(x1, x2);
      const bottom = Math.max(y1, y2);

      const result = extractFromRect(left, top, right, bottom);

      if (!result) {
        hideRect();
        label.textContent = "No content in selection";
        return;
      }

      currentResult = result;
      rectPinned = true;
      pinnedElement = null;
      void chrome.runtime.sendMessage({
        type: "selection-complete",
        payload: currentResult
      } satisfies RuntimeMessage);

      label.textContent = currentResult.title.slice(0, 40);
      return;
    }
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (drag.phase === "pending") {
      clearTimeout(drag.timer);
    }
    drag = { phase: "idle" };

    if (pinnedElement || rectPinned) {
      pinnedElement = null;
      rectPinned = false;
      hoveredElement = null;
      currentResult = null;
      hideOverlay();
      hideRect();
      label.textContent = "Pick block or drag to select";
      return;
    }

    cleanup();
  };

  const handleToolbar = async (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const action = target?.getAttribute("data-action");
    if (!action) {
      return;
    }

    if (action === "cancel") {
      cleanup();
      return;
    }

    if (!currentResult) {
      label.textContent = "Pick block first";
      return;
    }

    if (action === "copy") {
      await copyText(withFrontmatter(currentResult));
      label.textContent = "Copied";
      return;
    }

    if (action === "download") {
      try {
        downloadSelectionMarkdown(currentResult);
        label.textContent = "Download started";
      } catch {
        label.textContent = "Download failed";
      }
    }
  };

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (drag.phase === "pending") {
        clearTimeout(drag.timer);
      }
      drag = { phase: "idle" };

      if (pinnedElement || rectPinned) {
        pinnedElement = null;
        rectPinned = false;
        hoveredElement = null;
        currentResult = null;
        hideOverlay();
        hideRect();
        label.textContent = "Pick block or drag to select";
        return;
      }

      cleanup();
    }
  };

  document.body.append(overlay, rectEl, toolbar);
  document.addEventListener("mousedown", handleMouseDown, true);
  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  toolbar.addEventListener("click", handleToolbar, true);
  document.addEventListener("keydown", handleEscape, true);

  function cleanup(): void {
    document.removeEventListener("mousedown", handleMouseDown, true);
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
    document.removeEventListener("contextmenu", handleContextMenu, true);
    toolbar.removeEventListener("click", handleToolbar, true);
    document.removeEventListener("keydown", handleEscape, true);
    overlay.remove();
    rectEl.remove();
    toolbar.remove();
    hoveredElement = null;
    pinnedElement = null;
    cleanupSelectionMode = null;
  }

  cleanupSelectionMode = cleanup;
}

function extractFromRect(left: number, top: number, right: number, bottom: number): ExtractResult | null {
  const startRange = document.caretRangeFromPoint(left, top);
  const endRange = document.caretRangeFromPoint(right, bottom);

  if (!startRange || !endRange) {
    return extractFromRectFallback(left, top, right, bottom);
  }

  const range = document.createRange();
  try {
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.startContainer, endRange.startOffset);
  } catch {
    try {
      range.setStart(endRange.startContainer, endRange.startOffset);
      range.setEnd(startRange.startContainer, startRange.startOffset);
    } catch {
      return extractFromRectFallback(left, top, right, bottom);
    }
  }

  if (range.collapsed) {
    return extractFromRectFallback(left, top, right, bottom);
  }

  const fragment = range.cloneContents();
  if (!fragment.hasChildNodes()) {
    return extractFromRectFallback(left, top, right, bottom);
  }

  const container = document.createElement("div");
  container.appendChild(fragment);

  return extractElement(container);
}

function extractFromRectFallback(left: number, top: number, right: number, bottom: number): ExtractResult | null {
  const rect = new DOMRect(left, top, right - left, bottom - top);
  const elements = findElementsInRect(rect);
  if (elements.length === 0) {
    return null;
  }

  const container = document.createElement("div");
  for (const el of elements) {
    container.appendChild(el.cloneNode(true));
  }

  return extractElement(container);
}

function findElementsInRect(rect: DOMRect): Element[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!(node instanceof HTMLElement)) {
        return NodeFilter.FILTER_SKIP;
      }
      if (node.id === OVERLAY_ID || node.id === RECT_ID || node.id === TOOLBAR_ID) {
        return NodeFilter.FILTER_SKIP;
      }
      if (node.closest(`#${TOOLBAR_ID}`)) {
        return NodeFilter.FILTER_SKIP;
      }

      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        return NodeFilter.FILTER_SKIP;
      }

      const overlapLeft = Math.max(box.left, rect.left);
      const overlapTop = Math.max(box.top, rect.top);
      const overlapRight = Math.min(box.right, rect.right);
      const overlapBottom = Math.min(box.bottom, rect.bottom);
      const overlapArea = Math.max(0, overlapRight - overlapLeft) * Math.max(0, overlapBottom - overlapTop);
      const elementArea = box.width * box.height;
      const overlapRatio = overlapArea / elementArea;

      if (overlapRatio < 0.5) {
        return NodeFilter.FILTER_SKIP;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const accepted = new Set<Element>();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const element = node as Element;
    let dominated = false;
    for (const existing of accepted) {
      if (existing.contains(element)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      for (const existing of accepted) {
        if (element.contains(existing)) {
          accepted.delete(existing);
        }
      }
      accepted.add(element);
    }
  }

  return Array.from(accepted);
}

function getHostTheme(): {
  surface: string;
  text: string;
  line: string;
  accent: string;
  accentText: string;
  soft: string;
  softBorder: string;
  button: string;
  overlay: string;
  overlayBorder: string;
} {
  const host = window.location.hostname;
  const body = getComputedStyle(document.body);
  const baseText = normalizeColor(body.color, "#1f2937");
  const baseSurface = normalizeColor(body.backgroundColor, "#ffffff");

  let accent = normalizeColor(
    getComputedStyle(document.documentElement).getPropertyValue("--color-accent-fg") ||
      getComputedStyle(document.documentElement).getPropertyValue("--MapBrand") ||
      getComputedStyle(document.documentElement).getPropertyValue("--theme-color"),
    "#2563eb"
  );

  if (host.includes("zhihu.com")) {
    accent = "#1772f6";
  } else if (host.includes("weixin.qq.com")) {
    accent = "#07c160";
  } else if (host.includes("github.com")) {
    accent = "#0969da";
  }

  return {
    surface: rgba(baseSurface, 0.96),
    text: baseText,
    line: rgba(baseText, 0.12),
    accent,
    accentText: "#ffffff",
    soft: rgba(accent, 0.12),
    softBorder: rgba(accent, 0.18),
    button: rgba(baseText, 0.05),
    overlay: rgba(accent, 0.1),
    overlayBorder: rgba(accent, 0.18)
  };
}

function normalizeColor(input: string, fallback: string): string {
  const value = input.trim();
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") {
    return fallback;
  }
  return value;
}

function rgba(color: string, alpha: number): string {
  const normalized = color.trim();
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
    const red = Number.parseInt(full.slice(0, 2), 16);
    const green = Number.parseInt(full.slice(2, 4), 16);
    const blue = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const match = normalized.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) {
    return normalized;
  }

  return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
}

function pickSemanticElement(start: HTMLElement): HTMLElement | null {
  const blocked = start.closest(`#${TOOLBAR_ID}`);
  if (blocked) {
    return null;
  }

  let node: HTMLElement | null = start;
  while (node && node !== document.body) {
    if (matchesSemantic(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return start;
}

function matchesSemantic(node: HTMLElement): boolean {
  return Boolean(
    node.matches("article, main, section, pre, table, figure, blockquote") ||
      node.getAttribute("role") === "article" ||
      node.childElementCount >= 2
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function downloadSelectionMarkdown(result: ExtractResult): void {
  const markdown = withFrontmatter(result);
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  const anchor = document.createElement("a");
  anchor.setAttribute(IGNORE_CLICK_ATTR, "true");
  anchor.href = url;
  anchor.download = result.fileName.replace(/\.zip$/, ".md");
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
