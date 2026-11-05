export declare const NATIVE_SRC_PREFIX: string

export declare class NativeAudioElement {
  preload: string
  onended: (() => void) | null
  ontimeupdate: (() => void) | null
  onloadedmetadata: (() => void) | null
  onplayingchange: ((playing: boolean) => void) | null
  src: string
  readonly paused: boolean
  readonly ended: boolean
  readonly duration: number
  currentTime: number
  playbackRate: number
  setMeta(meta: { title?: string; langLabel?: string }): void
  removeAttribute(name: string): void
  addEventListener(...args: unknown[]): void
  removeEventListener(...args: unknown[]): void
  load(): void
  play(): Promise<void>
  pause(): void
}
