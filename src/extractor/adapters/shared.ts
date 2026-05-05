import type { AdaptedContent, ExtractionContext } from "./types";

function stripDescriptor(value: string, label: string): string {
  return value.replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), "").trim();
}

function getArxivSubmissionHistoryText(document: Document): string | undefined {
  return getText(document.querySelector(".submission-history"));
}

function getArxivModifiedTime(document: Document): string | undefined {
  const history = getArxivSubmissionHistoryText(document);
  if (!history) {
    return undefined;
  }

  const matches = Array.from(
    history.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+UTC\b/g)
  );
  const value = matches.at(-1)?.[0];
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value.replace(" UTC", " GMT"));
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

export function detectSite(document: Document): string {
  const host = document.location.hostname;
  const canonical =
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    "";
  const probe = `${host} ${canonical}`.toLowerCase();

  if (probe.includes("github.com")) {
    return "github";
  }
  if (
    probe.includes("arxiv.org") ||
    document.querySelector(".submission-history, #abs, article.ltx_document, .ltx_title_document")
  ) {
    return "arxiv";
  }
  if (probe.includes("mp.weixin.qq.com") || document.querySelector("#img-content, #js_article")) {
    return "weixin";
  }
  if (probe.includes("zhihu.com") || document.querySelector(".Post-RichText, .RichContent")) {
    return "zhihu";
  }
  return host || "page";
}

export function getSourceUrl(document: Document): string {
  return (
    document.querySelector<HTMLMetaElement>("meta[property='og:url']")?.content ||
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ||
    document.location.href
  );
}

export function getDocumentTitle(document: Document): string {
  const site = detectSite(document);

  if (site === "arxiv") {
    const title =
      document.querySelector<HTMLMetaElement>("meta[property='og:title']")?.content?.trim() ||
      document.querySelector<HTMLMetaElement>("meta[name='citation_title']")?.content?.trim() ||
      getText(document.querySelector(".ltx_title_document")) ||
      getText(document.querySelector("h1.title")) ||
      getText(document.querySelector("main h1")) ||
      getText(document.querySelector("h1"));
    if (title) {
      return stripDescriptor(title, "Title");
    }
  }

  if (site === "zhihu") {
    const title =
      getText(document.querySelector("h1.QuestionHeader-title")) ||
      getText(document.querySelector("h1.Post-Title")) ||
      getText(document.querySelector(".QuestionHeader h1")) ||
      getText(document.querySelector("main h1")) ||
      getText(document.querySelector("h1"));
    if (title) {
      return title;
    }
  }

  if (site === "weixin") {
    const title =
      getText(document.querySelector("#activity-name")) ||
      getText(document.querySelector(".rich_media_title")) ||
      getText(document.querySelector("h1"));
    if (title) {
      return title;
    }
  }

  if (site === "github") {
    const title =
      getText(document.querySelector("[data-testid='readme'] .markdown-body h1")) ||
      getText(document.querySelector("main .markdown-body h1")) ||
      getText(document.querySelector("article.markdown-body h1")) ||
      getText(document.querySelector(".entry-content.markdown-body h1"));
    if (title) {
      return title;
    }
  }

  return document.title || "Untitled Page";
}

export function getMetaAuthor(document: Document): string | undefined {
  const citationAuthors = Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name='citation_author']"))
    .map((element) => element.content.trim())
    .filter(Boolean);
  if (citationAuthors.length > 0) {
    return citationAuthors.join(", ");
  }

  if (detectSite(document) === "arxiv") {
    const authors =
      getText(document.querySelector(".authors")) ||
      getText(document.querySelector(".ltx_authors")) ||
      getText(document.querySelector(".ltx_creator"));
    if (authors) {
      return stripDescriptor(authors, "Authors");
    }
  }

  const meta = document.querySelector("meta[name='author'], meta[property='article:author']");
  return meta?.getAttribute("content")?.trim() || undefined;
}

function getMetaContent(document: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getWeixinPublishedTime(document: Document): string | undefined {
  const value = document.querySelector("#publish_time")?.textContent?.trim();
  return value || undefined;
}

export function getCreatedAt(document: Document): string | undefined {
  return (
    getMetaContent(document, [
      "meta[property='article:published_time']",
      "meta[name='article:published_time']",
      "meta[property='og:published_time']",
      "meta[name='og:published_time']",
      "meta[itemprop='datePublished']",
      "meta[name='datePublished']",
      "meta[name='citation_date']",
      "meta[name='citation_online_date']",
      "meta[name='publishdate']",
      "meta[name='publish_date']",
      "meta[name='pubdate']",
      "meta[name='date']"
    ]) ||
    getWeixinPublishedTime(document)
  );
}

export function getModifiedAt(document: Document): string | undefined {
  return (
    getMetaContent(document, [
      "meta[property='article:modified_time']",
      "meta[name='article:modified_time']",
      "meta[property='og:updated_time']",
      "meta[name='og:updated_time']",
      "meta[itemprop='dateModified']",
      "meta[name='dateModified']",
      "meta[name='lastmod']",
      "meta[name='last-modified']"
    ]) ||
    getArxivModifiedTime(document)
  );
}

export function getText(element: Element | null | undefined): string | undefined {
  const value = element?.textContent?.trim();
  return value || undefined;
}

export function buildContext(document: Document): ExtractionContext {
  return {
    documentTitle: getDocumentTitle(document),
    sourceUrl: getSourceUrl(document),
    site: detectSite(document),
    author: getMetaAuthor(document),
    createdAt: getCreatedAt(document),
    modifiedAt: getModifiedAt(document)
  };
}

export function makeAdaptedContent(root: HTMLElement, context: ExtractionContext, overrides?: Partial<AdaptedContent>): AdaptedContent {
  return {
    title: overrides?.title || context.documentTitle,
    sourceUrl: overrides?.sourceUrl || context.sourceUrl,
    site: overrides?.site || context.site,
    author: overrides?.author ?? context.author,
    createdAt: overrides?.createdAt ?? context.createdAt,
    modifiedAt: overrides?.modifiedAt ?? context.modifiedAt,
    root,
  };
}
