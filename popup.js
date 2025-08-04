// Ensure all DOM elements are loaded
window.addEventListener('load', () => {
  console.log('[Claude Extension Popup] Window loaded, checking elements...');
  console.log('imageStatus element:', imageStatus ? 'found' : 'NOT FOUND');
  
  // Re-initialize if needed
  if (!imageStatus && document.getElementById('imageStatus')) {
    window.imageStatus = document.getElementById('imageStatus');
    console.log('[Claude Extension Popup] imageStatus re-initialized');
  }
});// Test function to manually check image status
window.testImageStatus = function(count) {
  if (imageStatus) {
    imageStatus.style.display = 'block';
    imageStatus.innerHTML = `📸 ✅ <strong>${count} image${count > 1 ? 's' : ''}</strong> successfully processed and analyzed`;
    imageStatus.style.color = '#17BF63';
    console.log(`[Claude Extension Popup] Manually set image status to ${count}`);
  }
};// Function to force refresh image status
function refreshImageStatus() {
  chrome.storage.sync.get(['lastImageCount'], (data) => {
    if (data.lastImageCount && data.lastImageCount > 0) {
      console.log(`[Claude Extension Popup] Refreshing image status: ${data.lastImageCount} images`);
      imageStatus.style.display = 'block';
      imageStatus.innerHTML = `📸 ✅ <strong>${data.lastImageCount} image${data.lastImageCount > 1 ? 's' : ''}</strong> successfully processed and analyzed`;
      imageStatus.style.color = '#17BF63';
    }
  });
}

// Make it globally available
window.refreshImageStatus = refreshImageStatus;

// Refresh on popup open
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(refreshImageStatus, 100);
});// Monitor all storage changes for debugging
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log(`[Claude Extension Popup] Storage changed in ${namespace}:`, changes);
});// Show toast notification for image status
function showImageToast(count) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #17BF63;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 500;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  toast.innerHTML = `📸 ${count} image${count > 1 ? 's' : ''} analyzed!`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}// Add a debug button to check current storage state (temporary for debugging)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'd') {
    chrome.storage.sync.get(['lastImageCount', 'lastReply', 'model'], (data) => {
      console.log('[Claude Extension Debug] Current storage:', data);
      if (data.lastImageCount) {
        alert(`Debug: ${data.lastImageCount} images in storage`);
      }
    });
  }
});// Listen for storage changes (updates from background script)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    // Update reply if changed
    if (changes.lastReply) {
      replyTextarea.value = changes.lastReply.newValue;
      copyBtn.disabled = false;
      regenerateBtn.disabled = false;
      
      // Show processing status briefly
      const processingStatus = document.getElementById('processingStatus');
      if (processingStatus) {
        processingStatus.style.display = 'none';
      }
    }
    
    // Update image status if changed
    if (changes.lastImageCount) {
      const count = changes.lastImageCount.newValue;
      if (count && count > 0) {
        imageStatus.style.display = 'block';
        const timestamp = new Date().toLocaleTimeString();
        imageStatus.innerHTML = `📸 ✅ <strong>${count} image${count > 1 ? 's' : ''}</strong> successfully processed and analyzed<br><span style="font-size: 11px; opacity: 0.8;">Updated: ${timestamp}</span>`;
        imageStatus.style.color = '#17BF63';
        
        // Add animation effect
        imageStatus.style.animation = 'none';
        setTimeout(() => {
          imageStatus.style.animation = 'fadeIn 0.5s ease-in';
        }, 10);
        
        // Show toast notification
        showImageToast(count);
      } else {
        imageStatus.style.display = 'none';
      }
    }
    
    // Update tweet context if changed
    if (changes.lastTweet || changes.lastAuthor) {
      chrome.storage.sync.get(['lastTweet', 'lastAuthor'], (data) => {
        if (data.lastTweet && data.lastAuthor) {
          tweetContext.style.display = 'block';
          tweetAuthor.textContent = data.lastAuthor;
          tweetText.textContent = data.lastTweet;
        }
      });
    }
  }
});// Popup script for Twitter Claude Reply Generator

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
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cacheStatus = document.getElementById('cacheStatus');
const tweetContext = document.getElementById('tweetContext');
const tweetAuthor = document.getElementById('tweetAuthor');
const tweetText = document.getElementById('tweetText');
const statusMessage = document.getElementById('statusMessage');
const imageStatus = document.getElementById('imageStatus');

// Make imageStatus available globally for debugging
window.imageStatus = imageStatus;

// Ensure imageStatus element exists before using it
if (!imageStatus) {
  console.error('[Claude Extension Popup] imageStatus element not found!');
}

// Load saved settings
let savedSettings = {};

// Check for unsaved changes
function checkUnsavedChanges() {
  const hasChanges = 
    apiKeyInput.value !== savedSettings.apiKey ||
    modelSelect.value !== savedSettings.model ||
    promptTextarea.value !== savedSettings.prompt;
  
  if (hasChanges) {
    saveSettingsBtn.textContent = 'Save Settings*';
    saveSettingsBtn.classList.add('btn-warning');
    saveSettingsBtn.classList.remove('btn-primary');
  } else {
    saveSettingsBtn.textContent = 'Save Settings';
    saveSettingsBtn.classList.remove('btn-warning');
    saveSettingsBtn.classList.add('btn-primary');
  }
}

