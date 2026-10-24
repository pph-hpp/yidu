import { beforeEach, expect, it } from 'vitest'
import { useDocStore } from '../../src/renderer/src/stores/docStore'
import { useTranslateStore } from '../../src/renderer/src/stores/translateStore'
const file = (i: number) => ({
  fileId: String(i),
  path: 'E:/papers/' + i + '.md',
  name: i + '.md',
  kind: 'md' as const,
  text: '',
  mtimeMs: 0
})
beforeEach(() => {
  useDocStore.setState({ docs: [], activeId: null, zoom: 1 })
  useTranslateStore.getState().clear()
})
it('deduplicates paths, limits tabs and selects the adjacent tab on close', () => {
  const store = useDocStore.getState()
  for (let i = 0; i < 20; i++) store.open(file(i))
  expect(() => store.open(file(20))).toThrow('20')
  store.open({ ...file(0), fileId: 'other', path: file(0).path.toUpperCase() })
  expect(useDocStore.getState().docs).toHaveLength(20)
  expect(useDocStore.getState().activeId).toBe('0')
  store.close('0')
  expect(useDocStore.getState().activeId).toBe('1')
  store.close('19')
  expect(useDocStore.getState().activeId).toBe('1')
})
it('clamps zoom and handles too short / too long selections', () => {
  useDocStore.getState().setZoom(0)
  expect(useDocStore.getState().zoom).toBe(0.5)
  useDocStore.getState().setZoom(10)
  expect(useDocStore.getState().zoom).toBe(3)
  useTranslateStore.getState().translate('a')
  expect(useTranslateStore.getState().sentences).toHaveLength(0)
  expect(() => useTranslateStore.getState().translate('a'.repeat(6001))).toThrow('选区过长')
  useTranslateStore.getState().translate('As shown in Fig. 3, the delay drops. It then rises.')
  expect(useTranslateStore.getState().sentences.map((s) => s.source)).toEqual([
    'As shown in Fig. 3, the delay drops.',
    'It then rises.'
  ])
})
