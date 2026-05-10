/**
 * Splits a script into chunks at sentence boundaries, each <= charLimit.
 * Long sentences fall back to comma boundaries, then to hard slicing.
 */
export function chunkScript(script: string, charLimit: number): string[] {
  const text = script.trim();
  if (text.length === 0) return [];
  if (text.length <= charLimit) return [text];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const push = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = '';
    }
  };

  const append = (sentence: string) => {
    if (current.length === 0) {
      current = sentence;
      return;
    }
    if (current.length + 1 + sentence.length <= charLimit) {
      current = `${current} ${sentence}`;
    } else {
      push();
      current = sentence;
    }
  };

  for (const sentence of sentences) {
    if (sentence.length <= charLimit) {
      append(sentence);
      continue;
    }
    push();
    // Sentence too long: fall back to comma split, then hard slice.
    const parts = sentence.split(/,\s+/);
    let buf = '';
    for (const part of parts) {
      const piece = part.length > charLimit ? hardSlice(part, charLimit) : [part];
      for (const segment of piece) {
        if (buf.length === 0) {
          buf = segment;
        } else if (buf.length + 2 + segment.length <= charLimit) {
          buf = `${buf}, ${segment}`;
        } else {
          chunks.push(buf);
          buf = segment;
        }
      }
    }
    if (buf.length > 0) chunks.push(buf);
  }

  push();
  return chunks;
}

function hardSlice(s: string, charLimit: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += charLimit) {
    out.push(s.slice(i, i + charLimit));
  }
  return out;
}
