import type { ExtractResult } from "../contracts/extract-result";
import { adaptPage } from "./adapters";
import { buildContext, detectSite, getCreatedAt, getDocumentTitle, getMetaAuthor, getModifiedAt, getSourceUrl } from "./adapters/shared";
import type { DocumentMetadata } from "./domain/types";
import { buildExtractResult, buildMetadata } from "./export/build-result";
import { extractPageHtml, extractSelectionHtml } from "./html/extract";
import { normalizeRoot } from "./html/normalize";
import { preprocessRoot } from "./html/preprocess";

function describeElement(element: HTMLElement): string {
  const parts = [element.tagName.toLowerCase()];

  if (element.id) {
    parts.push(`#${element.id}`);
  }

  const className = element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  for (const item of className) {
    parts.push(`.${item}`);
  }

  return parts.join("");
}

function normalizeCandidate(root: HTMLElement, meta: DocumentMetadata): ExtractResult {
  const normalized = normalizeRoot(root, meta);
  return buildExtractResult("page", normalized, root);
}

export async function extractCurrentPage(): Promise<ExtractResult> {
  const rawRoot = extractPageHtml(document);
  const cleanRoot = preprocessRoot(rawRoot);
  const adapted = await adaptPage(cleanRoot, buildContext(document));
  return normalizeCandidate(
    adapted.root,
    buildMetadata({
      title: adapted.title,
      sourceUrl: adapted.sourceUrl,
      site: adapted.site,
      author: adapted.author,
      createdAt: adapted.createdAt,
      modifiedAt: adapted.modifiedAt
    })
  );
}

export function extractElement(element: HTMLElement): ExtractResult {
  const rawRoot = extractSelectionHtml(element);
  const cleanRoot = preprocessRoot(rawRoot);
  const pageTitle = getDocumentTitle(document);
  const title =
    cleanRoot.querySelector("h1,h2,h3")?.textContent?.trim() ||
    pageTitle ||
    element.getAttribute("aria-label") ||
    document.title ||
    "Selected Content";
  const selectionHint = describeElement(element);
  const normalized = normalizeRoot(
    cleanRoot,
    buildMetadata(
      {
        title,
        sourceUrl: getSourceUrl(document),
        site: detectSite(document),
        author: getMetaAuthor(document),
        createdAt: getCreatedAt(document),
        modifiedAt: getModifiedAt(document)
      },
      selectionHint
    )
  );

  return buildExtractResult("selection", normalized, cleanRoot, selectionHint);
}
