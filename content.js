// Content script for Twitter Claude Reply Generator

let isGenerating = false;
let lastGeneratedTweet = null;

// Helper function to extract text from tweet element
function extractTweetText(tweetElement) {
  const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
  return textElement ? textElement.innerText : '';
}

// Helper function to extract author from tweet
function extractTweetAuthor(tweetElement) {
  const authorElement = tweetElement.querySelector('[data-testid="User-Name"] a');
  return authorElement ? authorElement.innerText.split('@')[1] : 'unknown';
}

// Helper function to extract images from tweet
async function extractTweetImages(tweetElement) {
  const images = [];
  const imageElements = tweetElement.querySelectorAll('img[src*="pbs.twimg.com/media"]');
  
  for (let i = 0; i < Math.min(imageElements.length, 3); i++) {
    try {
      const imgUrl = imageElements[i].src;
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      const mediaType = blob.type || 'image/jpeg';
      images.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64.split(',')[1] } });
    } catch (error) {
      console.error('Error processing image:', error);
    }
  }
  
  return images;
}

// Helper function to convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper function to extract quoted tweet
function extractQuotedTweet(tweetElement) {
  // Look for quoted tweet container
  const quotedTweetContainer = tweetElement.querySelector('[data-testid="quoteTweet"]');
  if (!quotedTweetContainer) return null;
  
  // Extract author
  const quotedAuthorElement = quotedTweetContainer.querySelector('[data-testid="User-Name"] a');
  const quotedAuthor = quotedAuthorElement ? quotedAuthorElement.innerText.split('@')[1] : 'unknown';
  
  // Extract text
  const quotedTextElement = quotedTweetContainer.querySelector('[data-testid="tweetText"]');
  const quotedText = quotedTextElement ? quotedTextElement.innerText : '';
  
  return quotedAuthor && quotedText ? `@${quotedAuthor}: ${quotedText}` : null;
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `claude-notification claude-notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('claude-notification-fade');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Generate reply using Claude API
async function generateReply(tweetText, tweetAuthor, quotedTweet, images = []) {
  const settings = await chrome.storage.sync.get(['apiKey', 'model', 'prompt']);
  
  if (!settings.apiKey) {
    showNotification('Please set your Anthropic API key in the extension popup', 'error');
    return null;
  }
  
  const model = settings.model || 'claude-sonnet-4-20250514';
  const customPrompt = settings.prompt || 'You are a helpful AI assistant that generates thoughtful, engaging replies to tweets.';
  
  // Check if model supports images
  const supportsImages = model.includes('sonnet');
  const hasImages = images.length > 0;
  
  if (hasImages && !supportsImages) {
    showNotification('Selected model does not support images. Switching to text-only mode.', 'warning');
    images = [];
  }
  
  try {
    // Send request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'generateReply',
      data: {
        tweetText,
        tweetAuthor,
        quotedTweet,
        images: hasImages && supportsImages ? images : [],
        apiKey: settings.apiKey,
        model: model,
        prompt: customPrompt
      }
    });
    
    if (response.success) {
      // Update badge
      chrome.runtime.sendMessage({ action: 'updateBadge' });
      return response.reply;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('Error generating reply:', error);
    
    if (error.message.includes('401')) {
      showNotification('Invalid API key. Please check your settings.', 'error');
    } else if (error.message.includes('429')) {
      showNotification('Rate limit exceeded. Please try again later.', 'error');
    } else if (error.message.includes('400')) {
      showNotification('Invalid request. Please check your prompt and try again.', 'error');
    } else {
      showNotification(`Error: ${error.message}`, 'error');
    }
    
    return null;
  }
}

// Add generate button to tweet
function addGenerateButton(article) {
  // Skip if button already exists
  if (article.querySelector('.claude-generate-btn')) return;
  
  // Find the action bar
  const actionBar = article.querySelector('[role="group"]');
  if (!actionBar) return;
  
  // Check if tweet has images
  const hasImages = article.querySelectorAll('img[src*="pbs.twimg.com/media"]').length > 0;
  
  // Create button
  const button = document.createElement('button');
  button.className = 'claude-generate-btn';
  button.innerHTML = hasImages ? '📸' : '🤖';
  button.title = 'Generate reply with Claude';
  
  // Handle click
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isGenerating) return;
    
    isGenerating = true;
    const originalEmoji = button.innerHTML;
    button.innerHTML = '⏳';
    button.classList.add('generating');
    
    try {
      const tweetText = extractTweetText(article);
      const tweetAuthor = extractTweetAuthor(article);
      const quotedTweet = extractQuotedTweet(article);
      const images = hasImages ? await extractTweetImages(article) : [];
      
      lastGeneratedTweet = { text: tweetText, author: tweetAuthor, quotedTweet, images };
      
      const reply = await generateReply(tweetText, tweetAuthor, quotedTweet, images);
      
      if (reply) {
        showNotification('Reply generated! Check the extension popup.', 'success');
      }
    } catch (error) {
      console.error('Claude Twitter Extension: Error:', error);
      showNotification('Failed to generate reply. Please try again.', 'error');
    } finally {
      isGenerating = false;
      button.innerHTML = originalEmoji;
      button.classList.remove('generating');
    }
  });
  
  // Insert button
  actionBar.appendChild(button);
}

// Observe DOM changes
const observer = new MutationObserver((mutations) => {
  // Find all tweet articles
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  articles.forEach(addGenerateButton);
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial scan
document.querySelectorAll('article[data-testid="tweet"]').forEach(addGenerateButton);

// Listen for regenerate requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'regenerate' && lastGeneratedTweet) {
    generateReply(
      lastGeneratedTweet.text,
      lastGeneratedTweet.author,
      lastGeneratedTweet.quotedTweet,
      lastGeneratedTweet.images
    ).then(reply => {
      if (reply) {
        sendResponse({ success: true, reply });
      } else {
        sendResponse({ success: false, error: 'Failed to generate reply' });
      }
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }
});