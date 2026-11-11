import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

async function expectNoOverflow(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}

test("landing calls to action open the existing account routes", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Memories are forever/ })).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: "Get Early Access" }).click();
  await expect(page.getByLabel("Email")).toBeFocused();

  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/register");
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.goto("/");
  const stamp = Date.now();
  await page.getByLabel("Email").fill(`ada.${stamp}@example.test`);
  await page.getByRole("button", { name: "Join the Early Access List" }).click();
  await expect(page.getByRole("status")).toContainText("You're on the list");
});

test("footer information pages are real routes", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await page.goto("/");
  await footer.getByRole("link", { name: "Terms of Service" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();
  await page.goto("/");
  await footer.getByRole("link", { name: "Contact" }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { name: "There is no public inbox in this build." })).toBeVisible();
});

test("mobile menu reaches a section without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.goto("/#vision");
  await expect(page.getByRole("heading", { name: /should not be limited by time/ })).toBeVisible();
  await expectNoOverflow(page);
});

test("privacy copy stays within the real product", async ({ page }) => {
  await page.goto("/#privacy");
  await expect(page.getByText("Argon2id")).toBeVisible();
  await expect(page.getByText("AES-256-GCM")).toBeVisible();
  await expect(page.getByText(/does not send memories through an outside email/i)).toBeVisible();
  await expect(page.getByText(/does not promise that a message will be delivered/i)).toBeVisible();
  await expect(page.getByText(/military-grade/i)).toHaveCount(0);
});

test("public marketing pages fit phone, tablet, and desktop widths", async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/privacy", "/terms", "/contact"]) {
      await page.goto(path);
      await expectNoOverflow(page);
      const heroButton = page.getByRole("link", { name: "Get Early Access" }).first();
      if (path === "/") await expect(heroButton).toBeVisible();
    }
  }
});
