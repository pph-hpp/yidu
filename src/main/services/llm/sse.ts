export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader(),
    decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      // Normalize after buffering so a CRLF split between chunks stays intact.
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() || ''
      if (done && buffer) {
        events.push(buffer)
        buffer = ''
      }
      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n')
        if (data) yield data
      }
      if (done) break
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
