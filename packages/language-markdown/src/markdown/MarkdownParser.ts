import {
  getDefaultClass,
  StandardToolOptions,
} from "@dc-extension-rich-text/common";
import { html_block } from "../alignment";
import { soft_hyphen_from } from "../soft_hyphen";

// tslint:disable-next-line
const markdown = require("prosemirror-markdown");
// tslint:disable-next-line
const markdownit = require("markdown-it");
// tslint:disable-next-line
var { markdownItTable } = require("markdown-it-table");

export function createMarkdownParser(
  schema: any,
  options: StandardToolOptions
): any {
  const md = markdownit("commonmark", {
    html: true,
    linkify: false,
  });
  md.use(markdownItTable);

  md.inline.ruler.before("text", "soft_hyphen", soft_hyphen_from);
  md.block.ruler.before("html_block", "html_block", html_block);

  // Patch parser to detect <span></span> tags and convert into inline_styles marks
  // Warning... this might be a little brittle
  const parser = new markdown.MarkdownParser(schema, md, {
    ...markdown.defaultMarkdownParser.tokens,
    link: {
      mark: "link",
      getAttrs: (tok: any) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title") || null,
        target: tok.attrGet("target") || null,
        rel: tok.attrGet("rel") || null,
      }),
    },
    anchor: {
      node: "anchor",
      getAttrs: (tok: any) => ({
        value: tok.attrGet("value"),
      }),
    },
    fence: {
      block: "code_block",
      getAttrs: (tok: any) => ({ params: tok.info || "" }),
      noCloseToken: true,
    },
    soft_hyphen: { node: "soft_hyphen" },
    table: { block: "table" },
    th: {
      block: "table_header",
      getAttrs: (tok: any) => ({
        style: tok.attrGet("style"),
      }),
    },
    tr: { block: "table_row" },
    td: {
      block: "table_cell",
      getAttrs: (tok: any) => ({
        style: tok.attrGet("style"),
      }),
    },
  });

  const originalParagraph = parser.tokenHandlers.paragraph;
  parser.tokenHandlers.paragraph = (
    state: any,
    token: any,
    tokens: any,
    i: number
  ) => {
    if (token.content && /\n\d+\n\d+/.test(token.content)) {
      token.content = token.content.replace(/\n\d+\n\d+/g, "\n\n");
    }

    originalParagraph(state, token, tokens, i);
  };

  parser.tokenHandlers.html_inline = (state: any, token: any) => {
    if (!token || !token.content) {
      return;
    }

    const content: string = (token.content || "").trim();

    if (content.startsWith("<span") && content.endsWith(">")) {
      const dom = new DOMParser().parseFromString(token.content, "text/html");
      const tag = dom.body.firstChild;

      if (!tag) {
        return;
      }

      if (tag.nodeName.toLowerCase() === "span") {
        const className = (tag as Element).getAttribute("class");
        state.openMark(
          schema.marks.inline_styles.create({
            class: className,
          })
        );
      }
    } else if (content === "</span>") {
      state.closeMark(schema.marks.inline_styles);
    } else if (content.startsWith("<a") && content.endsWith(">")) {
      const dom = new DOMParser().parseFromString(token.content, "text/html");
      const tag = dom.body.firstChild;

      if (!tag) {
        return;
      }

      if (tag.nodeName.toLowerCase() === "a") {
        const id = (tag as Element).getAttribute("id");
        const href = (tag as Element).getAttribute("href");
        const title = (tag as Element).getAttribute("title");
        const target = (tag as Element).getAttribute("target");
        const rel = (tag as Element).getAttribute("rel");

        if (id != null) {
          state.addNode(schema.nodes.anchor, {
            value: id,
          });
        } else if (href) {
          state.openMark(
            schema.marks.link.create({
              href,
              title: title || null,
              target: target || null,
              rel: rel || null,
            })
          );
        }
      }
    } else if (content === "</a>") {
      state.closeMark(schema.marks.link);
    } else if (content === "<br>") {
      state.addNode(schema.nodes.hard_break);
    } else {
      const html = token.content;
      const linkMatch = html.match(/<a\s+([^>]*)>\s*([\s\S]*?)\s*<\/a>/i);

      if (linkMatch) {
        const attrs = linkMatch[1];
        const content = linkMatch[2];

        const hrefMatch = attrs.match(/href="([^"]*)"/);
        const titleMatch = attrs.match(/title="([^"]*)"/);
        const targetMatch = attrs.match(/target="([^"]*)"/);
        const relMatch = attrs.match(/rel="([^"]*)"/);

        if (hrefMatch) {
          const mark = schema.marks.link.create({
            href: hrefMatch[1],
            title: titleMatch ? titleMatch[1] : null,
            target: targetMatch ? targetMatch[1] : null,
            rel: relMatch ? relMatch[1] : null,
          });

          state.openMark(mark);
          state.addText(content);
          state.closeMark(mark);
        }
      }
    }
  };

  const alignedParagraphTypes = new Map<string, string>([
    ["P", "paragraph"],
    ["H1", "heading"],
    ["H2", "heading"],
    ["H3", "heading"],
    ["H4", "heading"],
    ["H5", "heading"],
    ["H6", "heading"],
  ]);

  const alignmentClasses = new Map<string, string>([
    ["amp-align-left", "left"],
    ["amp-align-center", "center"],
    ["amp-align-right", "right"],
    ["amp-align-justify", "justify"],
  ]);

  // tslint:disable-next-line
  parser.tokenHandlers.html_block_open = (state: any, token: any) => {
    if (!alignedParagraphTypes.has(token.meta.tag)) {
      return;
    }

    const styleAttr = token.meta.attrs.find(
      (attr: Attr) => attr.name === "style"
    ) as Attr;
    let alignAttr = "left";
    if (styleAttr) {
      alignAttr =
        (styleAttr.ownerElement as HTMLElement).style.textAlign || alignAttr;
    }

    const classAttr = token.meta.attrs.find(
      (attr: Attr) => attr.name === "class"
    ) as Attr;
    if (classAttr) {
      // Styles may be present in classes instead
      (classAttr.ownerElement as HTMLElement).classList.forEach((value) => {
        const asDefault = getDefaultClass(value, options);

        alignAttr = alignmentClasses.get(asDefault) || "left";
      });
    }

    const nodeType = alignedParagraphTypes.get(token.meta.tag) as string;

    const level =
      nodeType === "heading" ? Number(token.meta.tag[1]) : undefined;
    state.openNode(schema.nodes[nodeType], {
      align: alignAttr ? alignAttr : "left",
      level,
    });
  };

  // tslint:disable-next-line
  parser.tokenHandlers.html_block_close = (state: any, token: any) => {
    if (alignedParagraphTypes.has(token.meta.tag)) {
      state.closeNode();
    }
  };

  return parser;
}
