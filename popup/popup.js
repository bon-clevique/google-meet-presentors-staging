/**
 * @file Popup UI logic for Meet Presenter Switch Chrome Extension.
 */

/** @type {PresenterEntry[]} */
let presenters = [];

/** @type {string} */
let meetCode = '';

/** @type {number|null} */
let dragSourceIndex = null;

const elements = {
  meetCodeEl: () => document.getElementById('meet-code'),
  nameInput: () => document.getElementById('presenter-name'),
  urlInput: () => document.getElementById('presenter-url'),
  typeSelect: () => document.getElementById('presenter-type'),
  addBtn: () => document.getElementById('add-btn'),
  presenterList: () => document.getElementById('presenter-list'),
  saveBtn: () => document.getElementById('save-btn'),
  statusMsg: () => document.getElementById('status-msg'),
};

/**
 * Extract Meet code from a Google Meet URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractMeetCode(url) {
  const match = url.match(/meet\.google\.com\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Detect content type from URL.
 * @param {string} url
 * @returns {'slides'|'tab'}
 */
function detectContentType(url) {
  if (/docs\.google\.com\/presentation/.test(url)) {
    return 'slides';
  }
  return 'tab';
}

/**
 * Validate that a URL is safe to open (http/https only).
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Update save button disabled state based on presenter count.
 */
function updateSaveButton() {
  elements.saveBtn().disabled = presenters.length === 0;
}

/**
 * Show a temporary status message.
 * @param {string} message
 * @param {number} duration - Duration in milliseconds
 */
function showStatus(message, duration = 2000) {
  const statusMsg = elements.statusMsg();
  statusMsg.textContent = message;
  setTimeout(() => {
    statusMsg.textContent = '';
  }, duration);
}

/**
 * Render the presenter list to the DOM.
 */
function renderPresenterList() {
  const listEl = elements.presenterList();
  listEl.innerHTML = '';

  presenters.forEach((presenter, index) => {
    const item = document.createElement('div');
    item.className = 'presenter-item';
    item.draggable = true;
    item.dataset.index = index;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '\u28FF';

    const info = document.createElement('div');
    info.className = 'item-info';

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = presenter.name;

    const url = document.createElement('div');
    url.className = 'item-url';
    url.textContent = presenter.url;
    url.title = presenter.url;

    const type = document.createElement('span');
    type.className = 'item-type';
    type.textContent = presenter.type === 'slides' ? 'Slides' : 'Tab';

    info.appendChild(name);
    info.appendChild(url);
    info.appendChild(type);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '\u00D7';
    deleteBtn.addEventListener('click', () => {
      presenters = presenters.filter((_, i) => i !== index);
      renderPresenterList();
    });

    item.appendChild(dragHandle);
    item.appendChild(info);
    item.appendChild(deleteBtn);

    item.addEventListener('dragstart', (e) => {
      dragSourceIndex = index;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');

      if (dragSourceIndex === null || dragSourceIndex === index) {
        return;
      }

      // Immutable reorder
      const newPresenters = [...presenters];
      const [moved] = newPresenters.splice(dragSourceIndex, 1);
      newPresenters.splice(index, 0, moved);
      presenters = newPresenters;
      dragSourceIndex = null;
      renderPresenterList();
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragSourceIndex = null;
    });

    listEl.appendChild(item);
  });

  updateSaveButton();
}

/**
 * Add a new presenter entry from input fields.
 */
function addPresenter() {
  const nameInput = elements.nameInput();
  const urlInput = elements.urlInput();
  const typeSelect = elements.typeSelect();

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const type = typeSelect.value;

  if (!name || !url) {
    showStatus('発表者名と資料URLは必須です');
    if (!name) nameInput.style.borderColor = '#ea4335';
    if (!url) urlInput.style.borderColor = '#ea4335';
    return;
  }

  if (!isAllowedUrl(url)) {
    showStatus('URLはhttp://またはhttps://で始まる必要があります');
    urlInput.style.borderColor = '#ea4335';
    return;
  }

  const entry = {
    id: generateId(),
    name,
    url,
    type,
    preloadStatus: 'idle',
    tabId: null,
  };

  presenters = [...presenters, entry];
  renderPresenterList();

  nameInput.value = '';
  urlInput.value = '';
  typeSelect.value = 'tab';
  nameInput.style.borderColor = '';
  urlInput.style.borderColor = '';

  updateSaveButton();
}

/**
 * Save the current session to the background script.
 */
function saveSession() {
  if (!meetCode) {
    showStatus('Meet に接続してください');
    return;
  }

  const session = {
    meetCode,
    presenters,
    currentIndex: 0,
    updatedAt: new Date().toISOString(),
  };

  chrome.runtime.sendMessage(
    { type: MSG.SAVE_SESSION, payload: { session } },
    (response) => {
      if (chrome.runtime.lastError) {
        showStatus('保存に失敗しました: ' + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        showStatus('保存しました');
      } else {
        showStatus('保存に失敗しました');
      }
    }
  );
}

/**
 * Initialize popup on DOM content loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.url) {
      const code = extractMeetCode(tab.url);
      if (code) {
        meetCode = code;
        elements.meetCodeEl().textContent = code;

        chrome.runtime.sendMessage(
          { type: MSG.GET_SESSION, payload: { meetCode: code } },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('GET_SESSION error:', chrome.runtime.lastError.message);
              return;
            }
            if (response && response.success && response.data) {
              presenters = response.data.presenters || [];
              renderPresenterList();
            }
          }
        );
      }
    }
  });

  elements.addBtn().addEventListener('click', addPresenter);
  elements.saveBtn().addEventListener('click', saveSession);

  elements.urlInput().addEventListener('blur', () => {
    const url = elements.urlInput().value.trim();
    if (url) {
      elements.typeSelect().value = detectContentType(url);
    }
  });

  elements.urlInput().addEventListener('change', () => {
    const url = elements.urlInput().value.trim();
    if (url) {
      elements.typeSelect().value = detectContentType(url);
    }
  });

  elements.nameInput().addEventListener('input', () => {
    elements.nameInput().style.borderColor = '';
  });

  elements.urlInput().addEventListener('input', () => {
    elements.urlInput().style.borderColor = '';
  });
});
