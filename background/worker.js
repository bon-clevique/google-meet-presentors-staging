/**
 * @file Service Worker for Meet Presenter Switch Chrome Extension (MV3)
 *
 * Handles tab preloading, presenter switching orchestration,
 * and session persistence via chrome.storage.local.
 */

/* Message type constants (redefined — importScripts unavailable in MV3 SW) */
const MSG = Object.freeze({
  PRELOAD_TAB: 'PRELOAD_TAB',
  SWITCH_PRESENTER: 'SWITCH_PRESENTER',
  GET_SESSION: 'GET_SESSION',
  SAVE_SESSION: 'SAVE_SESSION',
  STOP_SHARING: 'STOP_SHARING',
  START_SHARING: 'START_SHARING',
  PANEL_UPDATE: 'PANEL_UPDATE',
});

const PRELOAD_TIMEOUT_MS = 15_000;
const SWITCH_DELAY_MS = 800;
const MAX_SESSIONS = 30;

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

/**
 * Load a session from storage.
 * @param {string} meetCode
 * @returns {Promise<SessionConfig|null>}
 */
async function loadSession(meetCode) {
  const key = `session:${meetCode}`;
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

/**
 * Save a session to storage with an updated timestamp.
 * Returns the saved session (immutable — does not mutate the input).
 * @param {SessionConfig} session
 * @returns {Promise<SessionConfig>}
 */
async function saveSession(session) {
  const key = `session:${session.meetCode}`;
  const updated = { ...session, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [key]: updated });
  return updated;
}

/**
 * Update a specific presenter entry's preload status and tabId in storage.
 * @param {string} meetCode
 * @param {string} entryId - Presenter entry ID
 * @param {Object} updates - Fields to update (preloadStatus, tabId)
 * @returns {Promise<SessionConfig|null>}
 */
async function updatePresenterInSession(meetCode, entryId, updates) {
  const session = await loadSession(meetCode);
  if (!session) return null;

  const updatedPresenters = session.presenters.map((p) =>
    p.id === entryId ? { ...p, ...updates } : p
  );

  const updatedSession = {
    ...session,
    presenters: updatedPresenters,
    updatedAt: new Date().toISOString(),
  };

  const key = `session:${meetCode}`;
  await chrome.storage.local.set({ [key]: updatedSession });
  return updatedSession;
}

/**
 * Prune old sessions so the total count stays within MAX_SESSIONS.
 * Removes the oldest by updatedAt (LRU eviction).
 * @returns {Promise<void>}
 */
async function pruneOldSessions() {
  const all = await chrome.storage.local.get(null);
  const sessionEntries = Object.entries(all)
    .filter(([k]) => k.startsWith('session:'));

  if (sessionEntries.length <= MAX_SESSIONS) return;

  sessionEntries.sort(
    ([, a], [, b]) => new Date(a.updatedAt) - new Date(b.updatedAt),
  );

  const removeCount = sessionEntries.length - MAX_SESSIONS;
  const keysToRemove = sessionEntries
    .slice(0, removeCount)
    .map(([k]) => k);

  await chrome.storage.local.remove(keysToRemove);
}

// ---------------------------------------------------------------------------
// Tab helpers
// ---------------------------------------------------------------------------

/**
 * Find an open Google Meet tab.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function findMeetTab() {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  return tabs[0] ?? null;
}

/**
 * Convert a Google Slides URL to its slideshow (present) URL.
 * @param {string} url
 * @returns {string}
 */
function toSlideshowUrl(url) {
  try {
    const parsed = new URL(url);
    const basePath = parsed.pathname.replace(/\/(edit|pub|present)(\/.*)?$/, '');
    parsed.pathname = `${basePath}/present`;
    parsed.search = '?rm=minimal&start=true';
    return parsed.toString();
  } catch {
    const base = url.split('?')[0].replace(/\/+$/, '');
    return `${base}/present?rm=minimal&start=true`;
  }
}

/**
 * Preload a tab for a presenter entry.
 * @param {PresenterEntry} entry
 * @returns {Promise<{tabId: number}>}
 */
function preloadTab(entry) {
  return new Promise((resolve, reject) => {
    const targetUrl = entry.type === 'slides'
      ? toSlideshowUrl(entry.url)
      : entry.url;

    chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const tabId = tab.id;
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('Preload timed out'));
      }, PRELOAD_TIMEOUT_MS);

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve({ tabId });
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

// ---------------------------------------------------------------------------
// Presenter switching orchestration
// ---------------------------------------------------------------------------

/**
 * Orchestrate a presenter switch.
 * @param {SessionConfig} session
 * @param {number} targetIndex
 * @returns {Promise<SessionConfig>} updated session
 */
