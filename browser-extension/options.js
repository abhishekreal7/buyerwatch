const DEFAULT_APP_URL = 'https://buyerwatch.co'
const form = document.querySelector('#settings-form')
const input = document.querySelector('#app-url')
const result = document.querySelector('#result')

async function load() {
  const { appUrl } = await chrome.storage.sync.get('appUrl')
  input.value = appUrl || DEFAULT_APP_URL
  document.querySelector('#extension-origin').textContent = chrome.runtime.getURL('').replace(/\/$/, '')
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const appUrl = input.value.trim().replace(/\/+$/, '')
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
