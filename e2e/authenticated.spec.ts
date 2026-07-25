import { expect, test } from '@playwright/test'

const email = process.env.E2E_USER_EMAIL
const password = process.env.E2E_USER_PASSWORD

test.describe('authenticated product smoke', () => {
  test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD for staging smoke coverage')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(email!)
    await page.getByLabel(/password/i).fill(password!)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/)
  })

  test('dashboard surfaces remain reachable', async ({ page }) => {
    if (page.url().includes('/onboarding')) {
      test.skip(true, 'The staging smoke account must complete onboarding first')
    }
    await page.goto('/dashboard')
    await expect(page.getByRole('heading').first()).toBeVisible()

    for (const path of ['/keywords', '/opportunities', '/drafts', '/analytics', '/settings']) {
      await page.goto(path)
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.locator('main, [role="main"], body')).toBeVisible()
    }
  })
})
