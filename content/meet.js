/**
 * @file Content script for Google Meet pages.
 * Handles presenter switching, screen sharing control, and session management.
 * Loaded after shared/types.js and content/floating-ui.js.
 */

/** @type {SessionConfig|null} */
let currentSession = null;

/**
 * Extract the meet code from the current page URL.
 * @returns {string|null} Meet code or null if not found
 */
function extractMeetCode() {
  const match = window.location.href.match(
    /meet\.google\.com\/([a-z0-9-]+)/
  );
  return match ? match[1] : null;
}

/**
 * Stop the current Meet screen sharing.
 * Uses a 3-stage fallback DOM query to find the stop button.
 * @returns {Promise<void>}
 */
function stopSharing() {
  const selectors = [
    '[data-tooltip*="発表を停止"]',
    '[aria-label*="Stop presenting"]',
    '[aria-label*="発表を停止"]',
  ];

  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.click();
      return new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  return Promise.resolve();
}

/**
 * Start sharing a tab using getDisplayMedia.
 * CRITICAL: Must be called IMMEDIATELY from the click handler
 * to preserve the user gesture token. Any async boundary before
 * this call will cause NotAllowedError.
 * @returns {Promise<MediaStream>}
 */
function startSharingTab() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: false,
  });
}

/**
 * Send a message to the background service worker.
 * @param {Object} message
 * @returns {Promise<Object>}
 */
function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && !response.success) {
        reject(new Error(response.error || 'Unknown error'));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Initialize the content script on a Meet page.
 */
function initMeetContentScript() {
  const meetCode = extractMeetCode();
  if (!meetCode) {
    return;
  }

  injectFloatingPanel();
  loadAndDisplaySession(meetCode);

  // Button is created synchronously by injectFloatingPanel,
  // so it exists immediately — no polling needed.
  const switchBtn = document.getElementById('mps-switch-btn');
  if (switchBtn) {
    setupSwitchButton(switchBtn, meetCode);
  }
}

/**
 * Load session from storage and update the panel.
 * @param {string} meetCode
 */
function loadAndDisplaySession(meetCode) {
  const key = `session:${meetCode}`;
  chrome.storage.local.get(key, (result) => {
    if (chrome.runtime.lastError) {
      return;
    }
    const session = result[key];
    if (session) {
      currentSession = session;
      updatePanelState(session);
    }
  });
}

/**
 * Set up the switch button click handler.
 * CRITICAL: getDisplayMedia() MUST be the FIRST async call in the handler
 * to preserve the user gesture token. Chrome consumes the gesture after
 * the first async boundary.
 * @param {HTMLElement} switchBtn - The switch button element
 * @param {string} meetCode - Current meet code
 */
function setupSwitchButton(switchBtn, meetCode) {
  switchBtn.addEventListener('click', function onSwitchClick() {
    if (!currentSession) {
      showError('セッションが読み込まれていません');
      return;
    }

    const nextIndex = currentSession.currentIndex + 1;
    if (nextIndex >= currentSession.presenters.length) {
      showError('次の発表者がいません');
      return;
    }

    switchBtn.disabled = true;

    // CRITICAL: Call getDisplayMedia IMMEDIATELY to capture user gesture.
    // The browser dialog appears now; user picks the tab to share.
    const streamPromise = startSharingTab();

    // While user is in the dialog, orchestrate the switch in parallel
    stopSharing()
      .then(() => {
        return sendToBackground({
          type: MSG.SWITCH_PRESENTER,
          payload: {
            session: currentSession,
            targetIndex: nextIndex,
          },
        });
      })
      .then((response) => {
        if (response && response.data && response.data.session) {
          currentSession = response.data.session;
          updatePanelState(currentSession);
        }
      })
      .catch((err) => {
        showError(err.message || '切り替えに失敗しました');
      });

    // Await the stream from getDisplayMedia
    streamPromise
      .catch((err) => {
        showError(err.message || '画面共有が拒否されました');
        switchBtn.disabled = false;
      });
  });
}

/**
 * Display an error message in the panel.
 * @param {string} message - Error message to display
 */
function showError(message) {
  const body = document.querySelector('#mps-floating-panel .mps-body');
  if (!body) {
    return;
  }

  const existing = body.querySelector('.mps-error');
  if (existing) {
    existing.remove();
  }

  const errorEl = document.createElement('div');
  errorEl.className = 'mps-error';
  errorEl.textContent = message;
  body.appendChild(errorEl);

  setTimeout(() => {
    if (errorEl.parentNode) {
      errorEl.remove();
    }
  }, 5000);
}

/**
 * Listen for messages from background script.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { type, payload } = msg;

  switch (type) {
    case MSG.PANEL_UPDATE:
      if (payload && payload.session) {
        currentSession = payload.session;
        updatePanelState(payload.session);
      }
      sendResponse({ ok: true });
      return true;

    case MSG.STOP_SHARING:
      stopSharing()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
      return true;
  }
});

// Initialize when the script loads
initMeetContentScript();