async function switchPresenter(session, targetIndex) {
  const meetTab = await findMeetTab();
  if (!meetTab) throw new Error('No Meet tab found');

  const targetEntry = session.presenters[targetIndex];
  if (!targetEntry) throw new Error(`Invalid target index: ${targetIndex}`);
  if (!targetEntry.tabId) throw new Error('Target tab not preloaded');

  // 1. Stop current sharing via content script
  await chrome.tabs.sendMessage(meetTab.id, { type: MSG.STOP_SHARING });

  // 2. Wait for Meet to process the stop
  await new Promise((r) => setTimeout(r, SWITCH_DELAY_MS));

  // 3. Activate the target tab
  await chrome.tabs.update(targetEntry.tabId, { active: true });

  // 4. Update and persist session (immutable)
  const updatedSession = await saveSession({
    ...session,
    currentIndex: targetIndex,
  });

  // 5. Notify content script of updated session
  await chrome.tabs.sendMessage(meetTab.id, {
    type: MSG.PANEL_UPDATE,
    payload: { session: updatedSession },
  });

  // 6. Preload next presenter if available
  const nextIndex = targetIndex + 1;
  if (nextIndex < updatedSession.presenters.length) {
    const nextEntry = updatedSession.presenters[nextIndex];
    if (nextEntry.preloadStatus === 'idle') {
      preloadAndUpdateSession(nextEntry, updatedSession.meetCode);
    }
  }

  return updatedSession;
}

/**
 * Preload a tab and update the session in storage with the result.
 * @param {PresenterEntry} entry
 * @param {string} meetCode
 */
async function preloadAndUpdateSession(entry, meetCode) {
  // Update status to loading
  await updatePresenterInSession(meetCode, entry.id, {
    preloadStatus: 'loading',
  });

  // Notify content script
  const meetTab = await findMeetTab();

  try {
    const result = await preloadTab(entry);
    const updatedSession = await updatePresenterInSession(meetCode, entry.id, {
      preloadStatus: 'ready',
      tabId: result.tabId,
    });

    if (meetTab && updatedSession) {
      await chrome.tabs.sendMessage(meetTab.id, {
        type: MSG.PANEL_UPDATE,
        payload: { session: updatedSession },
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[worker] Preload failed:', err);
    const updatedSession = await updatePresenterInSession(meetCode, entry.id, {
      preloadStatus: 'error',
      tabId: null,
    });

    if (meetTab && updatedSession) {
      await chrome.tabs.sendMessage(meetTab.id, {
        type: MSG.PANEL_UPDATE,
        payload: { session: updatedSession },
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Tab removal listener
// ---------------------------------------------------------------------------

chrome.tabs.onRemoved.addListener(async (closedTabId) => {
  try {
    const all = await chrome.storage.local.get(null);
    const sessionEntries = Object.entries(all)
      .filter(([k]) => k.startsWith('session:'));

    for (const [key, session] of sessionEntries) {
      const updatedPresenters = session.presenters.map((entry) =>
        entry.tabId === closedTabId
          ? { ...entry, tabId: null, preloadStatus: 'idle' }
          : entry
      );

      const hasChanges = updatedPresenters.some(
        (p, i) => p !== session.presenters[i]
      );

      if (hasChanges) {
        const updatedSession = {
          ...session,
          presenters: updatedPresenters,
          updatedAt: new Date().toISOString(),
        };
        await chrome.storage.local.set({ [key]: updatedSession });
      }
    }
  } catch (err) {
    console.error('[worker] tabs.onRemoved handler error:', err);
  }
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message;

  (async () => {
    try {
      switch (type) {
        case MSG.PRELOAD_TAB: {
          const entry = payload.entry;
          // Find the meet code from open sessions that contain this entry
          const all = await chrome.storage.local.get(null);
          const sessionEntry = Object.entries(all)
            .filter(([k]) => k.startsWith('session:'))
            .find(([, s]) => s.presenters.some((p) => p.id === entry.id));

          if (sessionEntry) {
            const meetCode = sessionEntry[1].meetCode;
            preloadAndUpdateSession(entry, meetCode);
            sendResponse({ success: true, data: { started: true } });
          } else {
            // No session found — just preload without storage update
            const result = await preloadTab(entry);
            sendResponse({ success: true, data: result });
          }
          break;
        }

        case MSG.SWITCH_PRESENTER: {
          const updatedSession = await switchPresenter(
            payload.session,
            payload.targetIndex,
          );
          sendResponse({ success: true, data: { session: updatedSession } });
          break;
        }

        case MSG.GET_SESSION: {
          const session = await loadSession(payload.meetCode);
          sendResponse({ success: true, data: session });
          break;
        }

        case MSG.SAVE_SESSION: {
          const saved = await saveSession(payload.session);
          await pruneOldSessions();
          sendResponse({ success: true, data: { ok: true } });

          // Preload first presenter if available
          if (saved.presenters.length > 0) {
            const first = saved.presenters[0];
            if (first.preloadStatus === 'idle') {
              preloadAndUpdateSession(first, saved.meetCode);
            }
          }
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown message type: ${type}` });
      }
    } catch (err) {
      console.error(`[worker] Error handling ${type}:`, err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true;
});
