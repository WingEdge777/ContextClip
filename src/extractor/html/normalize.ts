import type { BlockNode, DocumentMetadata, InlineNode, NormalizedDocument } from "../domain/types";

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

function mergeInlineText(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];

  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === "text" && last?.type === "text") {
      last.value += node.value;
      continue;
    }
    merged.push(node);
  }

  const first = merged[0];
  if (first?.type === "text") {
    first.value = first.value.replace(/^\s+/, "");
    if (!first.value) {
      merged.shift();
    }
  }

  const last = merged[merged.length - 1];
  if (last?.type === "text") {
    last.value = last.value.replace(/\s+$/, "");
    if (!last.value) {
      merged.pop();
    }
  }

  return merged.filter((node) => node.type !== "text" || node.value.length > 0);
}

function normalizeInlineChildren(node: ParentNode): InlineNode[] {
  const nodes: InlineNode[] = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = collapseWhitespace(child.textContent ?? "");
      if (value) {
        nodes.push({ type: "text", value });
      }
      continue;
    }

    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const tag = child.tagName.toLowerCase();
    switch (tag) {
      case "br":
        nodes.push({ type: "lineBreak" });
        break;
      case "strong":
      case "b": {
        const children = normalizeInlineChildren(child);
        if (children.length > 0) {
          nodes.push({ type: "strong", children });
        }
        break;
      }
      case "em":
      case "i": {
        const children = normalizeInlineChildren(child);
        if (children.length > 0) {
          nodes.push({ type: "em", children });
        }
        break;
      }
      case "code":
        if (!child.closest("pre")) {
          const value = child.textContent?.replace(/\s+/g, " ").trim();
          if (value) {
            nodes.push({ type: "inlineCode", value });
          }
        }
        break;
      case "a": {
        const href = child instanceof HTMLAnchorElement ? child.href : child.getAttribute("href") ?? "";
        const children = normalizeInlineChildren(child);
        nodes.push({
          type: "link",
          href,
          children: children.length > 0 ? children : [{ type: "text", value: href }]
        });
        break;
      }
      default:
        nodes.push(...normalizeInlineChildren(child));
        break;
    }
  }

  return mergeInlineText(nodes);
}

function elementText(node: Element): string {
  return collapseWhitespace(node.textContent ?? "").trim();
}

function normalizeTable(element: HTMLTableElement): BlockNode[] {
  const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
    Array.from(row.children).map((cell) => elementText(cell))
  );

  return rows.length > 0 ? [{ type: "table", rows }] : [];
}

function normalizeListItem(item: HTMLLIElement): BlockNode[] {
  const blocks = normalizeBlockChildren(item);
  if (blocks.length > 0) {
    return blocks;
  }

  const children = normalizeInlineChildren(item);
  return children.length > 0 ? [{ type: "paragraph", children }] : [];
}

function inlineBlockFromNode(node: HTMLElement): BlockNode[] {
  const children = normalizeInlineChildren(node);
  return children.length > 0 ? [{ type: "paragraph", children }] : [];
}

function normalizeList(element: HTMLElement, ordered: boolean): BlockNode[] {
  const items: BlockNode[][] = [];
  let currentItem: BlockNode[] | null = null;

  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLLIElement) {
      currentItem = normalizeListItem(child);
      if (currentItem.length > 0) {
        items.push(currentItem);
      }
      continue;
    }

    const tag = child.tagName.toLowerCase();
    if ((tag === "ul" || tag === "ol") && items.length > 0) {
      const nested = normalizeList(child, tag === "ol");
      if (nested.length > 0) {
        items[items.length - 1].push(...nested);
      }
    }
  }

  return items.length > 0 ? [{ type: "list", ordered, items }] : [];
}

function normalizeBlockNode(node: Node): BlockNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = collapseWhitespace(node.textContent ?? "").trim();
    return value ? [{ type: "paragraph", children: [{ type: "text", value }] }] : [];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const depth = Number.parseInt(tag.slice(1), 10) as 1 | 2 | 3 | 4 | 5 | 6;
      const children = normalizeInlineChildren(node);
      return children.length > 0 ? [{ type: "heading", depth, children }] : [];
    }
    case "p": {
      const children = normalizeInlineChildren(node);
      return children.length > 0 ? [{ type: "paragraph", children }] : [];
    }
    case "pre": {
      const code = node.querySelector("code");
      const language = code?.getAttribute("data-language") ?? code?.className.match(/language-([a-z0-9_-]+)/i)?.[1];
      const raw = (code?.textContent ?? node.textContent ?? "").trimEnd();
      return raw ? [{ type: "code", language: language || undefined, code: raw }] : [];
    }
    case "ul":
    case "ol": {
      return normalizeList(node, tag === "ol");
    }
    case "blockquote": {
      const children = normalizeBlockChildren(node);
      return children.length > 0 ? [{ type: "quote", children }] : [];
    }
    case "table":
      return normalizeTable(node as HTMLTableElement);
    case "img": {
      const src = (node as HTMLImageElement).currentSrc || node.getAttribute("src") || "";
      return src ? [{ type: "image", src, alt: node.getAttribute("alt") || undefined }] : [];
    }
    case "audio":
    case "video": {
      const media = node as HTMLMediaElement;
      const src = media.currentSrc || media.src || node.getAttribute("src") || "";
      return src ? [{ type: "media", kind: tag, src }] : [];
    }
    case "hr":
      return [{ type: "thematicBreak" }];
    case "article":
    case "main":
    case "section":
    case "div":
    case "figure":
    case "header":
    case "footer":
      return normalizeBlockChildren(node);
    default: {
      const nested = normalizeBlockChildren(node);
      return nested.length > 0 ? nested : inlineBlockFromNode(node);
    }
  }
}

export function normalizeBlockChildren(node: ParentNode): BlockNode[] {
  return Array.from(node.childNodes).flatMap((child) => normalizeBlockNode(child));
}

export function normalizeRoot(root: HTMLElement, meta: DocumentMetadata): NormalizedDocument {
  return {
    meta,
    blocks: normalizeBlockChildren(root)
  };
}
