import { test, expect } from '@playwright/test';

test.describe('TaskFlow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Page Load', () => {
    test('should display the app header', async ({ page }) => {
      await expect(page.locator('h1')).toHaveText('TaskFlow');
    });

    test('should show the task form', async ({ page }) => {
      const form = page.locator('[data-testid="task-form"]');
      await expect(form).toBeVisible();
    });
  });

  test.describe('Task Creation', () => {
    test('should create a new task', async ({ page }) => {
      const taskTitle = `Test Task ${Date.now()}`;

      await page.fill('#task-title', taskTitle);
      await page.fill('#task-description', 'Test description');
      await page.click('button[type="submit"]');

      await expect(page.locator('.task-title', { hasText: taskTitle })).toBeVisible({
        timeout: 5000,
      });
    });

    test('should clear form after submission', async ({ page }) => {
      const taskTitle = `Clear Test ${Date.now()}`;

      await page.fill('#task-title', taskTitle);
      await page.click('button[type="submit"]');

      await expect(page.locator('.task-title', { hasText: taskTitle })).toBeVisible();
      await expect(page.locator('#task-title')).toHaveValue('');
    });
  });

  test.describe('Task Management', () => {
    test('should toggle task completion', async ({ page }) => {
      const taskTitle = `Toggle Test ${Date.now()}`;

      await page.fill('#task-title', taskTitle);
      await page.click('button[type="submit"]');

      const taskItem = page.locator('[data-testid="task-item"]', { hasText: taskTitle });
      await expect(taskItem).toBeVisible();

      const checkbox = taskItem.locator('input[type="checkbox"]');
      await expect(checkbox).not.toBeChecked();

      await checkbox.click();
      await expect(checkbox).toBeChecked();
      await expect(taskItem).toHaveClass(/completed/);
    });

    test('should delete a task', async ({ page }) => {
      const taskTitle = `Delete Test ${Date.now()}`;

      await page.fill('#task-title', taskTitle);
      await page.click('button[type="submit"]');

      const taskItem = page.locator('[data-testid="task-item"]', { hasText: taskTitle });
      await expect(taskItem).toBeVisible();

      await taskItem.locator('.task-delete').click();
      await expect(taskItem).not.toBeVisible({ timeout: 5000 });
    });
  });
});
