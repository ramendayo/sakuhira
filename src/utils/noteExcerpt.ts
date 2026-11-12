import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm).freeze();
const excerptLimit = 200;

type MarkdownRoot = ReturnType<typeof parser.parse>;
type MarkdownNode = MarkdownRoot | MarkdownRoot["children"][number];

function readText(node: MarkdownNode): string {
  switch (node.type) {
    case "text":
    case "code":
    case "inlineCode":
      return node.value;
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "break":
      return " ";
    case "root":
    case "blockquote":
    case "list":
    case "listItem":
    case "table":
    case "tableRow":
      return node.children.map(readText).join(" ");
    case "footnoteDefinition":
      return "";
    default:
      // Inline content stays adjacent to surrounding punctuation and Japanese text.
      return "children" in node ? node.children.map(readText).join("") : "";
  }
}

export function noteExcerpt(source: string): string {
  if (!source.trim()) return "";

  const text = readText(parser.parse(source)).replace(/\s+/g, " ").trim();
  if (text.length <= excerptLimit) return text;

  const characters = Array.from(text);
  return characters.length > excerptLimit
    ? characters.slice(0, excerptLimit).join("").trimEnd() + "…"
    : text;
}
