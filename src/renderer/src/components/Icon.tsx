const paths = {
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12 M6 18 18 6',
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  summary: 'M4 5h10 M4 10h10 M4 15h5 M13 17l3 3 6-7',
  select: 'M8 3h8 M12 3v18 M8 21h8 M4 8h3 M17 8h3 M4 16h3 M17 16h3',
  highlight: 'm6 14 8-11 6 5-8 11z M6 14l-2 7 8-2 M3 22h10',
  background: 'M3 3h18v18H3z M8 17l4-10 4 10 M9 14h6',
  text: 'm6 17 6-14 6 14 M8 12h8 M4 21h16',
  note: 'M21 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z',
  undo: 'M8 4 3 9l5 5 M3 9h11a7 7 0 0 1 0 14',
  redo: 'm16 4 5 5-5 5 M21 9H10a7 7 0 0 0 0 14',
  translate: 'M3 5h12 M9 2v3 M5 5c0 6 7 10 7 10 M13 5c0 6-7 10-10 10 M14 21l4-11 4 11 M16 17h4',
  copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  arrow: 'M12 20V4 M5 11l7-7 7 7',
  markdown: 'M2 5v14 M2 5l5 7 5-7v14 M18 5v14 M15 16l3 3 3-3'
} as const
export type IconName = keyof typeof paths
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
