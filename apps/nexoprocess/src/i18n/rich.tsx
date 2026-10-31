// Frases com trechos em destaque: o dicionário guarda "…o <b>mínimo</b>, o <b>máximo</b>…" e
// o componente decide como desenhar cada tag. Mantém a ordem das palavras traduzível.
import { Fragment, type ReactNode } from 'react';

export type RichTags = Record<string, (children: ReactNode) => ReactNode>;

/** Tags simples, sem aninhamento: <b>texto</b>. Tag desconhecida fica como texto. */
export function rich(text: string, tags: RichTags): ReactNode {
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const render = tags[m[1]];
    if (!render) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Fragment key={i++}>{render(m[2])}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 ? out[0] : out;
}
