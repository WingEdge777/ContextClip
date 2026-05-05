import { preprocessRoot } from "../html/preprocess";
import { getText, makeAdaptedContent } from "./shared";
import type { AdaptedContent, DomainAdapter, ExtractionContext } from "./types";

type ArxivIds = {
  baseId: string;
  versionedId?: string;
};

type ArxivMetadata = {
  title?: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
  sourceUrl?: string;
};

const ARXIV_ID_PATTERN = /arxiv\.org\/(?:abs|html|pdf)\/([^?#\s]+?)(?:\.pdf)?$/i;
const ARXIV_ID_VALUE_PATTERN = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLabel(value: string, label: string): string {
  return value.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), "").trim();
}

function parseArxivId(value: string): string | undefined {
  const text = value.trim();
  if (!text) {
    return undefined;
  }

  const fromUrl = text.match(ARXIV_ID_PATTERN)?.[1];
  if (fromUrl) {
    return fromUrl;
  }

  const normalized = text
    .replace(/^arxiv:/i, "")
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|html|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/[?#].*$/, "")
    .trim();

  return ARXIV_ID_VALUE_PATTERN.test(normalized) ? normalized : undefined;
}

function splitArxivId(value: string): ArxivIds {
  const versionedId = value.match(/v\d+$/i) ? value : undefined;
  return {
    baseId: value.replace(/v\d+$/i, ""),
    versionedId
  };
}

function getArxivIds(root: HTMLElement, context: ExtractionContext): ArxivIds | null {
  const candidates = [
    context.sourceUrl,
    root.querySelector<HTMLMetaElement>("meta[name='citation_arxiv_id']")?.content,
    document.querySelector<HTMLMetaElement>("meta[name='citation_arxiv_id']")?.content,
    document.location.href
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const id = parseArxivId(candidate);
    if (id) {
      return splitArxivId(id);
    }
  }

  return null;
}

function getCanonicalSourceUrl(ids: ArxivIds): string {
  return `https://arxiv.org/abs/${ids.versionedId ?? ids.baseId}`;
}

function buildArxivHtmlRoot(source: ParentNode, baseUrl: string): HTMLElement | null {
  const article = source.querySelector<HTMLElement>("article.ltx_document");
  if (!article) {
    return null;
  }

  const adapted = preprocessRoot(article, baseUrl);
  sanitizeArxivHtmlRoot(adapted);
  return adapted;
}

function sanitizeArxivHtmlRoot(root: HTMLElement): void {
  root.querySelectorAll(".ltx_tag_bibliography, #license-tr, #watermark-tr, .ltx_authors").forEach((element) => {
    element.remove();
  });

  root.querySelectorAll(".ltx_title_abstract").forEach((element) => {
    if (element.tagName.toLowerCase() === "h2") {
      return;
    }

    const heading = document.createElement("h2");
    heading.className = element.className;
    heading.textContent = element.textContent?.trim() || "Abstract";
    element.replaceWith(heading);
  });

  root.querySelectorAll(".ltx_title .ltx_tag").forEach((element) => {
    element.remove();
  });

  const firstSection = root.querySelector(".ltx_section, .ltx_appendix");
  let current = root.querySelector(".ltx_abstract")?.nextElementSibling ?? root.querySelector(".ltx_title_document")?.nextElementSibling ?? null;
  while (current && current !== firstSection) {
    const next = current.nextElementSibling;
    if (current.matches(".ltx_para, .ltx_block")) {
      current.remove();
    }
    current = next;
  }
}

function extractArxivDomMetadata(root: HTMLElement, context: ExtractionContext, ids: ArxivIds): ArxivMetadata {
  const title =
    getText(root.querySelector(".ltx_title_document")) ||
    getText(root.querySelector("h1.title")) ||
    context.documentTitle;
  const author =
    getText(root.querySelector(".authors")) ||
    getText(root.querySelector(".ltx_authors")) ||
    context.author;

  return {
    title: title ? stripLabel(title, "Title") : undefined,
    author: author ? stripLabel(author, "Authors") : undefined,
    createdAt: context.createdAt,
    modifiedAt: context.modifiedAt,
    sourceUrl: getCanonicalSourceUrl(ids)
  };
}

async function fetchTextWithRetry(url: string, attempts = 3): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(250 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseArxivApiMetadata(xml: string): ArxivMetadata | null {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const entry = parsed.getElementsByTagName("entry")[0];
  if (!entry) {
    return null;
  }

  const title = normalizeWhitespace(entry.getElementsByTagName("title")[0]?.textContent ?? "");
  const authors = Array.from(entry.getElementsByTagName("author"))
    .map((author) => normalizeWhitespace(author.getElementsByTagName("name")[0]?.textContent ?? ""))
    .filter(Boolean);
  const updated = normalizeWhitespace(entry.getElementsByTagName("updated")[0]?.textContent ?? "");
  const published = normalizeWhitespace(entry.getElementsByTagName("published")[0]?.textContent ?? "");
  const alternateLink = Array.from(entry.getElementsByTagName("link")).find((link) => link.getAttribute("rel") === "alternate");

  return {
    title: title || undefined,
    author: authors.length > 0 ? authors.join(", ") : undefined,
    createdAt: published || undefined,
    modifiedAt: updated || undefined,
    sourceUrl: alternateLink?.getAttribute("href") || undefined
  };
}

async function fetchArxivApiMetadata(ids: ArxivIds): Promise<ArxivMetadata | null> {
  const id = ids.versionedId ?? ids.baseId;
  const xml = await fetchTextWithRetry(`https://arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
  return parseArxivApiMetadata(xml);
}

async function fetchArxivHtmlRoot(ids: ArxivIds): Promise<HTMLElement | null> {
  const candidates = Array.from(new Set([ids.versionedId, ids.baseId].filter(Boolean)));

  for (const candidate of candidates) {
    const url = `https://arxiv.org/html/${candidate}`;
    try {
      const html = await fetchTextWithRetry(url);
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const root = buildArxivHtmlRoot(parsed, url);
      if (root) {
        return root;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

function appendTextBlock(parent: HTMLElement, tagName: "p" | "h1" | "h2", value: string): void {
  const element = document.createElement(tagName);
  element.textContent = value;
  parent.appendChild(element);
}

function buildArxivAbsFallbackRoot(root: HTMLElement, metadata: ArxivMetadata): HTMLElement | null {
  const title =
    metadata.title ||
    getText(root.querySelector("h1.title")) ||
    getText(root.querySelector("h1")) ||
    "";
  const authors =
    metadata.author ||
    getText(root.querySelector(".authors")) ||
    getText(root.querySelector(".ltx_authors")) ||
    "";
  const abstract = root.querySelector<HTMLElement>("blockquote.abstract");
  const submissionHistory = root.querySelector<HTMLElement>(".submission-history");

  const article = document.createElement("article");
  if (title) {
    appendTextBlock(article, "h1", stripLabel(title, "Title"));
  }

  if (authors) {
    appendTextBlock(article, "p", stripLabel(authors, "Authors"));
  }

  if (abstract) {
    const section = document.createElement("section");
    appendTextBlock(section, "h2", "Abstract");
    const content = abstract.cloneNode(true) as HTMLElement;
    content.querySelectorAll(".descriptor").forEach((element) => element.remove());
    section.appendChild(content);
    article.appendChild(section);
  }

  if (submissionHistory) {
    const section = document.createElement("section");
    appendTextBlock(section, "h2", "Submission History");
    const content = submissionHistory.cloneNode(true) as HTMLElement;
    content.querySelectorAll("h2").forEach((element) => element.remove());
    section.appendChild(content);
    article.appendChild(section);
  }

  return article.textContent?.trim() ? preprocessRoot(article, document.baseURI) : null;
}

function buildArxivContent(
  adaptedRoot: HTMLElement,
  context: ExtractionContext,
  ids: ArxivIds,
  metadata: ArxivMetadata
): AdaptedContent {
  return makeAdaptedContent(adaptedRoot, context, {
    site: "arxiv",
    title: metadata.title || getText(adaptedRoot.querySelector("h1")) || context.documentTitle,
    author: metadata.author || context.author,
    createdAt: metadata.createdAt || context.createdAt,
    modifiedAt: metadata.modifiedAt || context.modifiedAt,
    sourceUrl: metadata.sourceUrl || getCanonicalSourceUrl(ids)
  });
}

export const arxivAdapter: DomainAdapter = {
  name: "arxiv",
  match(root, context) {
    return context.site === "arxiv" && Boolean(getArxivIds(root, context));
  },
  async transform(root, context) {
    const ids = getArxivIds(root, context);
    if (!ids) {
      return null;
    }

    const domMetadata = extractArxivDomMetadata(root, context, ids);
    const remoteMetadataPromise = fetchArxivApiMetadata(ids)
      .then((remote) => ({ ...domMetadata, ...(remote ?? {}) }))
      .catch(() => domMetadata);

    const currentHtmlRoot = buildArxivHtmlRoot(root, document.baseURI);
    if (currentHtmlRoot) {
      const metadata = await remoteMetadataPromise;
      return buildArxivContent(currentHtmlRoot, context, ids, metadata);
    }

    const fetchedHtmlRoot = await fetchArxivHtmlRoot(ids);
    if (fetchedHtmlRoot) {
      const metadata = await remoteMetadataPromise;
      return buildArxivContent(fetchedHtmlRoot, context, ids, metadata);
    }

    const metadata = await remoteMetadataPromise;
    const fallbackRoot = buildArxivAbsFallbackRoot(root, metadata);
    if (!fallbackRoot) {
      return null;
    }

    return buildArxivContent(fallbackRoot, context, ids, metadata);
  }
};
