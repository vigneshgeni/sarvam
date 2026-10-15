import type { ReactNode } from 'react'
import type { DocIconName } from '../design/catalog'

type P = { size?: number; stroke?: string; sw?: number; className?: string }

function Svg({
  size = 22,
  stroke = 'currentColor',
  sw = 2,
  className,
  children,
}: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconBack(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.4}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  )
}

export function IconChevron(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.4}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  )
}

export function IconClose(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.4}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function IconCamera(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.4" />
    </Svg>
  )
}

export function IconFile(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </Svg>
  )
}

export function IconLock(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.2}>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2" />
    </Svg>
  )
}

export function IconCalendar(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  )
}

export function IconInfo(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  )
}

export function IconTick(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  )
}

export function IconSearch(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.2}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  )
}

export function IconArrow(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.4}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  )
}

export function IconGlobe(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
    </Svg>
  )
}

export function IconMenu(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.4}>
      <path d="M4 9h16" />
      <path d="M4 15h10" />
    </Svg>
  )
}

export function IconEye(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.2}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function IconPlay(p: P) {
  return (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4l13 8-13 8z" fill={p.stroke ?? '#1A1A1A'} />
    </svg>
  )
}

export function IconBubble(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.2}>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  )
}

export function IconShareUp(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2.2}>
      <path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </Svg>
  )
}

export function IconSpark(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
    </Svg>
  )
}

export function IconSun(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.4 5.4l1.3 1.3M17.3 17.3l1.3 1.3M18.6 5.4l-1.3 1.3M6.7 17.3l-1.3 1.3" />
    </Svg>
  )
}

export function IconMoon(p: P) {
  return (
    <Svg {...p} sw={p.sw ?? 2}>
      <path d="M20 14.8A7.2 7.2 0 0 1 9.2 4 6.4 6.4 0 1 0 20 14.8z" />
    </Svg>
  )
}

export function IconA11y({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.6" r="1.7" fill="#FFFFFF" stroke="none" />
      <path d="M5 8.6c2.4.8 4.6 1.1 7 1.1s4.6-.3 7-1.1" />
      <path d="M12 9.8v4.4" />
      <path d="M12 14.2l-3.4 6" />
      <path d="M12 14.2l3.4 6" />
    </svg>
  )
}

const PATHS: Record<DocIconName, ReactNode> = {
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  rupee: <path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8l7 7" />,
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  house: (
    <>
      <path d="M4 11l8-7 8 7v9H4z" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  car: (
    <>
      <path d="M4 16v-4l2-5h12l2 5v4z" />
      <circle cx="8" cy="16.5" r="1.8" />
      <circle cx="16" cy="16.5" r="1.8" />
    </>
  ),
  pill: (
    <>
      <path d="M4.5 15.5l8-8a4 4 0 0 1 5.6 5.6l-8 8a4 4 0 0 1-5.6-5.6z" />
      <path d="M8.5 11.5l5.6 5.6" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  gavel: <path d="M14 4l6 6M11 7l6 6M12.5 5.5l-5 5M3 21l7-7M8 12l4 4" />,
  clip: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  stamp: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <circle cx="12" cy="14" r="2.6" />
    </>
  ),
  bolt: <path d="M13 2L5 13h6l-1 9 8-11h-6z" />,
  wifi: (
    <>
      <path d="M4 9.5a12 12 0 0 1 16 0" />
      <path d="M7 13a7.5 7.5 0 0 1 10 0" />
      <path d="M10 16.5a3 3 0 0 1 4 0" />
      <path d="M12 20h.01" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l4-1 11-11-3-3L5 16z" />
      <path d="M14 6l3 3M4 20h16" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.2" />
      <path d="M11 12h10M17 12v3M20 12v2" />
    </>
  ),
  cap: (
    <>
      <path d="M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v4c2 2 10 2 12 0v-4" />
    </>
  ),
  pages: (
    <>
      <path d="M7 6h11v14H7z" />
      <path d="M5 4h11" />
      <path d="M9 10h6M9 14h4" />
    </>
  ),
}

export function DocIcon({
  name,
  size = 22,
  stroke = 'currentColor',
}: {
  name: DocIconName
  size?: number
  stroke?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
