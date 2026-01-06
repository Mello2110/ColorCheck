// ColorCheck Background Service Worker
// Handles hotkey commands and injects content script

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) return;

  // Skip chrome:// and other restricted URLs
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:')) {
    return;
  }

  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Send mode command to content script
    const mode = command === 'toggle-eyedropper' ? 'eyedropper' : 'palette';
    await chrome.tabs.sendMessage(tab.id, { action: 'activate', mode });
  } catch (error) {
    console.error('ColorCheck injection error:', error);
  }
});

// Listen for color data from content script to store for popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'storeColors') {
    // Store colors in session storage for popup access
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
      history = history.slice(0, 10); // Keep only 10 recent
      chrome.storage.session.set({ colorHistory: history });
    });
    sendResponse({ success: true });
  }

  return true; // Keep channel open for async response
});
