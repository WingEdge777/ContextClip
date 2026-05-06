import { getText, makeAdaptedContent } from "./shared";
import type { DomainAdapter } from "./types";

const WEIXIN_TAIL_MARKERS = [
  /^送你一个新闻盲盒$/,
  /^快来打开看看吧$/,
  /^综合自[:：]/,
  /^编辑[:：]/,
  /^转载请注明/
];

const BLOCK_SELECTOR = "p, div, section, article, h1, h2, h3, h4, h5, h6, li";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getClosestBlock(root: HTMLElement, node: Node | null): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : node?.parentElement ?? null;

  while (current && current !== root) {
    if (current.matches(BLOCK_SELECTOR)) {
      return current;
    }
    current = current.parentElement;
  }

  return current === root ? root : null;
}

function truncateFrom(root: HTMLElement, start: Node | null): void {
  let current = start;

  while (current && current !== root) {
    while (current.nextSibling) {
      current.nextSibling.remove();
    }

    const parent = current.parentNode;
    current.remove();
    current = parent;
  }
}

function cleanupWeixinTail(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    const value = normalizeText(current.textContent ?? "");
    if (WEIXIN_TAIL_MARKERS.some((pattern) => pattern.test(value))) {
      truncateFrom(root, getClosestBlock(root, current));
      return;
    }
    current = walker.nextNode();
  }
}

function buildWeixinRoot(root: HTMLElement): HTMLElement | null {
  const content = root.querySelector<HTMLElement>("#js_content, #img-content");
  if (!content) {
    return null;
  }

  const article = document.createElement("article");
  const title = root.querySelector<HTMLElement>("#activity-name, .rich_media_title");

  if (title?.textContent?.trim()) {
    const heading = document.createElement("h1");
    heading.textContent = title.textContent.trim();
    article.appendChild(heading);
  }

  const body = content.cloneNode(true) as HTMLElement;
  cleanupWeixinTail(body);
  article.appendChild(body);
  return article;
}

export const weixinAdapter: DomainAdapter = {
  name: "weixin",
  match(root, context) {
    return context.site === "weixin" && Boolean(buildWeixinRoot(root));
  },
  transform(root, context) {
    const adaptedRoot = buildWeixinRoot(root);
    if (!adaptedRoot) {
      return null;
    }

    return makeAdaptedContent(adaptedRoot, context, {
      site: "weixin",
      title: getText(adaptedRoot.querySelector("h1")) || context.documentTitle
    });
  }
};
