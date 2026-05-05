import type { BlockNode, InlineNode, NormalizedDocument } from "../domain/types";

function longestBacktickRun(value: string): number {
  let max = 0;
  let current = 0;
  for (const ch of value) {
    if (ch === "`") {
      current += 1;
      if (current > max) {
        max = current;
      }
    } else {
      current = 0;
    }
  }
  return max;
}

function renderInline(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.value.replace(/([*_`[\]])/g, "\\$1");
        case "strong":
          return `**${renderInline(node.children)}**`;
        case "em":
          return `*${renderInline(node.children)}*`;
        case "inlineCode": {
          const backtickCount = longestBacktickRun(node.value);
          const fence = "`".repeat(backtickCount + 1);
          const pad = node.value.startsWith("`") ? " " : "";
          const padEnd = node.value.endsWith("`") ? " " : "";
          return `${fence}${pad}${node.value}${padEnd}${fence}`;
        }
        case "link": {
          const label = renderInline(node.children).trim() || node.href;
          return node.href ? `[${label}](${node.href})` : label;
        }
        case "lineBreak":
          return "\\\n";
      }
    })
    .join("");
}

function block(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `${trimmed}\n\n` : "";
}

function renderListItem(blocks: BlockNode[]): string {
  return blocks
    .map((b) => renderBlock(b).trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n/g, "\n  ");
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  const headerLine = `| ${header.join(" | ")} |`;
  const dividerLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body.map((row) => `| ${row.join(" | ")} |`);
  return `${[headerLine, dividerLine, ...bodyLines].join("\n")}\n\n`;
}

export function renderBlock(node: BlockNode): string {
  switch (node.type) {
    case "heading":
      return block(`${"#".repeat(node.depth)} ${renderInline(node.children)}`);
    case "paragraph":
      return block(renderInline(node.children));
    case "list": {
      const lines = node.items.map((item, index) => {
        const prefix = node.ordered ? `${index + 1}. ` : "- ";
        return `${prefix}${renderListItem(item)}`;
      });
      return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
    }
    case "code":
      return `\n\`\`\`${node.language ?? ""}\n${node.code}\n\`\`\`\n\n`;
    case "quote": {
      const content = renderBlocks(node.children)
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return content ? `${content}\n\n` : "";
    }
    case "table":
      return renderTable(node.rows);
    case "image":
      return node.src ? `![${node.alt ?? "image"}](${node.src})\n\n` : "";
    case "media":
      return node.src ? `[${node.kind}](${node.src})\n\n` : "";
    case "thematicBreak":
      return "\n---\n\n";
  }
}

export function renderBlocks(blocks: BlockNode[]): string {
  return blocks
    .map((blockNode) => renderBlock(blockNode))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function renderDocument(document: NormalizedDocument): string {
  return renderBlocks(document.blocks);
}
