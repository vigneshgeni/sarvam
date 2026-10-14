/**
 * Shared contracts between the explanation logic and the design screens.
 * The real implementations live in share.ts and the overlay / reading hooks.
 */
export { buildShare, redactResult } from '../utils/share'
export { useOverlayRestore } from '../hooks/useOverlayRestore'
export { useReadingStage, type ReadingStage, type ReadingStageResult } from '../hooks/useReadingStage'
export type {
  Part,
  Section,
  SectionValue,
  KeyPoint,
  GlanceSection as Glance,
  MedicineItem as Medicine,
  ExplainResponse as ExplainResult,
  ExplainResponse,
} from '../types'
