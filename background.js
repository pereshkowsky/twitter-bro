// Background script for Twitter Claude Reply Generator

  // Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    // Show badge with new reply indicator
    chrome.action.setBadgeText({ text: 'NEW' });
    chrome.action.setBadgeBackgroundColor({ color: '#1DA1F2' });
    
    // Clear badge after 10 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 10000);
  } else if (request.action === 'generateReply') {
    // Handle API request from content script
    handleGenerateReply(request.data)
      .then(result => {
        console.log(`[Claude Extension BG] Sending response with reply and imageCount`);
        sendResponse({ success: true, reply: result.reply, imageCount: result.imageCount });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
});

// Clear badge when popup is opened
chrome.action.onClicked.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

// Handle Claude API request
async function handleGenerateReply(data) {
  const { tweetText, tweetAuthor, quotedTweet, images, apiKey, model, prompt } = data;
  
  console.log(`[Claude Extension BG] Received request with:`, {
    hasText: !!tweetText,
    author: tweetAuthor,
    imageCount: images.length,
    model: model
  });
  
  // Check if model supports images
  const supportsImages = model.includes('sonnet');
  const hasImages = images.length > 0;
  
  // Prepare content array
  const content = [];
  
  // Add custom prompt
  content.push({ type: 'text', text: prompt });
  
  // Add tweet context
  let tweetContext = `\n\nGenerate a reply to this tweet from @${tweetAuthor}:\n"${tweetText}"`;
  if (quotedTweet) {
    tweetContext += `\n\nQuoted tweet: ${quotedTweet}`;
  }
  content.push({ type: 'text', text: tweetContext });
  
  // Add images if available and supported
  if (hasImages && supportsImages) {
    content.push(...images);
    content.push({ type: 'text', text: '\n\nConsider the images above when generating your reply.' });
    console.log(`[Claude Extension BG] Added ${images.length} images to the request`);
  }
  
  // Check if we should use cache
  const cacheSettings = await chrome.storage.sync.get(['cachedPrompt', 'cacheEnabled']);
  const useCache = cacheSettings.cacheEnabled && cacheSettings.cachedPrompt === prompt;
  
  // Prepare messages
  const messages = [{
    role: 'user',
    content: content
  }];
  
  // Add cache control if enabled
  if (useCache && content.length > 0) {
    content[0].cache_control = { type: 'ephemeral' };
  }
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      messages: messages
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API Error ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
  }
  
  const responseData = await response.json();
  const reply = responseData.content[0].text;
  
  // Save to storage for popup
  const imageCount = hasImages && supportsImages ? images.length : 0;
  
  // Double-check image count before saving
  console.log(`[Claude Extension BG] Saving to storage: imageCount=${imageCount}`);
  
  chrome.storage.sync.set({ 
    lastReply: reply,
    lastTweet: tweetText,
    lastAuthor: tweetAuthor,
    lastImageCount: imageCount
  }, () => {
    // Callback to ensure data is saved
    console.log(`[Claude Extension BG] Data saved to storage with imageCount: ${imageCount}`);
  });
  
  // Verify save
  chrome.storage.sync.get(['lastImageCount'], (data) => {
    console.log(`[Claude Extension BG] Verified saved imageCount: ${data.lastImageCount}`);
  });
  
  // Update cache usage if applicable
  if (useCache && responseData.usage?.cache_creation_input_tokens) {
    const savings = Math.round((responseData.usage.cache_read_input_tokens / (responseData.usage.cache_creation_input_tokens + responseData.usage.cache_read_input_tokens)) * 100);
    await chrome.storage.sync.set({ cacheSavings: savings });
  }
  
  return reply;
}