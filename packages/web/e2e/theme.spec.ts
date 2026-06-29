import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test.describe("theme system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("switching from Dark+ to Light+ updates root background color", async ({ page }) => {
    const root = page.locator("html");
    await expect(root).toHaveCSS("background-color", "rgb(30, 30, 30)");

    const select = page.locator('select[aria-label="Active theme"]');
    await expect(select.locator('option[value="light-plus"]')).toBeAttached();
    await select.selectOption("light-plus");

    await expect(root).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });

  test("UI scale changes root font-size", async ({ page }) => {
    const root = page.locator("html");
    await expect(root).toHaveCSS("font-size", "16px");

    const scaleSelect = page.locator('[data-testid="ui-scale-select"]');
    await scaleSelect.selectOption("150");

    await expect(root).toHaveCSS("font-size", "24px");
  });

  test("importing a valid theme file activates the theme", async ({ page }) => {
    const themePath = join(tmpdir(), "custom-theme.json");
    writeFileSync(
      themePath,
      JSON.stringify({
        name: "Custom E2E",
        type: "dark",
        colors: {
          "editor.background": "#123456",
          "editor.foreground": "#abcdef",
          "sideBar.background": "#123456",
          "panel.background": "#123456",
          "button.background": "#abcdef",
          "button.foreground": "#123456",
          focusBorder: "#abcdef",
          "panel.border": "#abcdef",
          "sideBar.border": "#abcdef",
        },
      }),
    );

    const fileInput = page.locator('[data-testid="theme-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles(themePath);

    const root = page.locator("html");
    await expect(root).toHaveCSS("background-color", "rgb(18, 52, 86)");
  });
});
