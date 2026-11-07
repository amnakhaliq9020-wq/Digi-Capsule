# Digi Capsule UI and accessibility audit

Date: 6 November 2026  
Branch: `feature/zamin-core`  
No commit and no push. Backend routes, the database, and the 30-day check-in interval were not changed.

## 1. Starting point

The app already had one stylesheet, Source Sans 3 and Fraunces, 44px controls, and an earlier navy and teal palette. The gaps were:

- Colours did not match the requested navy, teal, ivory, sage, and coral tokens.
- Some labels and pills were under 16px.
- Focus rings were 2px.
- Errors were visual only, with no `role="alert"`.
- There was no skip link and the current page was not exposed to assistive technology.
- Deleting a memory did not ask for confirmation.
- Motion was not reduced when the operating system asks for that.
- There was no automated accessibility suite.

## 2. Design tokens

Requested colours were checked as pairs. Combinations under 4.5:1 for text were not used for text.

| Pair | Ratio | Use |
|---|---|---|
| `#14283B` on `#FAF8F2` | 14.16:1 | Body text, headings |
| `#FAF8F2` on `#14283B` | 14.16:1 | Navigation text and focus ring |
| `#F4F7F8` on `#14283B` | 13.97:1 | Navigation links |
| `#D5EBE6` on `#14283B` | 12.07:1 | Wordmark accent |
| `#14283B` on `#DCE9DF` | 12.01:1 | Text on sage |
| `#14283B` on `#F2D7CC` | 11.01:1 | Text on the soft coral surface |
| `#FFFFFF` on `#1C4E4B` | 9.37:1 | Button hover. `#1C4E4B` is the darker teal used for small text and links |
| `#1C4E4B` on `#FAF8F2` | 8.82:1 | Links and secondary button text |
| `#3E5166` on `#FAF8F2` | 7.68:1 | Muted text |
| `#6B2C24` on `#F2D7CC` | 7.64:1 | Error text on soft coral |
| `#6B3D12` on `#F3E6D0` | 8.16:1 | Warning text |
| `#FFFFFF` on `#397C78` | 4.85:1 | Primary button label |
| `#397C78` on `#DCE9DF` | 3.87:1 | Not used for text |

`#397C78` remains the primary button fill. Small text uses `#1C4E4B` instead. Body text is 18px. Controls are at least 48px tall. Focus is a 3px navy outline, ivory on the navy navigation. `prefers-reduced-motion` removes transitions.

## 3. Screens

Landing, sign-in, account creation, the signed-in shell, dashboard, contacts, memories, the memory editor, check-in, warnings, deliveries, and the test console share the same tokens. Important actions stay the teal buttons. Errors use text on coral, not colour alone, and are announced with `role="alert"`. Deleting a memory asks for confirmation. The memory form still explains the test clock in plain language.

## 4. WCAG 2.2 AA

Checked with axe-core tags `wcag2a`, `wcag2aa`, and `wcag22aa` in Chromium:

- Landing, sign-in, and account creation at 375, 390, 768, 1366, and 1920: no violations.
- Dashboard, contacts, memories, new memory, check-in, warnings, deliveries, and the test console at 1366: no violations.
- Keyboard: Tab reaches Create an account, then Sign in. On the sign-in form, Tab reaches Email. A failed sign-in shows an alert.
- Labels, skip link, `aria-current="page"`, and autocomplete on the account forms are in the markup.
- A manual screen reader pass with NVDA or VoiceOver was not run.
- Browser zoom at 200% was not run as a separate pass. Type is in rem, and the pages wrap instead of using a fixed page width.

## 5. Viewports

Playwright measured `scrollWidth` against `clientWidth`. Extra width was 0 or 1px, which is the scrollbar, at:

- 375x812, 390x844, 768x1024, 1366x768, and 1920x1080 for the public pages.
- 375, 1366, and 1920 for the signed-in pages listed above.

Screenshots are in `apps/web/a11y-screenshots/`.

## 6. Automated results

| Command | Result |
|---|---|
| `npm run test:a11y` public and keyboard tests | 2 passed |
| Signed-in Playwright test, rerun after raising the timeout | 1 passed |
| `npx tsc --noEmit` in `apps/web` | Passed |

The signed-in test creates a synthetic `@example.test` account. It does not press I'm Alive and does not run the worker.

## 7. Remaining limits

- Native file and video controls are still the browser's own widgets.
- On a phone the navigation wraps onto several lines so every destination stays visible.
- The reading column stays within 1080px on a wide screen.
- The test console still names the test clock, because that is how delivery dates are judged.
- 200% zoom and a physical screen reader were not executed.
