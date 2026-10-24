import { it, expect } from 'vitest'
import { sortParts } from '../../src/renderer/src/lib/selectionText'
it('双栏先左后右、栏内上下、跨页按页码', () => {
  const part = (text: string, page: number, left: number, top: number) => ({
    text,
    page,
    left,
    top,
    mid: 300
  })
  expect(
    sortParts([
      part('右上', 1, 350, 10),
      part('左下', 1, 50, 40),
      part('第二页', 2, 50, 0),
      part('左上', 1, 50, 10),
      part('右下', 1, 350, 40)
    ]).map((p) => p.text)
  ).toEqual(['左上', '左下', '右上', '右下', '第二页'])
})
