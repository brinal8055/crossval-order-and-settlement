import { expect, test } from "@playwright/test";

test("landing page opens the signup form with the expected controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Orders that stay accurate/i })).toBeVisible();
  await page.getByRole("link", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
