/**
 * @file Shared type definitions, message constants, and utilities
 * for Meet Presenter Switch Chrome Extension.
 */

/**
 * @typedef {Object} PresenterEntry
 * @property {string} id - Unique identifier (UUID)
 * @property {string} name - Presenter display name
 * @property {string} url - Presentation material URL
 * @property {'slides'|'tab'} type - Content type
 * @property {'idle'|'loading'|'ready'|'error'} preloadStatus - Preload state
 * @property {number|null} tabId - Preloaded tab ID (null = not loaded)
 */

/**
 * @typedef {Object} SessionConfig
 * @property {string} meetCode - Meet code (e.g., abc-defg-hij)
 * @property {PresenterEntry[]} presenters - Ordered presenter list
 * @property {number} currentIndex - Currently active presenter index
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/** Message type constants for inter-component communication */
const MSG = Object.freeze({
  PRELOAD_TAB: 'PRELOAD_TAB',
  SWITCH_PRESENTER: 'SWITCH_PRESENTER',
  GET_SESSION: 'GET_SESSION',
  SAVE_SESSION: 'SAVE_SESSION',
  STOP_SHARING: 'STOP_SHARING',
  START_SHARING: 'START_SHARING',
  PANEL_UPDATE: 'PANEL_UPDATE',
});

/**
 * Generate a unique ID for presenter entries.
 * @returns {string} UUID v4-like identifier
 */
function generateId() {
  return crypto.randomUUID();
}
