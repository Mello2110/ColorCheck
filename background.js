/*
 * Copyright 2026 Mellow Solutions
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ColorCheck Background Service Worker
// Handles hotkey commands, screen capture, and content script injection

// Command handler for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) return;

    let mode = command === 'toggle-eyedropper' ? 'eyedropper' : 'palette';

    if (command === 'toggle-palette') {
      try {
        const result = await chrome.storage.local.get(['activeMode']);
        if (result.activeMode === 'accent') {
          mode = 'accent';
        }
      } catch (e) {
        console.warn('Failed to read mode, defaulting to palette', e);
      }
    }

    await startColorPicker(tab.id, mode);
  } catch (error) {
    console.error('ColorCheck error:', error);
  }
});

// Main function to start color picker
async function startColorPicker(tabId, mode) {
  try {
    // Step 1: Capture visible tab as image
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    // Step 2: Inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (injectError) {
      // Script may already be injected
    }

    // Step 3: Small delay for script initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Send screenshot and mode to content script
    await chrome.tabs.sendMessage(tabId, {
      action: 'startPicker',
      mode: mode,
      screenshot: screenshotUrl
    });

  } catch (error) {
    console.error('ColorCheck picker error:', error);
  }
}

// Show a toast notification via content script
async function showNotification(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => {
          const toast = document.createElement('div');
          toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff4444;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: -apple-system, sans-serif;
            font-size: 14px;
            z-index: 2147483647;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          `;
          toast.textContent = msg;
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        },
        args: [message]
      });
    }
  } catch (e) {
    // Silent fail
  }
}

// Listen for messages from popup to start picker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startPickerFromPopup') {
    (async () => {
      try {
        // Wait for popup to fully close before taking screenshot
        await new Promise(resolve => setTimeout(resolve, 200));

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await startColorPicker(tab.id, message.mode);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      } catch (error) {
        console.error('ColorCheck picker error:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'storeColors') {
    chrome.storage.session.set({
      currentColors: message.colors,
      timestamp: Date.now()
    });
    sendResponse({ success: true });
  }

  if (message.action === 'addToHistory') {
    chrome.storage.session.get(['colorHistory'], (result) => {
      let history = result.colorHistory || [];
      history.unshift(message.color);
      history = history.slice(0, 20); // Keep only 20 recent
      chrome.storage.session.set({ colorHistory: history });
    });
    sendResponse({ success: true });
  }

  return true;
});
