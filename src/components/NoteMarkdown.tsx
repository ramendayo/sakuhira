import { useState } from "react";
import type { ComponentProps, MouseEvent } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openNoteLink } from "../services/notes";
import { errorMessage } from "../services/projects";

const components: Components = {
  h1: "h3",
  h2: "h4",
  h3: "h5",
  h4: "h6",
  h5: "h6",
  a: NoteLink,
  img: ({ alt }) => alt ?? null,
  table: ({ node: _node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
};

function NoteLink({ href, children }: Pick<ComponentProps<"a">, "href" | "children">) {
  const [error, setError] = useState<string | null>(null);

  async function open(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!href) return;
    setError(null);
    try {
      await openNoteLink(href);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  if (!href) return <>{children}</>;
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={open}
        onAuxClick={(event) => { if (event.button === 1) void open(event); }}>
        {children}
      </a>
      {error && <span role="alert" className="ml-2 text-danger">{error}</span>}
    </>
  );
}

export default function NoteMarkdown({ source }: { source: string }) {
  if (!source.trim()) return <p>未記入</p>;
  return (
    <div className="note-markdown">
      <Markdown
        components={components}
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => key === "href" && /^https?:\/\//i.test(url) ? url : undefined}
      >
        {source}
      </Markdown>
    </div>
  );
}
