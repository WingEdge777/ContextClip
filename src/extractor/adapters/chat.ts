import { detectChatProvider, getText, makeAdaptedContent, type ChatProvider } from "./shared";
import type { DomainAdapter } from "./types";

type ChatMessage = {
  role: "user" | ChatProvider;
  content: HTMLElement;
};

function wrapPlainText(text: string): HTMLElement | null {
  const value = text.trim();
  if (!value) {
    return null;
  }

  const wrapper = document.createElement("div");
  const paragraph = document.createElement("p");
  paragraph.textContent = value;
  wrapper.appendChild(paragraph);
  return wrapper;
}

function cloneIntoWrapper(source: ParentNode | null | undefined): HTMLElement | null {
  if (!source) {
    return null;
  }

  const wrapper = document.createElement("div");
  for (const node of Array.from(source.childNodes)) {
    wrapper.appendChild(node.cloneNode(true));
  }

  cleanupChatContent(wrapper);
  return wrapper.textContent?.trim() ? wrapper : null;
}

function cleanupChatContent(root: HTMLElement): void {
  root.querySelectorAll("button, form, textarea, input, svg").forEach((element) => {
    element.remove();
  });
}

function buildChatTranscriptRoot(title: string, messages: ChatMessage[]): HTMLElement | null {
  if (messages.length === 0) {
    return null;
  }

  const article = document.createElement("article");
  const heading = document.createElement("h1");
  heading.textContent = title;
  article.appendChild(heading);

  for (const message of messages) {
    const section = document.createElement("section");
    const roleHeading = document.createElement("h2");
    roleHeading.textContent = message.role;
    section.append(roleHeading, message.content);
    article.appendChild(section);
  }

  return article;
}

function extractChatGptMessages(root: HTMLElement): ChatMessage[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-message-author-role]"))
    .map((node) => {
      const role = node.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") {
        return null;
      }

      const content =
        (role === "assistant"
          ? cloneIntoWrapper(node.querySelector(".markdown, .prose"))
          : cloneIntoWrapper(node.firstElementChild)) || null;
      if (!content) {
        return null;
      }

      return {
        role: role === "assistant" ? "chatgpt" : "user",
        content
      } satisfies ChatMessage;
    })
    .filter(Boolean) as ChatMessage[];
}

function extractGeminiUserContent(node: HTMLElement): HTMLElement | null {
  const lines = Array.from(node.querySelectorAll<HTMLElement>(".query-text-line")).filter((element) =>
    Boolean(element.textContent?.trim())
  );
  if (lines.length === 0) {
    return cloneIntoWrapper(node.querySelector(".query-text, .query-content"));
  }

  const wrapper = document.createElement("div");
  for (const line of lines) {
    wrapper.appendChild(line.cloneNode(true));
  }
  cleanupChatContent(wrapper);
  return wrapper;
}

function extractGeminiMessages(root: HTMLElement): ChatMessage[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".conversation-container"))
    .flatMap((container) => {
      const user = container.querySelector<HTMLElement>("user-query");
      const response = container.querySelector<HTMLElement>("model-response");
      const userContent = extractGeminiUserContent(user || undefined);
      const assistantContent = cloneIntoWrapper(
        response?.querySelector(".markdown, .model-response-text, message-content")
      );
      const messages: ChatMessage[] = [];

      if (userContent) {
        messages.push({ role: "user", content: userContent });
      }
      if (assistantContent) {
        messages.push({ role: "gemini", content: assistantContent });
      }

      return messages;
    });
}

function extractDeepSeekMessages(root: HTMLElement): ChatMessage[] {
  const assistantContents = Array.from(
    root.querySelectorAll<HTMLElement>(".ds-message .ds-assistant-message-main-content")
  )
    .map((node) => cloneIntoWrapper(node))
    .filter(Boolean) as HTMLElement[];

  if (assistantContents.length === 0) {
    return [];
  }

  const sidebarUserContents = Array.from(root.ownerDocument.querySelectorAll<HTMLElement>("._81e7b5e"))
    .map((node) => getText(node))
    .filter(Boolean)
    .map((text) => wrapPlainText(text!))
    .filter(Boolean) as HTMLElement[];

  const inlineUserContents = Array.from(root.querySelectorAll<HTMLElement>(".ds-message.d29f3d7d .fbb737a4"))
    .map((node) => cloneIntoWrapper(node))
    .filter(Boolean) as HTMLElement[];

  const userContents =
    sidebarUserContents.length >= assistantContents.length ? sidebarUserContents : inlineUserContents;

  const messages: ChatMessage[] = [];
  const pairCount = Math.max(userContents.length, assistantContents.length);

  for (let i = 0; i < pairCount; i += 1) {
    const userContent = userContents[i];
    const assistantContent = assistantContents[i];

    if (userContent) {
      messages.push({ role: "user", content: userContent });
    }
    if (assistantContent) {
      messages.push({ role: "deepseek", content: assistantContent });
    }
  }

  return messages;
}

function buildChatRoot(root: HTMLElement, provider: ChatProvider, title: string): HTMLElement | null {
  const messages =
    provider === "chatgpt"
      ? extractChatGptMessages(root)
      : provider === "gemini"
        ? extractGeminiMessages(root)
        : extractDeepSeekMessages(root);

  return buildChatTranscriptRoot(title, messages);
}

function buildChatTitle(root: HTMLElement, provider: ChatProvider, fallback: string): string {
  if (provider === "gemini") {
    return getText(root.querySelector("[data-test-id='conversation-title']")) || fallback;
  }

  if (provider === "deepseek") {
    return fallback.replace(/\s*-\s*DeepSeek$/i, "").trim() || fallback;
  }

  return fallback;
}

export const chatAdapter: DomainAdapter = {
  name: "chat",
  match(root) {
    return Boolean(detectChatProvider(root.ownerDocument));
  },
  transform(root, context) {
    const provider = detectChatProvider(root.ownerDocument);
    if (!provider) {
      return null;
    }

    const title = buildChatTitle(root, provider, context.documentTitle);
    const adaptedRoot = buildChatRoot(root, provider, title);
    if (!adaptedRoot) {
      return null;
    }

    return makeAdaptedContent(adaptedRoot, context, {
      title,
      site: provider,
      author: undefined,
      createdAt: undefined,
      modifiedAt: undefined
    });
  }
};
