const DEFAULT_APP_URL = 'https://buyerwatch.co'
const form = document.querySelector('#settings-form')
const input = document.querySelector('#app-url')
const result = document.querySelector('#result')

function normalizeAppUrl(value) {
  const raw = String(value || DEFAULT_APP_URL).trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw)) return `http://${raw}`
  return `https://${raw}`
}

async function load() {
  const { appUrl } = await chrome.storage.sync.get('appUrl')
  input.value = normalizeAppUrl(appUrl)
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const appUrl = normalizeAppUrl(input.value)
  input.value = appUrl
  result.textContent = 'Testing connection...'
  result.style.color = '#686b72'
  try {
    const response = await fetch(`${appUrl}/api/extension/config`)
    if (!response.ok) throw new Error()
    await chrome.storage.sync.set({ appUrl })
    result.textContent = 'Connected successfully.'
    result.style.color = '#087f5b'
  } catch {
    result.textContent = 'BuyerWatch could not be reached at this URL.'
    result.style.color = '#b42318'
  }
})

load()
