import { expect, Page, test } from '@playwright/test';

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByTestId('field-name').fill('Test User');
  await page.getByTestId('field-email').fill(email);
  await page.getByTestId('field-password').fill('password123');
  await page.getByTestId('field-confirm').fill('password123');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByRole('heading', { name: 'My Contacts' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('welcome-message')).toBeVisible();
}

test('home dashboard creates, edits, and deletes a private letter', async ({ page }) => {
  const stamp = Date.now();
  let dialogs = 0;
  page.on('dialog', () => {
    dialogs += 1;
  });
  await register(page, `memory.${stamp}@example.com`);
  await expect(page.getByTestId('empty-memories')).toContainText('Your memory collection is waiting to begin.');
  await page.getByTestId('create-first-memory').click();
  await expect(page.getByRole('heading', { name: 'Create a memory' })).toBeVisible();

  await page.getByTestId('capsule-title').fill('Family Capsule');
  await page.getByTestId('capsule-description').fill('Letters and photos');
  await page.getByTestId('save-capsule').click();
  await expect(page.getByTestId('form-message')).toContainText('Capsule created');

  await page.getByTestId('type-LETTER').click();
  await page.getByTestId('field-title').fill('A letter for later');
  await page.getByTestId('field-description').fill('Private note');
  await page.getByTestId('field-body').fill('Hello from Digi Capsule. <script>alert(1)</script>');
  await page.getByTestId('field-tags').fill('family');
  await page.getByTestId('save-draft').click();

  await expect(page.getByTestId('banner')).toContainText('not been sent');
  await expect(page.getByTestId('memory-card')).toHaveCount(1);
  await expect(page.getByTestId('memory-title')).toHaveText('A letter for later');
  await expect(page.getByText('Draft').first()).toBeVisible();
  expect(dialogs).toBe(0);

  await page.locator('[data-testid^="edit-memory-"]').click();
  await page.getByTestId('field-title').fill('A revised letter');
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('memory-title')).toHaveText('A revised letter');
  await expect(page.getByTestId('memory-card')).toHaveCount(1);

  await page.locator('[data-testid^="delete-memory-"]').click();
  await page.locator('[data-testid^="confirm-delete-"]').click();
  await expect(page.getByTestId('empty-memories')).toBeVisible();
});

test('uploads a photo and rejects a file that is not an image', async ({ page }) => {
  const stamp = Date.now();
  await register(page, `photo.${stamp}@example.com`);
  await page.getByTestId('create-memory').click();
  await page.getByTestId('capsule-title').fill('Photo Capsule');
  await page.getByTestId('save-capsule').click();
  await page.getByTestId('type-PHOTO').click();
  await page.getByTestId('field-title').fill('One photograph');
  await page.getByTestId('upload-input').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.getByTestId('asset-name')).toHaveText('tiny.png');
  await page.getByTestId('save-draft').click();
  await expect(page.getByTestId('memory-title')).toHaveText('One photograph');

  await page.getByTestId('create-memory').click();
  await page.getByTestId('type-PHOTO').click();
  await page.getByTestId('upload-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a photo'),
  });
  await expect(page.getByTestId('form-error')).toContainText(/jpg or png/i);
});

test('one account cannot see another account memory', async ({ browser }) => {
  const stamp = Date.now();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await register(pageA, `owner.${stamp}@example.com`);
  await pageA.getByTestId('create-first-memory').click();
  await pageA.getByTestId('capsule-title').fill('Private');
  await pageA.getByTestId('save-capsule').click();
  await pageA.getByTestId('field-title').fill('Hidden letter');
  await pageA.getByTestId('field-body').fill('Only for me');
  await pageA.getByTestId('save-draft').click();
  await expect(pageA.getByText('Hidden letter')).toBeVisible();

  await register(pageB, `other.${stamp}@example.com`);
  await expect(pageB.getByTestId('empty-memories')).toBeVisible();
  await expect(pageB.getByText('Hidden letter')).toHaveCount(0);
  await contextA.close();
  await contextB.close();
});
