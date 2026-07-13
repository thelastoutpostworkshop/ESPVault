import { expect, test } from "@playwright/test";
import {
  chooseSelectOption,
  chooseSelectOptionContaining,
  openHarness,
  openView,
  tableRow
} from "./helpers";

test.describe("project assignment flow", () => {
  test("creates and edits a project, assigns a board, then clears assignment on delete", async ({
    page
  }) => {
    const projectName = "QA Harness Deployment";
    const updatedProjectName = "QA Harness Deployment Active";
    const boardName = "Workbench ESP32 DevKit";

    await openHarness(page);
    await openView(page, "Projects");

    await page
      .locator(".page-header")
      .getByRole("button", { name: "Add project" })
      .click();

    const addDialog = page.getByRole("dialog").filter({ hasText: "Add project" });
    await expect(addDialog).toBeVisible();
    await addDialog.getByLabel("Project name").fill(projectName);
    await chooseSelectOption(page, "Status", "On hold", addDialog);
    await addDialog
      .getByRole("combobox", { name: "Project location" })
      .fill("QA shelf");
    await addDialog.getByLabel("Notes").fill("Created by Playwright visual flow.");
    await addDialog.getByRole("button", { name: "Save project" }).click();

    await expect(addDialog).toBeHidden();
    await expect(tableRow(page, projectName)).toBeVisible();

    await tableRow(page, projectName).dblclick();

    const editDialog = page.getByRole("dialog").filter({ hasText: "Edit project" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Project name").fill(updatedProjectName);
    await editDialog.getByRole("button", { name: "Save project" }).click();

    await expect(editDialog).toBeHidden();
    await expect(tableRow(page, updatedProjectName)).toContainText("On hold");

    await tableRow(page, updatedProjectName).click();
    await chooseSelectOptionContaining(
      page,
      page.locator(".assign-board-row").getByRole("combobox", { name: "Board" }),
      boardName
    );
    await page.getByRole("button", { name: "Assign" }).click();

    await expect(page.locator(".assigned-board-table")).toContainText(boardName);

    await openView(page, "Boards");
    await chooseSelectOption(page, "Status", "Unassigned to project");
    await expect(tableRow(page, boardName)).toBeHidden();

    await openView(page, "Projects");
    await tableRow(page, updatedProjectName).click();
    await page.getByLabel("Delete project").click();

    const deleteDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Delete project?" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();

    await expect(deleteDialog).toBeHidden();
    await expect(tableRow(page, updatedProjectName)).toBeHidden();

    await openView(page, "Boards");
    await chooseSelectOption(page, "Status", "Unassigned to project");
    await expect(tableRow(page, boardName)).toBeVisible();
  });
});
