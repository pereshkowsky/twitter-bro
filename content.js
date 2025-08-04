// Add generate button to tweet
function addGenerateButton(article) {
  // Skip if button already exists
  if (article.querySelector('.claude-generate-btn')) return;
  
  // Find the action bar
  const actionBar = article.querySelector('[role="group"]');
  if (!actionBar) return;
  
  // Check if tweet has images
  const hasImages = article.querySelectorAll('img[src*="pbs.twimg.com"]').length > 0 ||
                    article.querySelectorAll('[data-testid="tweetPhoto"]').length > 0;
  
  // Create button
  const button = document.createElement('button');
  button.className = 'claude-generate-btn';
  button.innerHTML = hasImages ? '📸' : '🤖';
  button.title = hasImages ? `Generate reply with Claude (images detected)` : 'Generate reply with Claude';
  
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
      // Always try to extract images for debugging
      const images = await extractTweetImages(article);

      console.log('[Claude Extension] Images extracted:', images);

      lastGeneratedTweet = { text: tweetText, author: tweetAuthor, quotedTweet, images };

      const reply = await generateReply(tweetText, tweetAuthor, quotedTweet, images);

      if (reply) {
        showNotification('Reply generated! Check the extension popup.', 'success');
      }
    } finally {
      isGenerating = false;
      button.innerHTML = originalEmoji;
      button.classList.remove('generating');
    }
  });
  
  // Insert button
  actionBar.appendChild(button);
}// Simple test to add button to first tweet
window.testButton = function() {
  const article = document.querySelector('article[data-testid="tweet"]');
  if (!article) {
    console.log('[Claude Extension] No tweets found');
    return;
  }

  // Find any element with buttons
  const buttonContainers = article.querySelectorAll('div');
  for (const container of buttonContainers) {
    if (container.querySelectorAll('button').length > 0 && !container.querySelector('.claude-generate-btn')) {
      const testBtn = document.createElement('button');
      testBtn.className = 'claude-generate-btn';
      testBtn.innerHTML = '🤖';
      testBtn.style.cssText = 'display: inline-flex !important; width: 34px !important; height: 34px !important; background: yellow !important; border: 2px solid red !important; font-size: 20px !important;';
      testBtn.onclick = () => alert('Claude button clicked!');

      container.appendChild(testBtn);
      console.log('[Claude Extension] Test button added to:', container);
      // Add this line to define hasImages
      const hasImages = article.querySelectorAll('img[src*="pbs.twimg.com/media"]').length > 0;
      console.log(`[Claude Extension] Has images: ${hasImages}, Image count: ${article.querySelectorAll('img[src*="pbs.twimg.com"]').length}`);
      return 'Button added!';
    }
  }

  return 'No suitable container found';
};      
// console.log(`[Claude Extension] Starting generation process`);
// console.log(`[Claude Extension] Has images: ${hasImages}, Image count: ${article.querySelectorAll('img[src*="pbs.twimg.com"]').length}`);// Content script for Twitter Claude Reply Generator

