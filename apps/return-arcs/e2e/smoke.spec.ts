import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

const LEAD = 'demo-lead-alex';
const GRADER = 'demo-grader-sam';

test('smoke: loads centrepiece, logs return at Dock, sees it listed, no console errors', async ({ page }) => {
  const consoleWatch = watchConsole(page);
  await openApp(page, '/', LEAD);
  await expect(page.getByTestId('boomerang-stage')).toBeVisible();
  await assertNoHorizontalScroll(page);

  await openApp(page, '/dock', GRADER);
  await page.getByLabel(/RMA number/).fill('RMA-SMK-1');
  await page.getByLabel(/SKU/).fill('HM-SMK-01');
  await page.getByLabel(/Product name/).fill('Cedar Tabletop Lantern');
  await page.getByLabel('Unit price ($)').fill('48');
  await page.getByLabel('Unit cost ($)').fill('20');
  await page.getByRole('button', { name: 'Log return request' }).click();
  await expect(page.getByRole('cell', { name: 'RMA-SMK-1' })).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('centrepiece: lens switch, Today focus, list view fallback, and ?nowebgl render cleanly', async ({ page }, info) => {
  const consoleWatch = watchConsole(page);
  const phone = info.project.name === 'phone';
  await openApp(page, '/?nowebgl', LEAD);
  await expect(page.getByTestId('boomerang-stage')).toBeVisible();

  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Recovery/ }).click();
  if (phone) await page.getByRole('button', { name: /^Today/ }).click();
  await page.getByRole('button', { name: /Ungraded past 48h target/ }).click();
  if (phone) await page.keyboard.press('Escape');

  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('arc-list')).toBeVisible();
  await expect(page.getByText('Aurora 4K Home Projector')).toBeVisible();
  await assertNoHorizontalScroll(page);
  consoleWatch.assertClean();
});

test('AC1: Grade-C item can never be routed to restock and the ladder shows why', async ({ page }) => {
  await openApp(page, '/fork', GRADER);
  await expect(page.getByTestId('fork-workspace')).toBeVisible();
  await page.getByTestId('fork-queue').getByRole('button', { name: /Grade C/ }).first().click();
  const restockRow = page.getByTestId('ladder-row-restock');
  await expect(restockRow).toHaveAttribute('data-eligible', 'false');
  await expect(page.getByTestId('ladder-blocked-restock')).toContainText(/Grade C can never restock/i);
});

test('AC2: A $12 item with $7 handling cost is offered a returnless refund', async ({ page }) => {
  await openApp(page, '/dock', GRADER);
  await page.getByLabel('Category').selectOption('home'); // Home handlingCost = $7.00
  await page.getByLabel('Unit price ($)').fill('12');
  await expect(page.getByTestId('returnless-offer')).toBeVisible();
  await expect(page.getByTestId('offer-returnless-btn')).toBeVisible();
});

test('AC3: Fashion order Nov 28 -> Jan 20 is in window; Dec 28 -> Jan 31 is late', async ({ page }) => {
  await openApp(page, '/dock', GRADER);
  await page.getByLabel('Category').selectOption('fashion');
  await page.getByLabel('Order date').fill('2026-11-28');
  await page.getByLabel('Return date').fill('2027-01-20');
  await expect(page.getByTestId('window-preview')).toContainText(/In holiday return window/i);

  await page.getByLabel('Order date').fill('2026-12-28');
  await page.getByLabel('Return date').fill('2027-01-31');
  await expect(page.getByTestId('window-preview')).toContainText(/Outside return window/i);
});

test('AC4: 10 orders / 5 returns is flagged at 50%; 8 orders / 4 returns is not flagged', async ({ page }) => {
  await openApp(page, '/bench', GRADER);
  // First overdue item in bench queue is CUST-401 (5 returns of 10 orders = 50%)
  await expect(page.getByTestId('serial-returner-banner')).toContainText('CUST-401');
  await expect(page.getByTestId('serial-returner-banner')).toContainText('50%');

  await openApp(page, '/flyers', GRADER);
  await expect(page.getByTestId('flyer-row-CUST-401')).toContainText('Flagged');
  await expect(page.getByTestId('flyer-row-CUST-404')).toContainText('Clear');
});

test('AC5: A $620 refund stays pending until the Returns lead approves', async ({ page }) => {
  // Grader cannot approve
  await openApp(page, '/write-offs', GRADER);
  const rowAsGrader = page.getByTestId('writeoff-row-RMA-1001');
  await expect(rowAsGrader).toContainText('$620.00');
  await expect(page.getByTestId('approve-btn-RMA-1001')).toBeDisabled();

  // Returns lead approves
  await openApp(page, '/write-offs', LEAD);
  await page.getByTestId('approve-btn-RMA-1001').click();
  await page.getByRole('button', { name: 'Approve and release' }).click();
  await expect(page.getByTestId('writeoff-row-RMA-1001')).toHaveCount(0);
});
