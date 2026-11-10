import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 375, height: 812, name: "375" },
  { width: 390, height: 844, name: "390" },
  { width: 768, height: 1024, name: "768" },
  { width: 1366, height: 768, name: "1366" },
  { width: 1920, height: 1080, name: "1920" },
];

async function saveShot(page: Page, file: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.screenshot({ path: file, fullPage: true });
      return;
    } catch (error) {
      last = error;
      await page.waitForTimeout(400);
    }
  }
  throw last;
}

async function expectNoOverflow(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test("public pages stay accessible at every requested viewport", async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of ["/", "/login", "/signup", "/privacy", "/terms", "/contact"]) {
      await page.goto(path);
      await expectNoOverflow(page);
      await expectAccessible(page);
      await saveShot(page, `a11y-screenshots/${path === "/" ? "landing" : path.slice(1)}-${viewport.name}.png`);
    }
  }
});

test("keyboard reaches the account actions and the login fields", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  const header = page.getByRole("banner");
  await header.getByRole("link", { name: "Sign in" }).focus();
  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "Get early access" })).toBeFocused();
  await page.goto("/login");
  const loginHeader = page.getByRole("banner");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(loginHeader.getByRole("link", { name: "Digi Capsule" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(loginHeader.getByRole("link", { name: "Sign in" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(loginHeader.getByRole("link", { name: "Create an account" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.getByLabel("Email").fill("not-a-person@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("signed-in screens stay accessible without sending a memory", async ({ page, request }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const email = `a11y.${stamp}@example.test`;
  const password = "A11y-Check-1";
  const registered = await request.post("http://127.0.0.1:3001/v1/auth/register", {
    data: { displayName: "A11y Author", email, password, timeZone: "Asia/Karachi" },
  });
  expect(registered.ok()).toBeTruthy();
  const body = await registered.json();
  const verified = await request.post("http://127.0.0.1:3001/v1/auth/verify-email", {
    data: { token: body.devVerificationToken },
    headers: { cookie: registered.headers()["set-cookie"]?.split(";")[0] ?? "" },
  });
  expect(verified.ok()).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "What would you like to do today?" })).toBeVisible();
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("link", { name: "Create a Memory" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/memories\/new$/);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "What would you like to do today?" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expectNoOverflow(page);
  await expect(page.getByRole("link", { name: "Create a Memory" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a Future Message" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View My Capsules" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage Trusted Contacts" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });

  const paths = [
    ["dashboard", "/dashboard"],
    ["contacts", "/contacts"],
    ["memories", "/memories"],
    ["new-memory", "/memories/new"],
    ["check-in", "/check-in"],
    ["warnings", "/warnings"],
    ["deliveries", "/deliveries"],
    ["account", "/account"],
    ["dev", "/dev"],
  ] as const;
  for (const viewport of [viewports[0], viewports[2], viewports[3], viewports[4]]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [name, path] of paths) {
      await page.goto(path);
      await expectNoOverflow(page);
      if (viewport.name === "1366") await expectAccessible(page);
      await saveShot(page, `a11y-screenshots/${name}-${viewport.name}.png`);
    }
  }
});
