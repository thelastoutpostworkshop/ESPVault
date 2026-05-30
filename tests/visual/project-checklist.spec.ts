import { expect, type Page, test } from "@playwright/test";
import {
  chooseSelectOption,
  chooseSelectOptionContaining,
  openHarness,
  openView,
  tableRow
} from "./helpers";

test.describe("project checklist flow", () => {
  test("adds, completes, hides, edits, persists, and deletes a checklist item", async ({
    page
  }) => {
    const projectName = "Garage Monitor";
    const linkedBoardName = "Sensor Node S3";
    const checklistTitle = "Verify harness checklist relay";
    const updatedChecklistTitle = "Verify harness checklist relay updated";

    await openHarness(page);
    await openView(page, "Projects");
    await tableRow(page, projectName).click();

    const addRow = page.locator(".checklist-add-row");
    await addRow.getByLabel("New checklist item").fill(checklistTitle);
    await chooseSelectOption(page, "Category", "Testing", addRow);
    await chooseSelectOptionContaining(
      page,
      addRow.getByRole("combobox", { name: "Board" }),
      linkedBoardName
    );
    await addRow.getByRole("button", { name: "Add" }).click();

    const createdItem = checklistItem(page, checklistTitle);
    await expect(createdItem).toBeVisible();
    await expect(createdItem).toContainText("Testing");
    await expect(createdItem).toContainText(linkedBoardName);

    await page.getByLabel(`Mark ${checklistTitle} done`).click();
    await expect(page.getByLabel(`Mark ${checklistTitle} open`)).toBeVisible();

    await page
      .locator(".checklist-show-done")
      .getByRole("checkbox", { name: "Show done" })
      .click({ force: true });
    await expect(createdItem).toBeHidden();
    await expect(page.getByText("Completed items are hidden.")).toBeVisible();

    await page
      .locator(".checklist-show-done")
      .getByRole("checkbox", { name: "Show done" })
      .click({ force: true });
    await expect(createdItem).toBeVisible();

    await createdItem.getByLabel("Edit checklist item").click();
    const editDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Edit checklist item" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Checklist item").fill(updatedChecklistTitle);
    await editDialog.getByLabel("Notes").fill("Updated by Playwright checklist flow.");
    await editDialog.getByRole("button", { name: "Save item" }).click();

    await expect(editDialog).toBeHidden();
    const updatedItem = checklistItem(page, updatedChecklistTitle);
    await expect(updatedItem).toBeVisible();
    await expect(updatedItem).toContainText("Testing");
    await expect(updatedItem).toContainText("Updated by Playwright checklist flow.");

    await page.reload();
    await openView(page, "Projects");
    await tableRow(page, projectName).click();
    await expect(checklistItem(page, updatedChecklistTitle)).toBeVisible();

    await checklistItem(page, updatedChecklistTitle)
      .getByLabel("Delete checklist item")
      .click();
    await expect(checklistItem(page, updatedChecklistTitle)).toBeHidden();
    await expect(page.getByText("No checklist items")).toBeVisible();
  });
});

function checklistItem(page: Page, title: string) {
  return page.locator(".checklist-item").filter({ hasText: title });
}
