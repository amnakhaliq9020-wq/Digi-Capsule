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
  await expect(page.getByRole("heading", { level: 1, name: "Your Memories. Your Moments. Your Legacy." })).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: "Get Started" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Explore Features" }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.getByRole("heading", { name: "What you can do in Digi Capsule today." })).toBeVisible();

  await page.getByRole("link", { name: "Create Your First Capsule" }).click();
  await expect(page).toHaveURL(/\/signup$/);
});

test("footer information pages are real routes", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await page.goto("/");
  await footer.getByRole("link", { name: "Terms" }).click();
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
  await expect(page.getByRole("banner").getByRole("link", { name: "Vision" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("banner").getByRole("link", { name: "Vision" }).click();
  await expect(page).toHaveURL(/#vision$/);
  await expect(page.getByRole("heading", { name: "Preserve today’s words for a day that has not arrived." })).toBeVisible();
  await expectNoOverflow(page);
});

test("future and security copy stay within the real product", async ({ page }) => {
  await page.goto("/#future");
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  await expect(page.getByText(/not available today/i)).toBeVisible();
  await expect(page.getByText(/not released in production/i).first()).toBeVisible();
  await expect(page.getByText("Argon2id")).toBeVisible();
  await expect(page.getByText("AES-256-GCM")).toBeVisible();
});

test("public marketing pages fit phone, tablet, and desktop widths", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/privacy", "/terms", "/contact"]) {
      await page.goto(path);
      await expectNoOverflow(page);
      const heroButton = page.getByRole("link", { name: viewport.width < 1080 ? "Get Started" : "Create Your First Capsule" }).first();
      if (path === "/") await expect(heroButton).toBeVisible();
    }
  }
});
