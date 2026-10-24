export class ProfileQueue {
  private active = new Map<string, number>()
  private waiting = new Map<string, Array<() => void>>()
  async run<T>(id: string, signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError')
    if ((this.active.get(id) || 0) >= 3)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener('abort', abort)
          resolve()
        }
        const abort = () => {
          const list = this.waiting.get(id) || []
          this.waiting.set(
            id,
            list.filter((x) => x !== ready)
          )
          reject(new DOMException('已取消', 'AbortError'))
        }
        this.waiting.set(id, [...(this.waiting.get(id) || []), ready])
        signal.addEventListener('abort', abort, { once: true })
      })
    else this.active.set(id, (this.active.get(id) || 0) + 1)
    try {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      return await task()
    } finally {
      const next = this.waiting.get(id)?.shift()
      if (next) next()
      else this.active.set(id, (this.active.get(id) || 1) - 1)
    }
  }
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'))
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
