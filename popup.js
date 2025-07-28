// Popup script for Twitter Claude Reply Generator

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const modelInfo = document.getElementById('modelInfo');
const promptTextarea = document.getElementById('prompt');
const replyTextarea = document.getElementById('replyText');
const copyBtn = document.getElementById('copyBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const cachePromptBtn = document.getElementById('cachePromptBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const cacheStatus = document.getElementById('cacheStatus');
const tweetContext = document.getElementById('tweetContext');
const tweetAuthor = document.getElementById('tweetAuthor');
const tweetText = document.getElementById('tweetText');
const statusMessage = document.getElementById('statusMessage');
const saveButton = document.getElementById('saveSettings');

// Load saved settings
chrome.storage.sync.get(['apiKey', 'model', 'prompt', 'lastReply', 'lastTweet', 'lastAuthor', 'cachedPrompt', 'cacheEnabled', 'cacheSavings'], (data) => {
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  if (data.model) modelSelect.value = data.model;
  if (data.prompt) promptTextarea.value = data.prompt;
  
  // Show last generated reply
  if (data.lastReply) {
    replyTextarea.value = data.lastReply;
    copyBtn.disabled = false;
    regenerateBtn.disabled = false;
    
    // Clear badge
    chrome.action.setBadgeText({ text: '' });
  }
  
  // Show tweet context
  if (data.lastTweet && data.lastAuthor) {
    tweetContext.style.display = 'block';
    tweetAuthor.textContent = data.lastAuthor;
    tweetText.textContent = data.lastTweet;
  }
  
  // Update cache status
  updateCacheStatus(data.cachedPrompt, data.cacheEnabled, data.cacheSavings);
  updateModelInfo();
});

// Update model info
function updateModelInfo() {
  const model = modelSelect.value;
  if (model.includes('haiku')) {
    modelInfo.textContent = 'Fast responses, text only';
    modelInfo.style.color = '#ff9800';
  } else if (model.includes('sonnet')) {
    modelInfo.textContent = 'Supports text and images';
    modelInfo.style.color = '#17BF63';
  }
}

// Update cache status
function updateCacheStatus(cachedPrompt, enabled, savings) {
  if (enabled && cachedPrompt) {
    cacheStatus.className = 'cache-status active';
    if (savings) {
      cacheStatus.textContent = `Cache active - ${savings}% cost savings`;
    } else {
      cacheStatus.textContent = 'Cache active - ready for use';
    }
  } else {
    cacheStatus.className = 'cache-status inactive';
    cacheStatus.textContent = 'Cache inactive';
  }
}

// Show status message
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('statusMessage');
  if (!statusDiv) {
    console.error('Status message element not found');
    return;
  }
  
  statusDiv.textContent = message;
  statusDiv.className = `status-message status-${type}`;
  statusDiv.style.display = 'block';
  
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

// Save settings on change
apiKeyInput.addEventListener('change', () => {
  chrome.storage.sync.set({ apiKey: apiKeyInput.value });
});

modelSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ model: modelSelect.value });
  updateModelInfo();
});

promptTextarea.addEventListener('change', () => {
  chrome.storage.sync.set({ prompt: promptTextarea.value });
});

// Save settings
saveButton.addEventListener('click', function() {
    try {
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value;
        const prompt = promptTextarea.value.trim();

        if (!apiKey) {
            showStatus('Please enter your Anthropic API key', 'error');
            return;
        }

        chrome.storage.sync.set({
            apiKey: apiKey,
            model: model,
            prompt: prompt
        }, function() {
            if (chrome.runtime.lastError) {
                console.error('Error saving settings:', chrome.runtime.lastError);
                showStatus('Error saving settings', 'error');
                return;
            }
            showStatus('Settings saved successfully!', 'success');
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatus('Error saving settings', 'error');
    }
});

// Copy reply to clipboard
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(replyTextarea.value);
    showStatus('Reply copied to clipboard!', 'success');
  } catch (error) {
    showStatus('Failed to copy reply', 'error');
  }
});

// Regenerate reply
regenerateBtn.addEventListener('click', async () => {
  regenerateBtn.disabled = true;
  regenerateBtn.textContent = 'Regenerating...';
  
  try {
    // Send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { action: 'regenerate' }, (response) => {
      if (response && response.success) {
        replyTextarea.value = response.reply;
        showStatus('Reply regenerated!', 'success');
        
        // Save new reply
        chrome.storage.sync.set({ lastReply: response.reply });
      } else {
        showStatus(response?.error || 'Failed to regenerate', 'error');
      }
      
      regenerateBtn.disabled = false;
      regenerateBtn.textContent = 'Regenerate';
    });
  } catch (error) {
    showStatus('Failed to regenerate', 'error');
    regenerateBtn.disabled = false;
    regenerateBtn.textContent = 'Regenerate';
  }
});

// Cache prompt
cachePromptBtn.addEventListener('click', () => {
  const currentPrompt = promptTextarea.value;
  chrome.storage.sync.set({ 
    cachedPrompt: currentPrompt,
    cacheEnabled: true,
    cacheSavings: null
  }, () => {
    showStatus('Prompt cached successfully!', 'success');
    updateCacheStatus(currentPrompt, true, null);
  });
});

// Clear cache
clearCacheBtn.addEventListener('click', () => {
  chrome.storage.sync.set({ 
    cachedPrompt: null,
    cacheEnabled: false,
    cacheSavings: null
  }, () => {
    showStatus('Cache cleared', 'info');
    updateCacheStatus(null, false, null);
  });
});