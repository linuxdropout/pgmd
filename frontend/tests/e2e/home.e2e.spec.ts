import { DEFAULT_APP_TITLE } from '@pgmd/shared'
import { expect, test } from '@playwright/test'

test('renders scaffold heading', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: DEFAULT_APP_TITLE })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Optimise' })).toBeVisible()
})
