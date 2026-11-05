export type ActivityPhase =
  | 'preparing'
  | 'scanning'
  | 'ready'
  | 'listening'
  | 'paused'
  | 'finished'
  | 'failed'
  | 'passwordNeeded'

export interface ActivityState {
  docId: string
  phase: ActivityPhase
  title: string
  fileName?: string
  fileCount: number
  progress: number
  stage: string
  secondsRemaining?: number
  language: string
  languageLabel: string
  voiceGender?: 'female' | 'male'
  currentTime?: number
  duration?: number
  allowListen: boolean
  showDocumentName?: boolean
  errorMessage?: string
}

export declare function getShowDocNameOnLockScreen(): boolean
export declare function setShowDocNameOnLockScreen(val: boolean): void

export declare function getCurrentActivityState(): ActivityState | null

export declare function startScanActivity(params: {
  docId: string
  fileName?: string
  fileCount: number
  language: string
  t?: Record<string, string>
}): Promise<void>

export declare function updateScanProgress(params: {
  docId: string
  progress: number
  stageText: string
  secondsRemaining?: number
}): Promise<void>

export declare function markScanReady(params: {
  docId: string
  title?: string
  language: string
  languageLabel: string
}): Promise<void>

export declare function markScanFailed(params: {
  docId: string
  errorMessage?: string
}): Promise<void>

export declare function markScanPasswordNeeded(params: {
  docId: string
}): Promise<void>

export declare function endScanActivity(docId?: string, opts?: { force?: boolean }): Promise<void>

export declare function startListenActivity(params: {
  docId: string
  title: string
  language: string
  languageLabel: string
  voiceGender: 'female' | 'male'
  duration: number
  currentTime?: number
  audioBase64?: string
}): Promise<void>

export declare function updateListenPlayback(params: {
  currentTime: number
  duration: number
  isPlaying: boolean
}): Promise<void>

export declare function finishListenActivity(): Promise<void>

export declare function fileToBase64(file: File): Promise<string>

export declare function startNativeScan(params: {
  docId: string
  title?: string
  lang: string
  apiBase?: string
  showDocumentName?: boolean
  password?: string
  files: File[]
}): Promise<any>

export declare function checkPendingScanResult(docId?: string): Promise<{
  ready?: boolean
  result?: any
  error?: boolean
  details?: any
  running?: boolean
}>

export declare function cancelNativeScan(docId?: string): Promise<void>

export declare function previewDocument(params: {
  fileName: string
  title?: string
  base64?: string
  url?: string
}): Promise<any>

export declare function shareContent(params: {
  text?: string
  url?: string
  title?: string
  icsData?: string
}): Promise<any>

export declare function getLastOpenedURL(): Promise<string | null>

export declare function echoBridge(value?: string): Promise<{
  value: string
  bridgeActive: boolean
} | null>

export declare function downloadSpeechToFile(params: {
  url: string
  body: string
  timeoutMs?: number
}): Promise<{ path: string; bytes: number; status: number; contentType: string }>
export declare function nativeAudioPlay(params: {
  filePath: string
  title?: string
  langLabel?: string
  rate?: number
  startPosition?: number
  autoStart?: boolean
}): Promise<{ success: boolean; duration: number }>
export declare function nativeAudioResume(): Promise<unknown>
export declare function nativeAudioPause(): Promise<unknown>
export declare function nativeAudioSeek(position: number): Promise<unknown>
export declare function nativeAudioStop(): Promise<unknown>
export declare function nativeAudioSetRate(rate: number): Promise<unknown>
export declare function getNativeAudioState(): Promise<{
  active: boolean
  playing: boolean
  position: number
  duration: number
  ended: boolean
} | null>
