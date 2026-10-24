// Hold a possible trailing numbered marker until the following chunk arrives.
export class StreamParser {
  private buffer = ''
  private current: number | null = null
  // Whether the buffer starts at a line start: `^` alone would also match a mid-line
  // citation such as " [79]" that happens to begin a new chunk.
  private lineStart = true
  readonly values = new Map<number, string>()
  constructor(
    private count: number,
    private emit: (index: number, text: string) => void
  ) {}
  push(text: string): void {
    this.buffer += text
    this.drain(false)
  }
  finish(): number[] {
    this.drain(true)
    return Array.from({ length: this.count }, (_, i) => i + 1).filter(
      (i) => !this.values.get(i)?.trim()
    )
  }
  private output(text: string): void {
    if (this.current === null || this.current < 1 || this.current > this.count || !text) return
    this.values.set(this.current, (this.values.get(this.current) || '') + text)
    this.emit(this.current, text)
  }
  private atLineStart(index: number): boolean {
    return index > 0 || this.buffer[0] === '\n' || this.lineStart
  }
  private consume(length: number, marker = false): void {
    if (!length) return
    if (!marker) this.output(this.buffer.slice(0, length))
    this.lineStart = !marker && this.buffer[length - 1] === '\n'
    this.buffer = this.buffer.slice(length)
  }
  private drain(final: boolean): void {
    const marker = /(?:^|\n)\s*\[(\d+)\][ \t]*/g
    for (let m; (m = marker.exec(this.buffer));) {
      if (!this.atLineStart(m.index)) continue
      this.consume(m.index)
      this.consume(m[0].length, true)
      this.current = Number(m[1])
      marker.lastIndex = 0
    }
    const partial = /(?:^|\n)[ \t]*\[?\d*$/.exec(this.buffer)
    const cut =
      !final && partial && this.atLineStart(partial.index) ? partial.index : this.buffer.length
    this.consume(cut)
  }
}
