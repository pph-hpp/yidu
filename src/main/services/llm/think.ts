// 推理模型（Qwen3、DeepSeek-R1 等）未开启服务端推理解析时，会把思考过程以
// <think>…</think> 混在正文里。流式过滤：标签可能被拆在相邻数据块之间。
const OPEN = '<think>',
  CLOSE = '</think>'
// buffer 末尾可能是 tag 的前半段时，保留这部分等下一块
function pendingPrefix(buffer: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, buffer.length); n > 0; n--)
    if (tag.startsWith(buffer.slice(-n))) return n
  return 0
}
export class ThinkFilter {
  private buffer = ''
  private inThink = false
  /** 是否出现过思考内容（用于提示「模型思考中」） */
  thinking = false
  push(text: string): string {
    this.buffer += text
    let out = ''
    for (;;) {
      if (this.inThink) {
        const end = this.buffer.indexOf(CLOSE)
        if (end < 0) {
          this.buffer = this.buffer.slice(this.buffer.length - pendingPrefix(this.buffer, CLOSE))
          return out
        }
        this.buffer = this.buffer.slice(end + CLOSE.length).replace(/^\s+/, '')
        this.inThink = false
        continue
      }
      const start = this.buffer.indexOf(OPEN)
      if (start >= 0) {
        out += this.buffer.slice(0, start)
        this.buffer = this.buffer.slice(start + OPEN.length)
        this.inThink = this.thinking = true
        continue
      }
      const keep = Math.max(pendingPrefix(this.buffer, OPEN), pendingPrefix(this.buffer, CLOSE))
      out += this.buffer.slice(0, this.buffer.length - keep)
      this.buffer = this.buffer.slice(this.buffer.length - keep)
      return out
    }
  }
  /** 流结束：未闭合的思考内容整体丢弃 */
  finish(): string {
    const rest = this.inThink ? '' : this.buffer
    this.buffer = ''
    return rest
  }
}
/** 非流式回答：去掉思考内容；开头标签由聊天模板预先插入时只剩结尾标签 */
export function stripThink(text: string): string {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const orphan = cleaned.lastIndexOf(CLOSE)
  return (orphan >= 0 ? cleaned.slice(orphan + CLOSE.length) : cleaned).replace(/^\s+/, '')
}
