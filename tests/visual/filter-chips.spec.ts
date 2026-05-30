import { expect, type Page, test } from "@playwright/test";

test.describe("filter chips", () => {
  test("shows and clears board status and chip model filters", async ({ page }) => {
    await openHarness(page);
    await openView(page, "Boards");

    await chooseSelectOption(page, "Status", "Unassigned to project");
    await expect(page.getByLabel("Active board filters")).toContainText(
      "Project:Unassigned"
    );
    await expect(tableRow(page, "Sensor Node S3")).toBeHidden();
    await expect(tableRow(page, "Workbench ESP32 DevKit")).toBeVisible();

    await page.getByLabel("Clear Project filter").click();
    await expect(page.getByLabel("Active board filters")).toBeHidden();
    await expect(tableRow(page, "Sensor Node S3")).toBeVisible();

    await chooseSelectOption(page, "Chip model", "ESP32-S3");
    await expect(page.getByLabel("Active board filters")).toContainText(
      "Chip model:ESP32-S3"
    );
    await expect(tableRow(page, "Sensor Node S3")).toBeVisible();
    await expect(tableRow(page, "Workbench ESP32 DevKit")).toBeHidden();

    await page.getByLabel("Clear Chip model filter").click();
    await expect(page.getByLabel("Active board filters")).toBeHidden();
  });

  test("shows and clears project status filters", async ({ page }) => {
    await openHarness(page);
    await openView(page, "Projects");

    await chooseSelectOption(page, "Status", "Needs repair");
    await expect(page.getByLabel("Active project filters")).toContainText(
      "Status:Needs repair"
    );
    await expect(tableRow(page, "Greenhouse Controller")).toBeVisible();
    await expect(tableRow(page, "Garage Monitor")).toBeHidden();

    await page.getByLabel("Clear Status filter").click();
    await expect(page.getByLabel("Active project filters")).toBeHidden();
    await expect(tableRow(page, "Garage Monitor")).toBeVisible();
  });
});

async function openHarness(page: Page): Promise<void> {
  await page.goto("/browser-harness.html");
  await expect(page.getByRole("banner")).toContainText("Dashboard");
}

async function openView(page: Page, name: "Boards" | "Projects"): Promise<void> {
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function chooseSelectOption(
  page: Page,
  label: "Chip model" | "Status",
  option: string
): Promise<void> {
  await page.getByLabel(label, { exact: true }).click({ force: true });
  await page.getByRole("option", { name: option, exact: true }).click();
}

function tableRow(page: Page, text: string) {
  return page.getByRole("row").filter({ hasText: text });
}
