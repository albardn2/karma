// A deliberately small Markdown renderer for assistant answers: paragraphs,
// headings, bullet/numbered lists, GitHub-style tables, **bold** and `code`.
// Builds React elements (never HTML strings), so model output can't inject markup.
import { Fragment, type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    return <Fragment key={key}>{p}</Fragment>;
  });
}

const isTableRow = (l: string) => l.trim().startsWith("|") && l.trim().endsWith("|");
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // table
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      const key = `t${k++}`;
      blocks.push(
        <div key={key} className="my-2 overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60">
              <tr>
                {head.map((h, j) => (
                  <th key={j} className="px-2 py-1.5 text-start font-semibold whitespace-nowrap" dir="auto">
                    {inline(h, `${key}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1.5 align-top" dir="auto">
                      {inline(c, `${key}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const key = `h${k++}`;
      blocks.push(
        <p key={key} className="mt-2 mb-1 font-semibold" dir="auto">
          {inline(h[2], key)}
        </p>,
      );
      i++;
      continue;
    }
    // list
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const key = `l${k++}`;
      const cls = `my-1 ps-5 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"}`;
      const children = items.map((it, j) => (
        <li key={j} dir="auto">
          {inline(it, `${key}-${j}`)}
        </li>
      ));
      blocks.push(ordered ? <ol key={key} className={cls}>{children}</ol> : <ul key={key} className={cls}>{children}</ul>);
      continue;
    }
    // paragraph: gather until a blank line or another block starts
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isTableRow(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    const key = `p${k++}`;
    blocks.push(
      <p key={key} className="my-1 leading-relaxed" dir="auto">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="text-sm break-words">{blocks}</div>;
}
