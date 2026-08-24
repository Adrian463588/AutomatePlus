/**
 * Cross-boundary payload limits. These are safety limits, not truncation of
 * evidence: an oversized payload is rejected or explicitly marked as
 * truncated at the boundary that displays it.
 */
export const MAX_API_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_API_UI_RESPONSE_BYTES = 1 * 1024 * 1024;
