import { Readability } from "@mozilla/readability";
import { cleanText, makeAdaptedContent } from "./shared";
import type { AdaptedContent, ExtractionContext } from "./types";

type Candidate = {
  root: HTMLElement;
  title?: string;
  author?: string;
  score: number;
};

const STRUCTURAL_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  ".markdown-body",
  ".entry-content",
  ".article-content",
  ".post-content",
  ".post-body",
  ".rich_media_content",
  ".RichText"
];

const NOISE_TEXT_PATTERNS = [
  /copyright/i,
  /all rights reserved/i,
  /sign in/i,
  /log in/i,
  /subscribe/i,
  /recommended/i,
  /related/i,
  /share/i,
  /comments?/i
];

function cloneIntoDocument(root: HTMLElement): Document {
  const doc = document.implementation.createHTMLDocument(document.title);
  doc.body.innerHTML = root.outerHTML;
  return doc;
}

function createArticle(content: string): HTMLElement {
  const article = document.createElement("article");
  article.innerHTML = content;
  return article;
}

function scoreCandidate(root: HTMLElement): number {
  const text = cleanText(root.textContent) || "";
  const textLength = text.length;
  const paragraphCount = root.querySelectorAll("p").length;
  const headingCount = root.querySelectorAll("h1, h2, h3").length;
  const imageCount = root.querySelectorAll("img").length;
  const linkTextLength = Array.from(root.querySelectorAll("a"))
    .map((node) => cleanText(node.textContent)?.length || 0)
    .reduce((sum, value) => sum + value, 0);
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 1;
  const noisePenalty = NOISE_TEXT_PATTERNS.reduce((sum, pattern) => sum + (pattern.test(text) ? 30 : 0), 0);

  return (
    textLength +
    paragraphCount * 120 +
    headingCount * 80 +
    imageCount * 20 -
    Math.round(linkDensity * 600) -
    noisePenalty
  );
}

function buildReadabilityCandidate(root: HTMLElement): Candidate | null {
  const parsed = new Readability(cloneIntoDocument(root)).parse();
  if (!parsed?.content) {
    return null;
  }

  const article = createArticle(parsed.content);
  return {
    root: article,
    title: cleanText(parsed.title),
    author: cleanText(parsed.byline),
    score: scoreCandidate(article) + 200
  };
}

function buildStructuralCandidate(root: HTMLElement): Candidate | null {
  const candidates = STRUCTURAL_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector))
  ).filter((element) => Boolean(cleanText(element.textContent)));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  const winner = candidates[0].cloneNode(true) as HTMLElement;
  const article = document.createElement("article");
  article.appendChild(winner);
  return {
    root: article,
    score: scoreCandidate(article) + 100
  };
}

function buildRawCandidate(root: HTMLElement): Candidate {
  const article = document.createElement("article");
  article.innerHTML = root.innerHTML;
  return {
    root: article,
    score: scoreCandidate(article)
  };
}

function buildGenericRoot(root: HTMLElement): { root: HTMLElement; title?: string; author?: string } {
  const candidates = [buildReadabilityCandidate(root), buildStructuralCandidate(root), buildRawCandidate(root)].filter(
    Boolean
  ) as Candidate[];

  candidates.sort((left, right) => right.score - left.score);
  const winner = candidates[0];

  return {
    root: winner.root,
    title: winner.title,
    author: winner.author
  };
}

export function adaptGeneric(root: HTMLElement, context: ExtractionContext): AdaptedContent {
  const { root: adaptedRoot, title, author } = buildGenericRoot(root);
  return makeAdaptedContent(adaptedRoot, context, {
    title: title || context.documentTitle,
    author: author || context.author
  });
}
