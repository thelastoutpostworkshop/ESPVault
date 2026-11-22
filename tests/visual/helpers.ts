import { expect, type Locator, type Page } from "@playwright/test";

type AppView = "Boards" | "Dashboard" | "Maker Tools" | "Projects" | "Settings";

export async function openHarness(page: Page): Promise<void> {
  await page.goto("/browser-harness.html");
  await expect(page.getByRole("banner")).toContainText("Dashboard");
}

export async function openView(page: Page, name: AppView): Promise<void> {
  await page.getByText(name, { exact: true }).first().click();
  if (name === "Dashboard") {
    await expect(page.getByRole("banner")).toContainText("Dashboard");
    return;
  }

  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

export async function openViewFromTemporaryNav(
  page: Page,
  name: AppView
): Promise<void> {
  await page.getByLabel("Open navigation").click();
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

export async function chooseSelectOption(
  page: Page,
  label: string,
  option: string,
  scope?: Locator
): Promise<void> {
  const selectScope = scope ?? page.locator("body");
  const select = selectScope
    .getByRole("combobox", { name: label, exact: true })
    .first();
  const optionLocator = page.getByRole("option", { name: option, exact: true });

  await clickVuetifySelectActivator(select);
  await expect(optionLocator).toBeVisible();
  await optionLocator.click();
}

export async function chooseSelectOptionContaining(
  page: Page,
  select: Locator,
  optionText: string
): Promise<void> {
  const option = page.getByRole("option").filter({ hasText: optionText }).first();

  await clickVuetifySelectActivator(select);
  await expect(option).toBeVisible();
  await option.click();
}

export function tableRow(page: Page, text: string): Locator {
  return page.getByRole("row").filter({ hasText: text });
}

async function clickVuetifySelectActivator(select: Locator): Promise<void> {
  const field = select
    .locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' v-field ')][1]"
    )
    .first();

  await field.click();
}
