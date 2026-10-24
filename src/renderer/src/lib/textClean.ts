/** Preserve paragraph boundaries while joining PDF text-layer line breaks. */
export function textClean(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
      // Strip isolated page numbers / line labels before their newlines disappear.
      .replace(/^\s*\d+\s*$/gm, '')
      .replace(/^[ \t]*\d+[ \t]+(?=\p{L})/gmu, '')
      .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Ll})/gu, '$1$2')
      .replace(/(\p{L})-[ \t]*\n[ \t]*(\p{Lu})/gu, '$1-$2')
      .split(/\n[ \t]*\n+/)
      .map((p) =>
        p
          .replace(/\s+/g, ' ')
          .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
          .trim()
      )
      .filter(Boolean)
      .join('\n\n')
  )
}
