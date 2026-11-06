import { expect, Page, test } from '@playwright/test';

const widths = [320, 375, 425, 768, 1024, 1440];

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByTestId('field-name').fill('Test User');
  await page.getByTestId('field-email').fill(email);
  await page.getByTestId('field-password').fill('password123');
  await page.getByTestId('field-confirm').fill('password123');
  await page.getByTestId('submit-auth').click();
  await expect(page.getByRole('heading', { name: 'My Contacts' })).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function addContact(page: Page, slot: number, contact: { fullName: string; email: string; phone?: string }) {
  const addButton = page.getByTestId(`add-contact-${slot}`);
  const box = await addButton.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await addButton.click();

  const emailField = page.getByTestId('field-email');
  const fieldBox = await emailField.boundingBox();
  const viewport = page.viewportSize();
  expect(fieldBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(fieldBox!.x).toBeGreaterThanOrEqual(0);
  expect(fieldBox!.x + fieldBox!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);

  await page.getByTestId('field-fullName').fill(contact.fullName);
  await emailField.fill(contact.email);
  if (contact.phone) await page.getByTestId('field-phone').fill(contact.phone);
  else await page.getByTestId('field-phone').fill('');
  await page.getByTestId('save-contact').click();
  await expect(page.getByTestId(`contact-name-${slot}`)).toHaveText(contact.fullName);
  await expect(page.getByTestId(`contact-email-${slot}`)).toHaveText(contact.email);
  if (contact.phone) {
    await expect(page.getByTestId(`contact-phone-${slot}`)).toHaveText(contact.phone.replace(/[\s()-]/g, ''));
  }
}

for (const width of widths) {
  test(`contacts page works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 900 : 1000 });
    const stamp = `${width}-${Date.now()}`;
    const first = {
      fullName: 'Sara Khan',
      email: `sara.${stamp}@example.com`,
    };
    const second = {
      fullName: 'Hassan Ali',
      email: `hassan.${stamp}@example.com`,
      phone: '+92 300 1234567',
    };

    await register(page, `owner.${stamp}@example.com`);
    await expectNoOverflow(page);

    const card = await page.getByTestId('slot-1').boundingBox();
    expect(card).not.toBeNull();
    expect(card!.width).toBeGreaterThan(0);
    expect(card!.width).toBeLessThanOrEqual(width);

    if (width < 1024) {
      await expect(page.getByTestId('nav-toggle')).toBeVisible();
      await expect(page.getByTestId('nav-desktop')).toBeHidden();
      await page.getByTestId('nav-toggle').click();
      await expect(page.getByTestId('nav-mobile')).toBeVisible();
      await expectNoOverflow(page);
      await page.getByTestId('nav-link-home').click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByTestId('nav-toggle').click();
      await page.getByTestId('nav-link-contacts').click();
    } else {
      await expect(page.getByTestId('nav-toggle')).toBeHidden();
      await expect(page.getByTestId('nav-desktop')).toBeVisible();
      await page.getByTestId('nav-desktop-home').click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByTestId('nav-desktop-contacts').click();
    }

    await expect(page.getByRole('heading', { name: 'My Contacts' })).toBeVisible();
    await expect(page.getByTestId('empty-state')).toBeVisible();

    await addContact(page, 1, first);
    await expect(page.getByTestId('banner')).toHaveText('Contact saved.');
    await addContact(page, 2, second);
    await expect(page.getByTestId('slots-full-message')).toBeVisible();
    await expect(page.getByTestId('add-contact-1')).toHaveCount(0);
    await expect(page.getByTestId('add-contact-2')).toHaveCount(0);
    await expectNoOverflow(page);

    await page.getByTestId('edit-contact-1').click();
    await page.getByTestId('field-fullName').fill('Temporary Name');
    await page.getByTestId('cancel-contact').click();
    await expect(page.getByTestId('contact-name-1')).toHaveText(first.fullName);

    const updatedFirst = {
      fullName: 'Sara Qureshi',
      email: `sara.updated.${stamp}@example.com`,
    };
    await page.getByTestId('edit-contact-1').click();
    await page.getByTestId('field-fullName').fill(updatedFirst.fullName);
    await page.getByTestId('field-email').fill(updatedFirst.email);
    await page.getByTestId('field-phone').fill('+1 415 555 2671');
    await page.getByTestId('save-contact').click();
    await expect(page.getByTestId('contact-name-1')).toHaveText(updatedFirst.fullName);
    await expect(page.getByTestId('contact-email-1')).toHaveText(updatedFirst.email);
    await expect(page.getByTestId('contact-phone-1')).toHaveText('+14155552671');

    await page.getByTestId('edit-contact-2').click();
    await page.getByTestId('field-fullName').fill('Hassan Raza');
    await page.getByTestId('field-email').fill(`hassan.updated.${stamp}@example.com`);
    await page.getByTestId('save-contact').click();
    await expect(page.getByTestId('contact-name-2')).toHaveText('Hassan Raza');

    await page.reload();
    await expect(page.getByTestId('contact-name-1')).toHaveText(updatedFirst.fullName);
    await expect(page.getByTestId('contact-email-1')).toHaveText(updatedFirst.email);
    await expect(page.getByTestId('contact-phone-1')).toHaveText('+14155552671');
    await expect(page.getByTestId('contact-name-2')).toHaveText('Hassan Raza');
    await expect(page.getByTestId('contact-email-2')).toHaveText(`hassan.updated.${stamp}@example.com`);
    await expectNoOverflow(page);

    await page.getByTestId('edit-contact-2').click();
    await page.getByTestId('field-email').fill('not-an-email');
    await page.getByTestId('save-contact').click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await page.getByTestId('cancel-contact').click();
    await expect(page.getByTestId('contact-email-2')).toHaveText(`hassan.updated.${stamp}@example.com`);

    await page.getByTestId('edit-contact-2').click();
    await page.getByTestId('field-email').fill(updatedFirst.email);
    await page.getByTestId('save-contact').click();
    await expect(page.getByTestId('form-error')).toContainText(/already saved/i);
    await page.reload();
    await expect(page.getByTestId('contact-email-2')).toHaveText(`hassan.updated.${stamp}@example.com`);
    await expect(page.getByTestId('contact-email-1')).toHaveText(updatedFirst.email);
  });
}

test('unauthenticated visitors cannot manage contacts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contacts');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByTestId('add-contact-1')).toHaveCount(0);
});

test('one account cannot see another account’s contacts', async ({ browser }) => {
  const stamp = Date.now();
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await register(pageA, `private.a.${stamp}@example.com`);
  await addContact(pageA, 1, {
    fullName: 'Private Sara',
    email: `private.sara.${stamp}@example.com`,
  });

  await register(pageB, `private.b.${stamp}@example.com`);
  await expect(pageB.getByTestId('empty-state')).toBeVisible();
  await expect(pageB.getByText(`private.sara.${stamp}@example.com`)).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});
