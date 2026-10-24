// Hold a possible trailing numbered marker until the following chunk arrives.
export class StreamParser {
  private buffer = ''
  private current: number | null = null
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
  private drain(final: boolean): void {
    const marker = /(?:^|\n)\s*\[(\d+)\][ \t]*/g
    let cursor = 0
    for (let m; (m = marker.exec(this.buffer));) {
      this.output(this.buffer.slice(cursor, m.index))
      this.current = Number(m[1])
      cursor = marker.lastIndex
    }
    this.buffer = this.buffer.slice(cursor)
    const partial = /(?:^|\n)[ \t]*\[?\d*$/.exec(this.buffer)
    const cut = !final && partial ? partial.index : this.buffer.length
    this.output(this.buffer.slice(0, cut))
    this.buffer = this.buffer.slice(cut)
  }
}
