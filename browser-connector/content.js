function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function visibleTextIncludes(pattern) {
  return [...document.querySelectorAll('a, button')].some((element) => {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return pattern.test(clean(element.textContent || element.getAttribute('aria-label')))
  })
}

function currentProfileUsername() {
  const match = window.location.pathname.match(/^\/user\/([A-Za-z0-9_-]{3,32})\/?$/i)
  if (!match || match[1].toLowerCase() === 'me') return null
  return match[1]
}

function redditIdentity() {
  const username = currentProfileUsername()
  const hasAccountControls = visibleTextIncludes(/^(create|create post)$/i)
    && document.querySelector('button[aria-label*="user menu" i], button[aria-label*="avatar" i]')
  const hasLoginPrompt = visibleTextIncludes(/^(log in|login)$/i)
  return {
    loggedIn: Boolean(username && hasAccountControls && !hasLoginPrompt),
    username: username || undefined,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'BUYERWATCH_REDDIT_IDENTITY') return false
  sendResponse(redditIdentity())
  return false
})
