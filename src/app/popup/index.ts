import JSZip from "jszip";
import { type ExtractResult, withFrontmatter } from "../../contracts/extract-result";
import type { RuntimeMessage } from "../../contracts/runtime";
import "./popup.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup mount node not found.");
}

let lastResult: ExtractResult | null = null;

app.innerHTML = `
  <main class="shell">
    <header class="hero panel">
      <div class="hero-copy">
        <p class="eyebrow">AI-ready context</p>
        <h1>ContextClip</h1>
        <p class="subhead">Clean current page or a picked block into Markdown.</p>
      </div>
    </header>

    <section class="action-grid">
      <section class="action-card action-card-primary">
        <strong>Extract This Page</strong>
        <span class="action-copy">Pull cleaned main content with metadata.</span>
        <div class="card-action-row">
          <button id="copy-page-md" class="card-mini-action card-mini-action-primary">Copy as MD</button>
          <button id="download-page-md" class="card-mini-action">Download MD</button>
          <button id="download-page-zip" class="card-mini-action">Download ZIP</button>
        </div>
      </section>

      <button id="pick-extract" class="action-card">
        <strong>Pick & Extract</strong>
        <span class="action-copy">Choose article, code, table, or a single block.</span>
      </button>
    </section>

    <section class="panel workflow">
      <div class="section-head">
        <div>
          <p class="section-eyebrow">Workflow</p>
          <h2>Last extraction</h2>
        </div>
        <div class="status-pill" id="status-pill">Idle</div>
      </div>

      <div class="meta-row">
        <span class="meta-chip" id="mode">No result</span>
        <span class="meta-chip" id="asset-count">0 assets</span>
      </div>

      <div class="action-row">
        <button id="copy-result" class="mini-action" disabled>Copy Markdown</button>
        <button id="download-result" class="mini-action" disabled>Download File</button>
        <button id="crawl-site" class="mini-action" disabled>Site Crawl</button>
      </div>
    </section>

    <section class="panel preview-panel">
      <div class="section-head">
        <div>
          <p class="section-eyebrow">Preview</p>
          <h2 id="preview-title">Nothing extracted yet</h2>
        </div>
      </div>

      <pre id="preview">Run an extraction to inspect the generated body before copying or downloading.</pre>
    </section>

    <section class="footnote">
      <div class="footnote-copy">
        <strong>Rich media page?</strong>
        <span>Media-heavy pages fall back to ZIP export automatically.</span>
      </div>
    </section>
  </main>
`;

const statusNode = document.querySelector<HTMLDivElement>("#status-pill")!;
const modeNode = document.querySelector<HTMLSpanElement>("#mode")!;
const assetCountNode = document.querySelector<HTMLSpanElement>("#asset-count")!;
const previewTitleNode = document.querySelector<HTMLHeadingElement>("#preview-title")!;
const previewNode = document.querySelector<HTMLPreElement>("#preview")!;

document.querySelector<HTMLButtonElement>("#copy-page-md")!.addEventListener("click", async () => {
  const result = await runExtractPage();
  if (!result) {
    return;
  }

  await navigator.clipboard.writeText(withFrontmatter(result));
  setStatus("Copied");
});

document.querySelector<HTMLButtonElement>("#download-page-md")!.addEventListener("click", async () => {
  try {
    const result = await runExtractPage();
    if (!result) {
      return;
    }

    await downloadMarkdownLocally(result);
    setStatus("Downloaded MD");
  } catch {
    setStatus("MD download failed");
  }
});

document.querySelector<HTMLButtonElement>("#download-page-zip")!.addEventListener("click", async () => {
  try {
    const result = await runExtractPage();
    if (!result) {
      return;
    }

    await downloadZipLocally(result);
    setStatus("Downloaded ZIP");
  } catch {
    setStatus("ZIP download failed");
  }
});

document.querySelector<HTMLButtonElement>("#pick-extract")!.addEventListener("click", async () => {
  await runPickExtract();
});

document.querySelector<HTMLButtonElement>("#copy-result")!.addEventListener("click", async () => {
  if (!lastResult) {
    return;
  }

  await navigator.clipboard.writeText(withFrontmatter(lastResult));
  setStatus("Copied");
});

document.querySelector<HTMLButtonElement>("#download-result")!.addEventListener("click", async () => {
  if (!lastResult) {
    return;
  }

  try {
    if (lastResult.needsZip) {
      await downloadZipLocally(lastResult);
    } else {
      await downloadMarkdownLocally(lastResult);
    }
    setStatus("Downloaded");
  } catch {
    setStatus("Download failed");
  }
});

void hydrateLastResult();

async function hydrateLastResult(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab.id) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: "get-last-result",
    tabId: tab.id
  } satisfies RuntimeMessage);

  if (response.result) {
    lastResult = response.result as ExtractResult;
    renderResult(lastResult);
  }
}

async function runExtractPage(): Promise<ExtractResult | null> {
  const tab = await getActiveTab();
  if (!tab.id) {
    setStatus("No active tab");
    return null;
  }

  try {
    await ensurePageMessaging(tab.id);
    setStatus("Extracting");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "extract-page" } satisfies RuntimeMessage);
    lastResult = response.result as ExtractResult;

    await chrome.runtime.sendMessage({
      type: "store-result",
      tabId: tab.id,
      payload: lastResult
    } satisfies RuntimeMessage);

    renderResult(lastResult);
    return lastResult;
  } catch (error) {
    setStatus(toUserMessage(error));
    return null;
  }
}

async function runPickExtract(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab.id) {
    setStatus("No active tab");
    return;
  }

  try {
    await ensurePageMessaging(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "start-selection" } satisfies RuntimeMessage);
    setStatus("Pick block in page");
    window.close();
  } catch (error) {
    setStatus(toUserMessage(error));
  }
}

async function ensurePageMessaging(tabId: number): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "ping" } satisfies RuntimeMessage);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
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
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }

  throw lastError;
}

async function downloadMarkdownLocally(result: ExtractResult): Promise<void> {
  const markdown = withFrontmatter(result);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: result.fileName.replace(/\.zip$/, ".md"),
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

async function downloadZipLocally(result: ExtractResult): Promise<void> {
  const markdown = withFrontmatter(result);
  const manifest = {
    title: result.title,
    source_url: result.sourceUrl,
    site: result.site,
    captured_at: result.capturedAt,
    mode: result.mode,
    assets: result.assets
  };

  const zip = new JSZip();
  zip.file("page.md", markdown);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: result.fileName.replace(/\.md$/, ".zip"),
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Cannot access")) {
    return "Page blocked by Chrome";
  }

  if (message.includes("Receiving end does not exist")) {
    return "Refresh page and retry";
  }

  return "Action failed";
}

function renderResult(result: ExtractResult): void {
  setStatus(result.title);
  modeNode.textContent = result.needsZip ? "ZIP fallback" : result.mode;
  assetCountNode.textContent = `${result.assets.length} asset${result.assets.length === 1 ? "" : "s"}`;
  previewTitleNode.textContent = result.title;
  previewNode.textContent = result.markdown.slice(0, 1400) || "(empty)";
  document.querySelector<HTMLButtonElement>("#copy-result")!.disabled = false;
  document.querySelector<HTMLButtonElement>("#download-result")!.disabled = false;
}

function setStatus(text: string): void {
  statusNode.textContent = text;
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
