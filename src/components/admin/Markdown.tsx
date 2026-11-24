import { Fragment, type ReactNode } from "react";

/** Renderiza o Markdown simples da IA (títulos, listas, negrito) sem HTML bruto. */
function inline(t: string): ReactNode[] {
  return t
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) =>
      p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
        <b key={i}>{p.slice(2, -2)}</b>
      ) : (
        <Fragment key={i}>{p.replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2")}</Fragment>
      ),
    );
}
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    out.push(
      <L
        key={out.length}
        className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}
      >
        {list.items.map((x, i) => (
          <li key={i}>{inline(x)}</li>
        ))}
      </L>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    flush();
    if (h)
      out.push(
        <p key={out.length} className="mt-2 font-extrabold text-navy">
          {inline(h[2]!)}
        </p>,
      );
    else if (line.trim()) out.push(<p key={out.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-1">{out}</div>;
}
