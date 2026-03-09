/**
 * @file Floating panel UI for Google Meet page.
 * Provides presenter switch controls overlaid on the Meet interface.
 */

/**
 * Create and inject the floating panel into the Meet page.
 */
function injectFloatingPanel() {
  if (document.getElementById('mps-floating-panel')) {
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'mps-floating-panel';

  panel.innerHTML = `
    <div class="mps-header">
      <span class="mps-title">Presenter Switch</span>
      <button class="mps-minimize">\u2212</button>
    </div>
    <div class="mps-body">
      <div class="mps-current">\u73FE\u5728: <strong id="mps-current-name">\u2014</strong></div>
      <div class="mps-next">\u6B21: <span id="mps-next-name">\u2014</span></div>
      <button id="mps-switch-btn" class="mps-btn-primary">\u25B6 \u6B21\u306E\u767A\u8868\u8005\u3078\u5207\u308A\u66FF\u3048</button>
      <div id="mps-presenter-list"></div>
    </div>
  `;

  document.body.appendChild(panel);
  makeDraggable(panel);

  const minimizeBtn = panel.querySelector('.mps-minimize');
  const body = panel.querySelector('.mps-body');

  minimizeBtn.addEventListener('click', () => {
    const isCollapsed = body.style.display === 'none';
    if (isCollapsed) {
      body.style.display = '';
      minimizeBtn.textContent = '\u2212';
    } else {
      body.style.display = 'none';
      minimizeBtn.textContent = '+';
    }
  });
}

/**
 * Enable drag-and-drop movement for the panel.
 * Only initiates drag from the header area.
 * @param {HTMLElement} panel - The floating panel element
 */
function makeDraggable(panel) {
  const header = panel.querySelector('.mps-header');
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('mps-minimize')) {
      return;
    }
    isDragging = true;
    offsetX = e.clientX - panel.getBoundingClientRect().left;
    offsetY = e.clientY - panel.getBoundingClientRect().top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) {
      return;
    }

    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
    }
  });
}

/**
 * Update panel display from session data.
 * @param {SessionConfig} session - Current session configuration
 */
function updatePanelState(session) {
  const currentNameEl = document.getElementById('mps-current-name');
  const nextNameEl = document.getElementById('mps-next-name');
  const switchBtn = document.getElementById('mps-switch-btn');
  const listEl = document.getElementById('mps-presenter-list');

  if (!currentNameEl || !nextNameEl || !switchBtn || !listEl) {
    return;
  }

  const { presenters, currentIndex } = session;
  const currentPresenter = presenters[currentIndex];
  const nextPresenter = currentIndex < presenters.length - 1
    ? presenters[currentIndex + 1]
    : null;

  currentNameEl.textContent = currentPresenter
    ? currentPresenter.name
    : '\u2014';

  nextNameEl.textContent = nextPresenter
    ? nextPresenter.name
    : '\u2014';

  const isNextReady = nextPresenter && nextPresenter.preloadStatus === 'ready';
  switchBtn.disabled = !nextPresenter || !isNextReady;

  listEl.innerHTML = '';
  presenters.forEach((presenter, index) => {
    const item = document.createElement('div');
    item.className = 'mps-presenter-item';
    if (index === currentIndex) {
      item.classList.add('active');
    }

    const statusIcon = document.createElement('span');
    statusIcon.className = 'mps-status-icon';
    statusIcon.textContent = getStatusIcon(presenter.preloadStatus);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'mps-presenter-name';
    nameSpan.textContent = presenter.name;

    item.appendChild(statusIcon);
    item.appendChild(nameSpan);

    if (presenter.preloadStatus === 'error') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'mps-retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: MSG.PRELOAD_TAB,
          payload: { entry: presenter },
        });
      });
      item.appendChild(retryBtn);
    }

    listEl.appendChild(item);
  });
}

/**
 * Get status icon character for a preload status.
 * @param {'idle'|'loading'|'ready'|'error'} status
 * @returns {string} Status emoji
 */
function getStatusIcon(status) {
  switch (status) {
    case 'ready': return '\u2705';
    case 'loading': return '\u231B';
    case 'error': return '\u274C';
    default: return '\u26AA';
  }
}

/**
 * Remove the floating panel from the DOM if it exists.
 */
function removeFloatingPanel() {
  const panel = document.getElementById('mps-floating-panel');
  if (panel) {
    panel.remove();
  }
}
