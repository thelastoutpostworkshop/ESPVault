import { expect, test } from "@playwright/test";
import { chooseSelectOption, openHarness, openView, tableRow } from "./helpers";

test.describe("board inventory flow", () => {
  test("creates, edits, persists, and deletes a board", async ({ page }) => {
    const boardName = "QA Harness C6 Board";
    const updatedBoardName = "QA Harness C6 Board Updated";

    await openHarness(page);
    await openView(page, "Boards");

    await page
      .locator(".page-header")
      .getByRole("button", { name: "Add board" })
      .click();

    const addDialog = page.getByRole("dialog").filter({ hasText: "Add board" });
    await expect(addDialog).toBeVisible();
    await addDialog.getByLabel("Board name").fill(boardName);
    await chooseSelectOption(page, "Status", "Needs flashing", addDialog);
    await addDialog.getByLabel("Chip model").fill("ESP32-C6");
    await addDialog.getByLabel("MAC address").fill("AA:BB:CC:DD:EE:01");
    await addDialog.getByLabel("Flash size bytes").fill("8388608");
    await addDialog.getByRole("combobox", { name: "Location" }).fill("QA bench");
    await addDialog.getByLabel("Notes").fill("Created by Playwright visual flow.");
    await addDialog.getByRole("button", { name: "Save board" }).click();

    await expect(addDialog).toBeHidden();
    await expect(tableRow(page, boardName)).toBeVisible();

    await page.reload();
    await openView(page, "Boards");
    await expect(tableRow(page, boardName)).toBeVisible();

    await tableRow(page, boardName).dblclick();

    const editDialog = page.getByRole("dialog").filter({ hasText: "Edit board" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Board name").fill(updatedBoardName);
    await editDialog
      .getByLabel("Notes")
      .fill("Updated by Playwright visual flow.");
    await editDialog.getByRole("button", { name: "Save board" }).click();

    await expect(editDialog).toBeHidden();
    await expect(tableRow(page, updatedBoardName)).toContainText("Needs flashing");

    await tableRow(page, updatedBoardName).click();
    await page.getByLabel("Delete board").click();

    const deleteDialog = page.getByRole("dialog").filter({ hasText: "Delete board?" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();

    await expect(deleteDialog).toBeHidden();
    await expect(tableRow(page, updatedBoardName)).toBeHidden();
  });
});