console.log('[Claude Extension] Content script starting...');

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
  // Select only static tweet images (jpg, jpeg, png)
  let imageElements = Array.from(
    tweetElement.querySelectorAll('img[src*="pbs.twimg.com/media"]')
  ).filter(img =>
    /\.(jpe?g|png)(\?|$)/i.test(img.src)
  );

  // Also look for background-image in [data-testid="tweetPhoto"]
  const tweetPhotoDivs = tweetElement.querySelectorAll('[data-testid="tweetPhoto"]');
  tweetPhotoDivs.forEach(div => {
    const bg = div.style.backgroundImage;
    if (bg && bg.startsWith('url("https://pbs.twimg.com/media/')) {
      const url = bg.slice(5, -2);
      if (
        /\.(jpe?g|png)(\?|$)/i.test(url) &&
        !imageElements.some(img => img.src === url)
      ) {
        imageElements.push({ src: url });
      }
    }
  });

  // Deduplicate by src
  const seen = new Set();
  const uniqueImageElements = imageElements.filter(img => {
    if (seen.has(img.src)) return false;
    seen.add(img.src);
    return true;
  });

  console.log('[Claude Extension] Unique static tweet image elements:', uniqueImageElements.length, uniqueImageElements);

  for (let i = 0; i < Math.min(uniqueImageElements.length, 3); i++) {
    try {
      const imgUrl = uniqueImageElements[i].src;
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      const mediaType = blob.type || 'image/jpeg';
      images.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64.split(',')[1] } });
      console.log('[Claude Extension] Extracted tweet image URL:', imgUrl);
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
  const quotedTweetContainer = tweetElement.querySelector('[data-testid="quoteTweet"]');
  if (!quotedTweetContainer) return null;

  const quotedAuthorElement = quotedTweetContainer.querySelector('[data-testid="User-Name"] a');
  const quotedAuthor = quotedAuthorElement ? quotedAuthorElement.innerText.split('@')[1] : 'unknown';

  const quotedTextElement = quotedTweetContainer.querySelector('[data-testid="tweetText"]');
  const quotedText = quotedTextElement ? quotedTextElement.innerText : '';

  return quotedAuthor && quotedText ? { author: quotedAuthor, text: quotedText } : null;
}

// Helper function to check if tweet is a repost
function isRepost(article) {
  // Check for repost indicator
  const socialContext = article.querySelector('[data-testid="socialContext"]');
  if (!socialContext) return false;
  
  const text = socialContext.innerText.toLowerCase();
  return text.includes('reposted') || text.includes('retweeted');
}

// Function to mark reposts
function markRepost(article) {
  if (!article.classList.contains('claude-repost-marked') && isRepost(article)) {
    article.classList.add('claude-repost-marked');
    
    // Optional: Add visual indicator
    const indicator = document.createElement('div');
    indicator.className = 'claude-repost-indicator';
    indicator.innerHTML = '🔁 REPOST';
    indicator.title = 'This is a repost/retweet';
    
    // Find good place to insert indicator
    const header = article.querySelector('[data-testid="User-Name"]')?.parentElement;
    if (header) {
      header.style.position = 'relative';
      header.appendChild(indicator);
    }
  }
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
  try {
    // NEW: Mark reposts
    markRepost(article);

    // Skip if button already exists
    if (article.querySelector('.claude-generate-btn')) return;
    
    // Find the action bar - try multiple selectors
    let actionBar = article.querySelector('[role="group"]');
    
    // Alternative selectors if first one doesn't work
    if (!actionBar) {
      // Try to find the like/retweet/reply button container
      const replyButton = article.querySelector('[data-testid="reply"]');
      if (replyButton) {
        actionBar = replyButton.closest('[role="group"]');
      }
    }
    
        // Apply repost settings
    async function applyRepostSettings() {
      const settings = await chrome.storage.sync.get(['hideReposts', 'dimReposts']);
      
      document.body.classList.toggle('claude-hide-repost-buttons', settings.hideReposts);
      document.body.classList.toggle('claude-dim-reposts', settings.dimReposts !== false);
    }

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && (changes.hideReposts || changes.dimReposts)) {
        applyRepostSettings();
      }
    });

    // Apply settings on load
    applyRepostSettings();

    if (!actionBar) {
      // Try another approach - find by aria-label
      const buttons = article.querySelectorAll('button[aria-label]');
      for (const btn of buttons) {
        if (btn.getAttribute('aria-label')?.toLowerCase().includes('reply')) {
          actionBar = btn.parentElement?.parentElement;
          break;
        }
      }
    }
    
    if (!actionBar) {
      // Last resort - find any group of buttons at the bottom of tweet
      const groups = article.querySelectorAll('div > div > div');
      for (const group of groups) {
        if (group.querySelectorAll('button').length >= 3) {
          actionBar = group;
          break;
        }
      }
    }
    
    if (!actionBar) {
      // Log for debugging with more info
      console.log('[Claude Extension] Could not find action bar for tweet. Article structure:', article.innerHTML.substring(0, 200));
      return;
    }
    
    // Check if tweet has images - try multiple selectors
    const imageSelectors = [
      'img[src*="pbs.twimg.com/media"]',
      'img[src*="pbs.twimg.com/tweet_video_thumb"]',
      'div[data-testid="tweetPhoto"] img',
      'div[aria-label*="Image"] img'
    ];
    
    let imageCount = 0;
    for (const selector of imageSelectors) {
      imageCount += article.querySelectorAll(selector).length;
    }
    
    const hasImages = imageCount > 0;
    
    // Create button
    const button = document.createElement('button');
    button.className = 'claude-generate-btn';
    button.innerHTML = hasImages ? '📸' : '🤖';
    button.title = hasImages ? `Generate reply with Claude (${imageCount} images detected)` : 'Generate reply with Claude';
  
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
      // Always try to extract images for debugging
      const images = await extractTweetImages(article);

      console.log('[Claude Extension] Images extracted:', images);

      lastGeneratedTweet = { text: tweetText, author: tweetAuthor, quotedTweet, images };

      const reply = await generateReply(tweetText, tweetAuthor, quotedTweet, images);

      if (reply) {
        const imageCount = images.length;
        if (imageCount > 0) {
          showNotification(`Reply generated! ${imageCount} image${imageCount > 1 ? 's' : ''} processed. Check the extension popup.`, 'success');
          // Temporarily show image count on button
          button.innerHTML = `✅${imageCount}`;
          setTimeout(() => {
            button.innerHTML = originalEmoji;
          }, 2000);
          
          // Double-check storage
          chrome.storage.sync.get(['lastImageCount'], (data) => {
            console.log(`[Claude Extension] Verified image count in storage: ${data.lastImageCount}`);
          });
        } else {
          showNotification('Reply generated! Check the extension popup.', 'success');
        }
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
  
  } catch (error) {
    console.error('[Claude Extension] Error adding button:', error);
  }
}

