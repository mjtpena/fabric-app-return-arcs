/**
 * Redesign screenshots (not a test). Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Writes docs/redesign/<screen>-<theme>-<desktop|phone>.png.
 */
import { test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

const LEAD = 'demo-lead-alex';
const GRADER = 'demo-grader-sam';

type Shot = { name: string; path: string; persona: string; full?: boolean; act?: (page: Page, phone: boolean) => Promise<void> };

const lens = (name: RegExp) => async (page: Page) => {
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name }).click();
};

const SHOTS: Shot[] = [
  { name: 'arcs', path: '/', persona: LEAD },
  { name: 'arcs-recovery', path: '/', persona: LEAD, act: lens(/Recovery/) },
  { name: 'arcs-days', path: '/', persona: LEAD, act: lens(/Days/) },
  {
    name: 'arcs-today-focus',
    path: '/',
    persona: LEAD,
    act: async (page, phone) => {
      if (phone) await page.getByRole('button', { name: /^Today/ }).click();
      await page.getByRole('button', { name: /Ungraded past 48h target/ }).click();
    },
  },
  {
    name: 'arcs-list',
    path: '/',
    persona: LEAD,
    full: true,
    act: async (page) => {
      await page.getByRole('radio', { name: 'List' }).click();
    },
  },
  { name: 'dock', path: '/dock', persona: GRADER, full: true },
  { name: 'bench', path: '/bench', persona: GRADER, full: true },
  { name: 'fork', path: '/fork', persona: GRADER, full: true },
  { name: 'write-offs', path: '/write-offs', persona: LEAD, full: true },
  { name: 'flyers', path: '/flyers', persona: LEAD, full: true },
];

const only = process.env.SHOTS?.split(',').filter(Boolean);
const themes = (process.env.THEMES?.split(',').filter(Boolean) as ('light' | 'dark')[] | undefined) ?? ['light', 'dark'];

for (const scheme of themes) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    for (const s of SHOTS) {
      test(`${s.name} ${scheme}`, async ({ page }, info) => {
        test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to write the redesign screenshots.');
        test.skip(!!only && !only.includes(s.name), 'not selected');
        const phone = info.project.name === 'phone';
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openApp(page, s.path, s.persona);
        await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
        if (s.act) await s.act(page, phone);
        await page.waitForTimeout(700);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `docs/redesign/${s.name}-${scheme}-${phone ? 'phone' : 'desktop'}.png`,
          fullPage: !!s.full && !phone,
        });
      });
    }
  });
}
