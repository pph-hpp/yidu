import { describe, it, expect } from 'vitest'
import { StreamParser } from '../../src/main/services/llm/streamParser'
import { readSSE } from '../../src/main/services/llm/sse'
describe('流式编号解析', () => {
  it('编号跨三个片段，不能泄漏半个标记', () => {
    const out = new Map<number, string>(),
      p = new StreamParser(2, (i, t) => out.set(i, (out.get(i) || '') + t))
    p.push('[1] 静态')
    expect(out.get(1)).toBe('静态')
    p.push('时序\n[')
    expect(out.get(1)).toBe('静态时序')
    p.push('2] 然而')
    expect(p.finish()).toEqual([])
    expect([...out]).toEqual([
      [1, '静态时序'],
      [2, '然而']
    ])
  })
  it('缺失编号 2 只降级该句', () => {
    const p = new StreamParser(3, () => {})
    p.push('[1] 第一\n[3] 第三')
    expect(p.finish()).toEqual([2])
  })
  it('逐字到达、空行、范围外编号与无编号响应', () => {
    const p = new StreamParser(2, () => {})
    for (const c of '[1] 第一\n\n[2] 第二\n[9] 忽略') p.push(c)
    expect(p.finish()).toEqual([])
    expect(p.values.get(1)?.trim()).toBe('第一')
    expect(p.values.get(2)?.trim()).toBe('第二')
    const empty = new StreamParser(2, () => {})
    empty.push('无编号')
    expect(empty.finish()).toEqual([1, 2])
  })
  it('SSE CRLF 和 UTF-8 字符跨字节，支持多行 data', async () => {
    const bytes = new TextEncoder().encode(
      'data: {"text":"中文"}\r\n\r\ndata: one\ndata: two\n\ndata: [DONE]\n\n'
    )
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]))
        c.close()
      }
    })
    const out = []
    for await (const d of readSSE(body)) out.push(d)
    expect(out).toEqual(['{"text":"中文"}', 'one\ntwo', '[DONE]'])
  })
})
