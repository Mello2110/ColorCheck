// ColorCheck Background Service Worker
// Handles hotkey commands, screen capture, and content script injection

// Command handler for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[ColorCheck] Command received:', command);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[ColorCheck] Active tab:', tab?.url);

    if (!tab || !tab.id) {
      console.error('[ColorCheck] No active tab');
      return;
    }

    const mode = command === 'toggle-eyedropper' ? 'eyedropper' : 'palette';

    await startColorPicker(tab.id, mode);
  } catch (error) {
    console.error('[ColorCheck] Command error:', error);
    showNotification('ColorCheck error: ' + error.message);
  }
});

// Main function to start color picker
async function startColorPicker(tabId, mode) {
  console.log('[ColorCheck] Starting picker, tabId:', tabId, 'mode:', mode);

  try {
    // Step 1: Capture visible tab as image
    console.log('[ColorCheck] Capturing screenshot...');
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });
    console.log('[ColorCheck] Screenshot captured, length:', screenshotUrl?.length);

    // Step 2: Inject content script
    console.log('[ColorCheck] Injecting content script...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log('[ColorCheck] Content script injected');
    } catch (injectError) {
      console.log('[ColorCheck] Content script may already be injected:', injectError.message);
    }

    // Step 3: Small delay for script initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Send screenshot and mode to content script
    console.log('[ColorCheck] Sending message to content script...');
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'startPicker',
      mode: mode,
      screenshot: screenshotUrl
    });
    console.log('[ColorCheck] Content script response:', response);

  } catch (error) {
    console.error('[ColorCheck] startColorPicker error:', error);
    throw error;
  }
}

// Show a toast notification via content script
async function showNotification(message) {
  console.log('[ColorCheck] Showing notification:', message);
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
    console.error('[ColorCheck] Cannot show notification:', e);
  }
}

// Listen for messages from popup to start picker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ColorCheck] Message received:', message.action);

  if (message.action === 'startPickerFromPopup') {
    (async () => {
      try {
        // Wait for popup to fully close before taking screenshot
        await new Promise(resolve => setTimeout(resolve, 200));

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('[ColorCheck] Tab for popup trigger:', tab?.url);

        if (tab && tab.id) {
          await startColorPicker(tab.id, message.mode);
          sendResponse({ success: true });
        } else {
          console.error('[ColorCheck] No active tab for popup trigger');
          sendResponse({ success: false, error: 'No active tab' });
        }
      } catch (error) {
        console.error('[ColorCheck] Picker error:', error);
        showNotification('Error: ' + error.message);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
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
      history = history.slice(0, 10);
      chrome.storage.session.set({ colorHistory: history });
    });
    sendResponse({ success: true });
  }

  return true;
});

// Log when service worker starts
console.log('[ColorCheck] Background service worker started');
