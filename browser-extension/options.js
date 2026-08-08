const form = document.querySelector('#settings-form')
const input = document.querySelector('#app-url')
const result = document.querySelector('#result')
const saveButton = form.querySelector('button[type="submit"]')
const developmentBuild = chrome.runtime.getManifest().name.includes('Development')

async function load() {
  const { appUrl } = await chrome.storage.sync.get('appUrl')
  input.value = developmentBuild
    ? BuyerWatchExtensionCommon.normalizeAppUrl(appUrl)
    : BuyerWatchExtensionCommon.DEFAULT_APP_URL
  if (!developmentBuild) {
    input.readOnly = true
    saveButton.textContent = 'Test production connection'
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  result.textContent = 'Testing connection...'
  result.style.color = '#686b72'
  try {
    const appUrl = developmentBuild
      ? BuyerWatchExtensionCommon.normalizeAppUrl(input.value)
      : BuyerWatchExtensionCommon.DEFAULT_APP_URL
    input.value = appUrl
    const response = await BuyerWatchExtensionCommon.fetchWithTimeout(`${appUrl}/api/extension/config`)
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
