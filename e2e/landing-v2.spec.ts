import { expect, test } from '@playwright/test'

test.setTimeout(60_000)

test('homepage serves the exact standalone prototype and its interactions', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))

  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/buying signal\s*found you in time/i)
  await expect(page.locator('link[href="css/design-tokens.css"]')).toHaveCount(1)
  await expect(page.locator('script[src="js/intent-card.js"]')).toHaveCount(1)
  await expect(page.locator('#how-it-works')).toBeVisible()

  const redditCard = page.locator('.fanned-card[data-channel="reddit"]')
  await redditCard.evaluate(card => (card as HTMLElement).click())
  await expect(redditCard).toHaveClass(/is-active/)

  const billingSwitch = page.getByRole('switch', { name: 'Toggle annual billing' })
  await billingSwitch.click()
  await expect(billingSwitch).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('$31', { exact: true })).toBeVisible()
  await expect(page.getByText('Card required · 7-day free trial · Then billed $372 once per year', { exact: true })).toBeVisible()

  const intentQuestion = page.getByRole('button', { name: /What counts as a buyer-intent signal/i })
  await intentQuestion.click()
  await expect(intentQuestion.locator('..')).toHaveClass(/is-active/)
  await expect(intentQuestion.locator('..').locator('.faq-answer-drawer')).not.toHaveCSS('max-height', '0px')

  await expect(page.locator('section')).toHaveCount(17)
  await expect(page.locator('footer')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('mobile navigation opens and links remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Open mobile menu' })
  await expect(menu).toBeVisible()
  await menu.click()
  const drawer = page.locator('#mobileNavDrawer')
  await expect(drawer).toHaveClass(/is-open/)
  await expect(drawer.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing')
  await page.locator('#drawerCloseBtn').click()
  await expect(drawer).not.toHaveClass(/is-open/)
})
