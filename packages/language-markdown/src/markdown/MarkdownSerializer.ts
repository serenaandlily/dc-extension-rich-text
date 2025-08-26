import { StandardToolOptions } from "@dc-extension-rich-text/common";
import {
  AlignedHeaderToMarkdown,
  AlignedParagraphToMarkdown,
} from "../alignment/AlignmentPlugin";
import { AnchorToMarkdown } from "../anchor";
import { InlineStylesToMarkdown } from "../inline_styles";
import { SoftHyphenToMarkdown } from "../soft_hyphen";
import { TableToMarkdown } from "../tables/TableToMarkdown";

// tslint:disable-next-line
const markdown = require("prosemirror-markdown");

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanPositionMarkers(text: string): string {
  const normalized = text.replace(/\\\\\\n/g, "\\\\n");
  return normalized.replace(
    /((?:\\n)|\r?\n)[ \t]*\d+[ \t]*(?=(?:\\n)|\r?\n|$)/g,
    (_m, nl) => (nl === "\\n" ? "\\n" : "\n\n")
  );
}
const TextToMarkdown = {
  text(state: any, node: any): void {
    state.text(escape(node.text));
  },
};

export function createMarkdownSerializer(
  options: StandardToolOptions,
  serializers: Record<string, any> = {}
): any {
  const defaultMarkdownSerializer = new markdown.MarkdownSerializer(
    {
      ...markdown.defaultMarkdownSerializer.nodes,
      ...SoftHyphenToMarkdown,
      ...AnchorToMarkdown,
      ...TableToMarkdown,
      ...AlignedParagraphToMarkdown(options),
      ...AlignedHeaderToMarkdown(options),
      ...TextToMarkdown,
      ...serializers,
    },
    {
      ...markdown.defaultMarkdownSerializer.marks,
      ...InlineStylesToMarkdown,
    }
  );

  defaultMarkdownSerializer.marks.link = {
    open(state: any) {
      state.write("[");
      state._linkOpen = state.out.length - 1;
      return "";
    },
    close(state: any, mark: any) {
      const { href, title, target, rel } = mark.attrs;
      const openIndex =
        typeof state._linkOpen === "number"
          ? state._linkOpen
          : state.out.lastIndexOf("[");

      const linkText = state.out.slice(openIndex + 1);
      state.out = state.out.slice(0, openIndex);

      if (target || rel) {
        const relAttr = rel ? ` rel="${rel}"` : "";
        return `<a href="${href}"${title ? ` title="${title}"` : ""}${
          target ? ` target="${target}"` : ""
        }${relAttr}>${linkText}</a>`;
      }

      return `[${linkText}](${href}${title ? ` "${title}"` : ""})`;
    },
  };

  const originalSerialize = defaultMarkdownSerializer.serialize;
  defaultMarkdownSerializer.serialize = function(doc: any): string {
    const output = originalSerialize.call(this, doc);
    return cleanPositionMarkers(output);
  };

  return defaultMarkdownSerializer;
}
