/**
 * E2E: Bounty Application Flow
 *
 * Covers the full user journey:
 *   1. Navigate to the bounty list
 *   2. Open a bounty detail page
 *   3. Trigger the application dialog
 *   4. Fill and submit the application form
 *   5. Assert success (dialog closes, no console errors)
 *
 * Stability strategy:
 *   - All network requests are intercepted via page.route() so tests are
 *     hermetic and never depend on an external backend.
 *   - All selectors use data-testid attributes, not CSS class names.
 *   - Timing is handled with await expect(...).toBeVisible() / toBeHidden()
 *     — no arbitrary sleeps.
 *   - The GraphQL mock dispatches on operationName, so adding new queries
 *     never breaks the default `{}` catch-all.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const BOUNTY_ID = "e2e-comp-bounty-01";

const MOCK_BOUNTY_FRAGMENT = {
  __typename: "Bounty",
  id: BOUNTY_ID,
  title: "Add zero-knowledge proof primitives",
  description:
    "Implement basic zero-knowledge proof primitives for private Stellar transactions.",
  status: "OPEN",
  type: "COMPETITION",
  rewardAmount: 2000,
  rewardCurrency: "XLM",
  createdAt: "2025-01-10T09:00:00Z",
  updatedAt: "2025-01-24T14:20:00Z",
  organizationId: "org-privacy-lab",
  projectId: "proj-zkp",
  bountyWindowId: null,
  githubIssueUrl: "https://github.com/stellar-privacy/zkp/issues/3",
  githubIssueNumber: 3,
  createdBy: "user-other",
  organization: {
    __typename: "BountyOrganization",
    id: "org-privacy-lab",
    name: "Stellar Privacy Lab",
    logo: null,
    slug: "stellar-privacy-lab",
  },
  project: {
    __typename: "BountyProject",
    id: "proj-zkp",
    title: "ZKP",
    description: null,
  },
  bountyWindow: null,
  _count: { __typename: "BountyCount", submissions: 0 },
};

const MOCK_SESSION = {
  user: {
    id: "user-e2e-tester",
    name: "E2E Tester",
    email: "e2e@test.com",
    image: null,
  },
  session: { token: "fake-e2e-token" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupMocks(page: Page) {
  // Auth: mock better-auth session endpoints
  await page.route("**/api/auth/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  // GraphQL: dispatch on operationName
  await page.route("**/api/graphql", async (route) => {
    let body: { operationName?: string } = {};
    try {
      body = JSON.parse(route.request().postData() ?? "{}") as {
        operationName?: string;
      };
    } catch {
      // fall through to default
    }

    switch (body.operationName) {
      case "Bounties":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              bounties: {
                bounties: [MOCK_BOUNTY_FRAGMENT],
                total: 1,
                limit: 20,
                offset: 0,
              },
            },
          }),
        });
        return;

      case "Bounty":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              bounty: { ...MOCK_BOUNTY_FRAGMENT, submissions: [] },
            },
          }),
        });
        return;

      case "SubmitToBounty":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              submitToBounty: {
                __typename: "BountySubmissionType",
                id: "sub-e2e-001",
                bountyId: BOUNTY_ID,
                submittedBy: "user-e2e-tester",
                githubPullRequestUrl: "https://github.com/e2e/pr/1",
                status: "SUBMITTED",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                reviewedAt: null,
                reviewedBy: null,
                reviewComments: null,
                paidAt: null,
                rewardTransactionHash: null,
              },
            },
          }),
        });
        return;

      case "TopContributors":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { topContributors: [] } }),
        });
        return;

      case "Leaderboard":
      case "GetLeaderboardUser":
      case "LeaderboardUser":
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              leaderboard: { contributors: [], total: 0, limit: 10, offset: 0 },
              userLeaderboard: null,
            },
          }),
        });
        return;

      default:
        // Catch-all: empty success for any unrecognised operation.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: null }),
        });
    }
  });

  // Inject a fake session cookie so server-side auth checks pass
  await page.context().addCookies([
    {
      name: "boundless_auth.session_token",
      value: "fake-e2e-token",
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Bounty application flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  // ── 1. Navigation ──────────────────────────────────────────────────────

  test("shows bounty list with cards after navigating to /bounty", async ({
    page,
  }) => {
    await page.goto("/bounty");

    await expect(
      page.getByRole("heading", { name: /Explore/i }),
    ).toBeVisible();

    await expect(page.getByTestId("bounty-card").first()).toBeVisible();
  });

  test("navigates from a bounty card to the detail page", async ({ page }) => {
    await page.goto("/bounty");

    // Wait for at least one card to appear
    await expect(page.getByTestId("bounty-card").first()).toBeVisible();

    // Each card is wrapped in <Link href="/bounty/[id]"> which renders as <a>.
    // Use CSS :has() to target only <a> elements that contain a bounty card.
    await page.locator("a:has([data-testid='bounty-card'])").first().click();

    await expect(page).toHaveURL(new RegExp(`/bounty/${BOUNTY_ID}`));
  });

  // ── 2. Detail page & dialog trigger ──────────────────────────────────

  test("renders apply button on detail page for OPEN COMPETITION bounty", async ({
    page,
  }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);

    await expect(page.getByTestId("apply-to-bounty-btn")).toBeVisible();
  });

  test("opens application dialog when apply button is clicked", async ({
    page,
  }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);

    // Dialog must not be visible before clicking
    await expect(
      page.getByTestId("application-dialog"),
    ).not.toBeVisible();

    await page.getByTestId("apply-to-bounty-btn").click();

    await expect(page.getByTestId("application-dialog")).toBeVisible();
  });

  // ── 3. Form validation ────────────────────────────────────────────────

  test("blocks submission when cover letter is empty", async ({ page }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);
    await page.getByTestId("apply-to-bounty-btn").click();
    await expect(page.getByTestId("application-dialog")).toBeVisible();

    // Submit without filling the cover letter
    await page.getByTestId("submit-application-btn").click();

    // zod validation error rendered inside the dialog
    await expect(
      page.getByText(/at least 10 characters/i),
    ).toBeVisible();

    // Dialog stays open on validation failure
    await expect(page.getByTestId("application-dialog")).toBeVisible();
  });

  test("blocks submission when cover letter is too short", async ({ page }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);
    await page.getByTestId("apply-to-bounty-btn").click();

    await page.getByTestId("cover-letter-input").fill("Short");
    await page.getByTestId("submit-application-btn").click();

    await expect(
      page.getByText(/at least 10 characters/i),
    ).toBeVisible();
  });

  test("rejects an invalid portfolio URL", async ({ page }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);
    await page.getByTestId("apply-to-bounty-btn").click();

    await page
      .getByTestId("cover-letter-input")
      .fill("I have deep zkp experience and can deliver this on time.");
    await page.getByTestId("portfolio-url-input").fill("not-a-valid-url");
    await page.getByTestId("submit-application-btn").click();

    await expect(page.getByText(/valid URL/i)).toBeVisible();
  });

  // ── 4. Successful submission ─────────────────────────────────────────

  test("submits application and closes dialog on success", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`/bounty/${BOUNTY_ID}`);

    // Open dialog
    await page.getByTestId("apply-to-bounty-btn").click();
    await expect(page.getByTestId("application-dialog")).toBeVisible();

    // Fill cover letter (> 10 chars, valid)
    await page
      .getByTestId("cover-letter-input")
      .fill(
        "I have extensive experience with zero-knowledge proofs and Stellar " +
          "blockchain development. I have implemented similar systems and can " +
          "deliver this feature on time with comprehensive test coverage.",
      );

    // Fill optional portfolio URL
    await page
      .getByTestId("portfolio-url-input")
      .fill("https://github.com/e2e-tester/zkp-demo");

    // Submit
    await page.getByTestId("submit-application-btn").click();

    // Dialog must close — this is the success state
    await expect(page.getByTestId("application-dialog")).not.toBeVisible();

    // No uncaught JS errors (ignoring known browser noise and library warnings)
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("net::ERR_") &&
        !e.includes("chrome-extension") &&
        // React Query warns when a query returns undefined — expected for
        // leaderboard queries that resolve against our default null mock.
        !e.includes("Query data cannot be undefined"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("submits with only a cover letter (portfolio URL is optional)", async ({
    page,
  }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);

    await page.getByTestId("apply-to-bounty-btn").click();
    await expect(page.getByTestId("application-dialog")).toBeVisible();

    await page
      .getByTestId("cover-letter-input")
      .fill("Experienced zkp engineer, ready to deliver high-quality work.");

    // Leave portfolio URL empty
    await page.getByTestId("submit-application-btn").click();

    await expect(page.getByTestId("application-dialog")).not.toBeVisible();
  });

  // ── 5. UX — form reset ───────────────────────────────────────────────

  test("resets form when dialog is closed and reopened", async ({ page }) => {
    await page.goto(`/bounty/${BOUNTY_ID}`);

    // Open dialog and type something
    await page.getByTestId("apply-to-bounty-btn").click();
    await page
      .getByTestId("cover-letter-input")
      .fill("Some text that should be cleared.");

    // Close via Cancel button
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByTestId("application-dialog")).not.toBeVisible();

    // Reopen
    await page.getByTestId("apply-to-bounty-btn").click();
    await expect(page.getByTestId("application-dialog")).toBeVisible();

    // Cover letter must be empty after reset
    await expect(page.getByTestId("cover-letter-input")).toHaveValue("");
  });
});
