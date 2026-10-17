/**
 * One retry for a dropped connection or a short gateway failure.
 * A timeout (504) stays terminal so a long read is not started twice.
 */
export function explainCanRetry(status, attempt) {
  if (attempt !== 0) return false
  return status === 0 || status === 502 || status === 503
}