chrome.storage.sync.get(['apiKey', 'model', 'prompt', 'lastReply', 'lastTweet', 'lastAuthor', 'cachedPrompt', 'cacheEnabled', 'cacheSavings', 'lastImageCount'], (data) => {
  savedSettings = {
    apiKey: data.apiKey || '',
    model: data.model || 'claude-sonnet-4-20250514',
    prompt: data.prompt || 'You are a helpful AI assistant that generates thoughtful, engaging replies to tweets. Be concise, relevant, and match the tone of the conversation.'
  };
  
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  modelSelect.value = savedSettings.model;
  promptTextarea.value = savedSettings.prompt;
  
  // Show last generated reply
  if (data.lastReply) {
    replyTextarea.value = data.lastReply;
    copyBtn.disabled = false;
    regenerateBtn.disabled = false;
    
    // Clear badge
    chrome.action.setBadgeText({ text: '' });
    
    // Force update image status
    if (data.lastImageCount && data.lastImageCount > 0) {
      console.log(`[Claude Extension Popup] Showing status for ${data.lastImageCount} images`);
    }
  }
  
  // Show tweet context
  if (data.lastTweet && data.lastAuthor) {
    tweetContext.style.display = 'block';
    tweetAuthor.textContent = data.lastAuthor;
    tweetText.textContent = data.lastTweet;
  }
  
  // Show image status if applicable
  if (data.lastImageCount && data.lastImageCount > 0) {
    imageStatus.style.display = 'block';
    imageStatus.innerHTML = `📸 ✅ <strong>${data.lastImageCount} image${data.lastImageCount > 1 ? 's' : ''}</strong> successfully processed and analyzed`;
    imageStatus.style.color = '#17BF63';
    console.log(`[Claude Extension Popup] Displaying image status for ${data.lastImageCount} images`);
  } else {
    imageStatus.style.display = 'none';
    console.log('[Claude Extension Popup] No images to display');
  }
  
  // Update cache status
  updateCacheStatus(data.cachedPrompt, data.cacheEnabled, data.cacheSavings);
  updateModelInfo();
  
    // Load repost settings
  chrome.storage.sync.get(['hideReposts', 'dimReposts'], (data) => {
    document.getElementById('hideReposts').checked = data.hideReposts || false;
    document.getElementById('dimReposts').checked = data.dimReposts !== false;
  });

  // Save repost settings
  document.getElementById('hideReposts').addEventListener('change', (e) => {
    chrome.storage.sync.set({ hideReposts: e.target.checked });
  });

  document.getElementById('dimReposts').addEventListener('change', (e) => {
    chrome.storage.sync.set({ dimReposts: e.target.checked });
  });


  // Force check image status element
  if (imageStatus && data.lastImageCount) {
    console.log(`[Claude Extension Popup] Force updating image status: ${data.lastImageCount} images`);
    // Force refresh after a short delay to ensure DOM is ready
    setTimeout(() => {
      if (data.lastImageCount > 0) {
        imageStatus.style.display = 'block';
        imageStatus.innerHTML = `📸 ✅ <strong>${data.lastImageCount} image${data.lastImageCount > 1 ? 's' : ''}</strong> successfully processed and analyzed`;
        imageStatus.style.color = '#17BF63';
      }
    }, 50);
  }
  
  // Check for unsaved changes after loading
  setTimeout(checkUnsavedChanges, 100);
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

// Save settings button
saveSettingsBtn.addEventListener('click', () => {
  const settings = {
    apiKey: apiKeyInput.value,
    model: modelSelect.value,
    prompt: promptTextarea.value
  };
  
  if (!settings.apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  chrome.storage.sync.set(settings, () => {
    savedSettings = settings;
    checkUnsavedChanges();
    showStatus('Settings saved successfully!', 'success');
  });
});

// Update model info on change
modelSelect.addEventListener('change', updateModelInfo);

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
  
  // Hide image status while regenerating
  imageStatus.style.display = 'none';
  
  try {
    // Send message to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { action: 'regenerate' }, (response) => {
      if (response && response.success) {
        replyTextarea.value = response.reply;
        showStatus('Reply regenerated!', 'success');
        
        // Save new reply
        chrome.storage.sync.set({ lastReply: response.reply });
        
        // Update image status
        chrome.storage.sync.get(['lastImageCount'], (data) => {
          if (data.lastImageCount && data.lastImageCount > 0) {
            imageStatus.style.display = 'block';
            imageStatus.innerHTML = `📸 ✅ <strong>${data.lastImageCount} image${data.lastImageCount > 1 ? 's' : ''}</strong> successfully processed and analyzed`;
            imageStatus.style.color = '#17BF63';
          }
        });
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