// Observe DOM changes
let observerStarted = false;
const observer = new MutationObserver((mutations) => {
  // Find all tweet articles
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  if (articles.length > 0 && !observerStarted) {
    console.log(`[Claude Extension] Found ${articles.length} tweets on page`);
    observerStarted = true;
  }
  articles.forEach(addGenerateButton);
});

// Start observing when DOM is ready
function startExtension() {
  console.log('[Claude Extension] Starting extension...');
  
  // Check if we're on the right site
  if (!window.location.hostname.includes('twitter.com') && !window.location.hostname.includes('x.com')) {
    console.warn('[Claude Extension] Not on Twitter/X, extension will not run');
    return;
  }
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Initial scan
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  console.log(`[Claude Extension] Initial scan found ${tweets.length} tweets`);
  tweets.forEach(addGenerateButton);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startExtension);
} else {
  startExtension();
}

// Periodic check for dynamic content (Twitter loads content dynamically)
setInterval(() => {
  const articles = document.querySelectorAll('article[data-testid="tweet"]:not(:has(.claude-generate-btn))');
  if (articles.length > 0) {
    console.log(`[Claude Extension] Found ${articles.length} tweets without buttons`);
    articles.forEach(addGenerateButton);
  }
}, 2000);

console.log('[Claude Extension] Content script loaded and ready');
console.log('[Claude Extension] Debug commands available:');
console.log('  - window.addClaudeButtons() - manually add buttons to all tweets');
console.log('  - window.debugTweetStructure() - highlight tweet elements');
console.log('  - window.testButton() - add a test button to first tweet');

// Listen for regenerate requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'regenerate' && lastGeneratedTweet) {
    // Clear previous image status
    chrome.storage.sync.set({ lastImageCount: 0 }).then(() => {
      return generateReply(
        lastGeneratedTweet.text,
        lastGeneratedTweet.author,
        lastGeneratedTweet.quotedTweet,
        lastGeneratedTweet.images
      );
    }).then(reply => {
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