const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "aside",
  "footer",
  "form",
  "[role='dialog']",
  "[aria-hidden='true']",
  "#saladict",
  "#immersiveTranslator",
  "#wechatsync-fab",
  ".comment-app",
  ".Comments-container",
  ".RichContent-actions",
  ".RichContent-cover",
  ".RichContent-actions.is-fixed",
  ".ContentItem-actions",
  ".ContentItem-time",
  ".RichText-actions",
  ".AppHeader",
  ".Sticky",
  ".CornerButtons",
  ".Rich_media_tool",
  ".rich_media_extra",
  ".js_uneditable_area",
  "#js_tags",
  "#js_pc_qr_code",
  "#js_share_content",
  "#js_append_comment",
  "#js_hotspot_area",
  "#js_preview_reward_author",
  ".original_primary_card",
  ".wx_profile_card_inner",
  ".code-toolbar",
  ".react-code-size-details",
  ".js-timeline-item",
  ".file-actions",
  ".prc-UnderlineNav-UnderlineNavItem-syRjR",
  ".Link--primary[href^='#user-content-']"
];

function absolutize(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}

function isPlaceholderDataImage(value: string): boolean {
  return /^data:image\/svg\+xml/i.test(value);
}

function resolveLazySrc(element: HTMLImageElement): string {
  const lazy =
    element.getAttribute("data-src") ||
    element.getAttribute("data-original") ||
    element.getAttribute("data-actualsrc") ||
    "";
  return (
    lazy ||
    element.getAttribute("src") ||
    ""
  );
}

function normalizeMedia(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll("img").forEach((node) => {
    const element = node as HTMLImageElement;
    const src = resolveLazySrc(element);
    if (!src || isPlaceholderDataImage(src)) {
      element.remove();
      return;
    }

    element.setAttribute("src", absolutize(src, baseUrl));
  });

  root.querySelectorAll("audio, video, source").forEach((node) => {
    const element = node as HTMLMediaElement | HTMLSourceElement;
    const src = element.getAttribute("src") || "";
    if (src) {
      element.setAttribute("src", absolutize(src, baseUrl));
    }
  });
}

function normalizeLinks(root: HTMLElement, baseUrl: string): void {
  root.querySelectorAll("a[href]").forEach((node) => {
    const href = node.getAttribute("href");
    if (href) {
      node.setAttribute("href", absolutize(href, baseUrl));
    }
  });
}

function normalizeCodeLanguage(root: HTMLElement): void {
  root.querySelectorAll("pre code").forEach((node) => {
    const block = node as HTMLElement;
    if (block.getAttribute("data-language")) {
      return;
    }

    const match = block.className.match(/language-([a-z0-9_-]+)/i);
    if (match) {
      block.setAttribute("data-language", match[1]);
    }
  });
}

export function preprocessRoot(root: HTMLElement, baseUrl = document.baseURI): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;

  for (const selector of NOISE_SELECTORS) {
    clone.querySelectorAll(selector).forEach((element) => element.remove());
  }

  normalizeMedia(clone, baseUrl);
  normalizeLinks(clone, baseUrl);
  normalizeCodeLanguage(clone);

  return clone;
}
