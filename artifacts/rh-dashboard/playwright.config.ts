import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4177",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
          args: ["--no-sandbox"],
        },
      },
    },
  ],
  webServer: {
    command:
      "PORT=4177 BASE_PATH=/ VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_ANON_KEY=test-anon pnpm dev",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});