import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";

loadDotEnv(resolve(process.cwd(), ".env"));

const API_BASE_URL = stripTrailingSlash(
  process.env.API_GATEWAY_URL ?? process.env.API_BASE_URL ?? "http://localhost:4000",
);
const WEB_BASE_URL = stripTrailingSlash(process.env.WEB_BASE_URL ?? "http://localhost:3000");
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "hana_session";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@local.hana.test";
const ADMIN_STATIC_OTP = process.env.ADMIN_STATIC_OTP;
const screenshotDir = resolve(process.cwd(), "tmp", "web-smoke");
const avatarUploadFixture = resolve(
  process.cwd(),
  "apps",
  "web",
  "public",
  "assets",
  "hana-icon-head.png",
);
const coverUploadFixture = resolve(
  process.cwd(),
  "apps",
  "web",
  "public",
  "assets",
  "hana-hero.png",
);
const dashboardHeadingPattern = /^Your rooms are ready, .+\.$/;

mkdirSync(screenshotDir, { recursive: true });

const results = [];
const consoleErrors = [];
let browser;

try {
  await check("issue admin browser session", async () => {
    const start = await apiJson("/v1/auth/email/start", {
      method: "POST",
      body: {
        mode: "signin",
        email: ADMIN_EMAIL,
        deviceId: "hana-web-smoke-admin",
      },
    });
    const code = start.devCode ?? ADMIN_STATIC_OTP;

    assert(start.verificationId, "admin email verification was not created");
    assert(code, "admin email code was not available for web smoke verification");

    const payload = await apiJson("/v1/auth/email/verify", {
      method: "POST",
      body: {
        email: ADMIN_EMAIL,
        verificationId: start.verificationId,
        code,
        deviceId: "hana-web-smoke-admin",
      },
    });

    assert(payload.sessionToken, "admin auth did not return a session token");
    globalThis.adminSessionToken = payload.sessionToken;

    return "session ready";
  });

  await check("seeded web test character ready", async () => {
    const recommended = await apiJson("/v1/characters/recommended");
    const character =
      recommended.characters.find((item) => item.name === "Yuna Bloom") ??
      recommended.characters.find((item) => !item.monetizationEnabled || item.priceCents === 0);

    assert(character?.id, "seeded local cast is missing; run pnpm seed:local before web smoke");

    globalThis.createdCharacterId = character.id;
    globalThis.seedCharacterName = character.name;

    return `${character.name} (${character.id})`;
  });

  browser = await chromium.launch({ headless: true });

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktopContext.newPage();
  wireConsoleCapture(page);

  await check("landing page desktop", async () => {
    await page.goto(`${WEB_BASE_URL}/`, { waitUntil: "load" });
    await expectVisible(
      page.getByRole("heading", { name: "Chat with characters who remember you." }),
    );
    await assertLandingCtasUseCurrentOrigin(page);
    await assertNoBrokenImages(page);
    await assertNoHorizontalOverflow(page);
    await screenshot(page, "landing-desktop.png");

    return "hero, pricing, legal links visible";
  });

  await check("auth page consumer copy", async () => {
    await page.goto(`${WEB_BASE_URL}/auth`, { waitUntil: "load" });
    await expectVisible(page.getByRole("heading", { name: "Your characters are waiting." }));
    const bodyText = await page.locator("main").innerText();

    assert(
      !/(phone verification|free limits|adult gates|anti-alt|tech stack|architecture)/i.test(
        bodyText,
      ),
      "auth page still exposes internal product/security language",
    );
    await assertNoHorizontalOverflow(page);
    await screenshot(page, "auth-desktop.png");

    return "copy stays consumer-facing";
  });

  await check("signed-out legal navigation", async () => {
    await page.goto(`${WEB_BASE_URL}/legal/terms`, { waitUntil: "load" });
    await expectVisible(page.getByRole("heading", { name: "Terms of Service" }));
    const legalNav = page.locator("header.legal-nav");

    await expectVisible(legalNav.getByRole("link", { name: "Sign in", exact: true }));
    assert(
      (await legalNav.getByRole("link", { name: "Dashboard", exact: true }).count()) === 0,
      "signed-out legal nav should not show Dashboard",
    );
    await assertNoHorizontalOverflow(page);

    return "public legal pages show sign-in CTA before auth";
  });

  await addSessionCookie(desktopContext, globalThis.adminSessionToken);

  await check("landing CTA switches for signed-in users", async () => {
    await page.goto(`${WEB_BASE_URL}/`, { waitUntil: "load" });
    await expectVisible(page.getByRole("link", { name: "Dashboard", exact: true }));
    await expectVisible(page.getByRole("link", { name: "Go to dashboard" }).first());
    await assertLandingCtasUseCurrentOrigin(page);

    return "base URL points authenticated users to dashboard";
  });

  await check("app dashboard", async () => {
    await page.goto(`${WEB_BASE_URL}/app`, { waitUntil: "load" });
    await expectVisible(page.getByRole("heading", { name: dashboardHeadingPattern }));
    await expectVisible(page.getByLabel("App navigation").getByRole("link", { name: "Discover" }));
    await expectVisible(page.getByLabel("App navigation").getByRole("link", { name: "Create" }));
    await assertNoBrokenImages(page);
    await assertNoHorizontalOverflow(page);
    await screenshot(page, "dashboard-desktop.png");

    return "authenticated shell loaded";
  });

  await check("search stays page-scoped", async () => {
    await page.goto(`${WEB_BASE_URL}/app`, { waitUntil: "load" });
    assert(
      (await page.getByLabel("Search Hana Chat").count()) === 0,
      "home should not render the global character search",
    );

    await page.goto(`${WEB_BASE_URL}/app/chat`, { waitUntil: "load" });
    assert(
      (await page.getByLabel("Search Hana Chat").count()) === 0,
      "chat should not render the global character search",
    );

    await page.goto(`${WEB_BASE_URL}/app/discover`, { waitUntil: "load" });
    await expectVisible(page.getByRole("heading", { name: "Find your next favorite character." }));
    assert(
      (await page.getByLabel("Search Hana Chat").count()) === 0,
      "discover should not render the shell search",
    );
    assert(
      (await page.getByLabel("Search characters").count()) === 1,
      "discover should render exactly one marketplace search",
    );
    await expectVisible(page.getByLabel("Search characters"));

    return "app shell has no duplicate search; marketplace owns search";
  });

  const characterName = globalThis.seedCharacterName;

  await check("creator studio media and form controls", async () => {
    await page.goto(`${WEB_BASE_URL}/app/create`, { waitUntil: "load" });
    await page.getByLabel("Character name").fill("Preview Only");
    await page
      .getByLabel("Marketplace description")
      .fill("A polished preview character for authenticated end-to-end testing.");
    await clickBuilderStep(page, "Look");
    await page.getByTestId("avatar-file-input").setInputFiles(avatarUploadFixture);
    await expectVisible(page.getByText("Profile image uploaded."));
    await page.getByTestId("cover-file-input").setInputFiles(coverUploadFixture);
    await expectVisible(page.getByText("Cover image uploaded."));
    await clickBuilderStep(page, "Persona");
    await page
      .getByLabel("Core persona")
      .fill("You are a concise premium companion used for product-grade smoke testing.");
    await page.getByLabel("Scenario").fill("A smoke-test scene with stable creator controls.");
    await page.getByLabel("Speaking style").fill("concise, polished, warm");
    await page.getByLabel("Greeting").fill("You made it back. I kept the scene warm.");
    await clickBuilderStep(page, "Publish");
    await page.getByRole("button", { name: /Rating/ }).click();
    await page.getByRole("option", { name: "Teen" }).click();
    const paidPrice = page.getByLabel("Paid price");
    if (await paidPrice.isEnabled()) {
      await paidPrice.fill("0");
    } else {
      await expectVisible(page.getByText("Paid access coming soon"));
    }
    await assertNoHorizontalOverflow(page);
    await screenshot(page, "creator-studio-controls.png");

    return "media upload controls and builder layout work without creating smoke bots";
  });

  await check("marketplace shows seeded character", async () => {
    await page.goto(`${WEB_BASE_URL}/app/discover?query=${encodeURIComponent(characterName)}`, {
      waitUntil: "load",
    });
    await expectVisible(page.getByRole("heading", { name: characterName }));
    await screenshot(page, "discover-seeded-character.png");

    return "search result rendered";
  });

  await check("chat sends and receives", async () => {
    await page.goto(
      `${WEB_BASE_URL}/app/chat?characterId=${encodeURIComponent(globalThis.createdCharacterId)}&new=1`,
      { waitUntil: "load" },
    );
    await expectVisible(page.getByRole("heading", { name: characterName }));
    await expectVisible(page.getByText("fresh room"));
    const composer = page.getByLabel(`Message ${characterName}`);
    await composer.fill("my name is BrowserTester and I care about premium UX.");
    await sendCurrentDraftAndWaitForReply(page, 60_000);
    await page.getByRole("button", { name: "Chat settings" }).click();
    await expectVisible(page.getByRole("heading", { name: "Evolving profile" }));
    await expectVisible(page.getByRole("heading", { name: "Private tuning prompt" }));
    await expectVisible(page.getByRole("heading", { name: "Live context" }));
    await screenshot(page, "chat-desktop.png");

    return "message round trip and chat settings work";
  });

  await check("same character supports multiple rooms", async () => {
    await page.goto(
      `${WEB_BASE_URL}/app/chat?characterId=${encodeURIComponent(globalThis.createdCharacterId)}&new=1`,
      { waitUntil: "load" },
    );
    await expectVisible(page.getByRole("heading", { name: characterName }));
    await expectVisible(page.getByText("fresh room"));
    await page.getByLabel(`Message ${characterName}`).fill("Start a second room for routing QA.");
    await sendCurrentDraftAndWaitForReply(page, 60_000);
    await page.goto(`${WEB_BASE_URL}/app/chat`, { waitUntil: "load" });
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll(".chat-thread-title strong")).filter(
          (node) => node.textContent?.trim() === name,
        ).length >= 2,
      characterName,
      { timeout: 15_000 },
    );

    return "fresh-room links preserve older same-character rooms";
  });

  await check("chat room delete removes selected room", async () => {
    await page.goto(
      `${WEB_BASE_URL}/app/chat?characterId=${encodeURIComponent(globalThis.createdCharacterId)}&new=1`,
      { waitUntil: "load" },
    );
    await expectVisible(page.getByRole("heading", { name: characterName }));
    await page.getByLabel(`Message ${characterName}`).fill("Temporary room for delete QA.");
    await sendCurrentDraftAndWaitForReply(page, 60_000);
    const deletedConversationUrl = page.url();

    await page.getByRole("button", { name: "Chat settings", exact: true }).click();
    await expectVisible(page.getByRole("heading", { name: "Delete chat" }));
    await page.getByRole("button", { name: "Delete chat" }).click();
    await page.getByRole("button", { name: "Delete forever" }).click();
    await expectVisible(page.getByRole("heading", { name: "Your rooms" }));
    await assertNoHorizontalOverflow(page);

    await page.goto(deletedConversationUrl, { waitUntil: "load" });
    await expectVisible(page.getByText("That room is not available on this account."));

    return "selected conversation is hidden after confirmed delete";
  });

  await check("chat settings add and remove memory", async () => {
    const memoryText = `Browser smoke memory ${Date.now().toString().slice(-6)}`;
    await page.goto(
      `${WEB_BASE_URL}/app/chat?characterId=${encodeURIComponent(globalThis.createdCharacterId)}`,
      { waitUntil: "load" },
    );
    await waitForChatCharacterReady(page, characterName);
    await openChatSettings(page);
    await page
      .getByPlaceholder("Save a private note this character should remember in this chat.")
      .fill(memoryText);
    await page.getByRole("button", { name: "Add memory" }).click();
    const row = page.locator(".memory-editor-card").filter({ hasText: memoryText });
    await expectVisible(row);
    await row.getByRole("button", { name: "Remove" }).click();
    await page.waitForFunction(
      (text) =>
        !Array.from(document.querySelectorAll(".memory-editor-card")).some((article) =>
          article.textContent?.includes(text),
        ),
      memoryText,
      { timeout: 15_000 },
    );

    return "per-chat memory lifecycle works";
  });

  await check("settings profile, plan, and safety controls", async () => {
    const displayName = `Web Tester ${Date.now().toString().slice(-5)}`;
    await page.goto(`${WEB_BASE_URL}/app/settings`, { waitUntil: "load" });
    await page.getByLabel("Display name").fill(displayName);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/settings") &&
          response.request().method() === "PATCH" &&
          response.ok(),
        { timeout: 15_000 },
      ),
      page.getByRole("button", { name: "Save profile" }).click(),
    ]);
    await expectVisible(page.getByText("Saved."));
    await waitForDisplayName(displayName);

    await page.getByRole("button", { name: "View plans" }).click();
    await expectVisible(page.getByRole("heading", { name: "Hana Plus" }));

    const switchCount = await page.locator('[role="switch"]').count();
    assert(switchCount === 2, `expected 2 account switches, got ${switchCount}`);

    return "profile saves, plan scrolls, switches render";
  });

  await check("legal pages", async () => {
    const pages = [
      ["/legal/terms", "Terms of Service"],
      ["/legal/privacy", "Privacy Policy"],
      ["/legal/community", "Community Rules"],
      ["/legal/safety", "Safety and Mature Content"],
    ];

    for (const [path, heading] of pages) {
      await page.goto(`${WEB_BASE_URL}${path}`, { waitUntil: "load" });
      await expectVisible(page.getByRole("heading", { name: heading }));
      await assertLegalNavShowsDashboard(page);
    }

    await page.goto(`${WEB_BASE_URL}/legal/refunds`, { waitUntil: "domcontentloaded" });
    await expectVisible(page.getByRole("heading", { name: "Billing and Refund Policy" }));
    await assertLegalNavShowsDashboard(page);
    await expectVisible(
      page.locator("footer.legal-support").getByRole("link", {
        name: "support@hanachat.site",
        exact: true,
      }),
    );

    return "terms, refunds, privacy, community, safety, signed-in nav";
  });

  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  await addSessionCookie(mobileContext, globalThis.adminSessionToken);
  const mobilePage = await mobileContext.newPage();
  wireConsoleCapture(mobilePage);

  await check("mobile landing and app layout", async () => {
    await mobilePage.goto(`${WEB_BASE_URL}/`, { waitUntil: "load" });
    await expectVisible(
      mobilePage.getByRole("heading", { name: "Chat with characters who remember you." }),
    );
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "landing-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app`, { waitUntil: "load" });
    await expectVisible(mobilePage.getByRole("heading", { name: dashboardHeadingPattern }));
    assert(
      (await mobilePage.getByLabel("Search Hana Chat").count()) === 0,
      "mobile dashboard should not render the global character search",
    );
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "dashboard-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app/chat`, { waitUntil: "load" });
    await expectVisible(mobilePage.getByRole("heading", { name: "Your rooms" }));
    assert(
      (await mobilePage.getByLabel("Search Hana Chat").count()) === 0,
      "mobile chat should not render the global character search",
    );
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "chat-mobile.png");

    await mobilePage.goto(
      `${WEB_BASE_URL}/app/chat?characterId=${encodeURIComponent(globalThis.createdCharacterId)}&new=1`,
      { waitUntil: "load" },
    );
    await expectVisible(mobilePage.getByRole("heading", { name: characterName }));
    await mobilePage.getByRole("button", { name: "Chat settings", exact: true }).click();
    await expectVisible(mobilePage.getByRole("heading", { name: "Evolving profile" }));
    await expectVisible(mobilePage.getByRole("heading", { name: "Private tuning prompt" }));
    await assertPanelCoversViewport(mobilePage, ".chat-settings-panel");
    await assertElementCanScrollWhenOverflowing(mobilePage, ".chat-settings-panel");
    await screenshot(mobilePage, "chat-settings-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app/discover`, { waitUntil: "domcontentloaded" });
    await expectVisible(
      mobilePage.getByRole("heading", { name: "Find your next favorite character." }),
    );
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "discover-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app/create`, { waitUntil: "domcontentloaded" });
    await expectVisible(
      mobilePage.getByRole("heading", { name: "Build a character people come back to." }),
    );
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "create-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app/settings`, { waitUntil: "domcontentloaded" });
    await expectVisible(mobilePage.getByRole("heading", { name: "Make Hana feel yours." }));
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "settings-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app/wallet`, { waitUntil: "domcontentloaded" });
    await expectVisible(
      mobilePage.getByRole("heading", { name: "Earn from characters people love." }),
    );
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "wallet-mobile.png");

    await mobilePage.goto(`${WEB_BASE_URL}/app/admin`, { waitUntil: "domcontentloaded" });
    await expectVisible(mobilePage.getByRole("heading", { name: "Command center." }));
    await assertNoHorizontalOverflow(mobilePage);
    await screenshot(mobilePage, "admin-mobile.png");

    return "core app pages fit 390px; settings panel is fullscreen and scrollable";
  });

  await mobileContext.close();

  const tabletContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: true,
  });
  await addSessionCookie(tabletContext, globalThis.adminSessionToken);
  const tabletPage = await tabletContext.newPage();
  wireConsoleCapture(tabletPage);

  await check("tablet chat settings and admin metrics layout", async () => {
    await tabletPage.goto(
      `${WEB_BASE_URL}/app/chat?characterId=${encodeURIComponent(globalThis.createdCharacterId)}&new=1`,
      { waitUntil: "load" },
    );
    await expectVisible(tabletPage.getByRole("heading", { name: characterName }));
    await tabletPage
      .getByLabel(`Message ${characterName}`)
      .fill("Tablet settings smoke room for layout QA.");
    await sendCurrentDraftAndWaitForReply(tabletPage, 60_000);
    await expectVisible(tabletPage.getByRole("button", { name: "Chat settings", exact: true }));
    await tabletPage.getByRole("button", { name: "Chat settings", exact: true }).click();
    await expectVisible(tabletPage.getByRole("heading", { name: "Delete chat" }));
    await assertPanelCoversViewport(tabletPage, ".chat-settings-panel");
    await assertElementCanScrollWhenOverflowing(tabletPage, ".chat-settings-panel");
    await assertNoHorizontalOverflow(tabletPage);
    await screenshot(tabletPage, "chat-settings-tablet.png");

    await tabletPage.goto(`${WEB_BASE_URL}/app/admin`, { waitUntil: "domcontentloaded" });
    await expectVisible(tabletPage.getByRole("heading", { name: "Product pulse", exact: true }));
    await expectVisible(tabletPage.locator(".admin-pulse-board").first());
    await assertNoHorizontalOverflow(tabletPage);
    await screenshot(tabletPage, "admin-tablet.png");

    return "settings sheet is viewport-bound; admin pulse bento fits tablet";
  });

  await tabletContext.close();

  await check("browser console health", async () => {
    const relevantErrors = consoleErrors.filter(
      (entry) => !/favicon|DevTools|React DevTools/i.test(entry.message),
    );

    assert(
      relevantErrors.length === 0,
      `console/page errors: ${relevantErrors.map((entry) => entry.message).join(" | ")}`,
    );

    return "no captured console errors";
  });
} finally {
  if (browser) {
    await browser.close();
  }
}

printSummary();

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
}

async function addSessionCookie(context, sessionToken) {
  await context.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      url: WEB_BASE_URL,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    },
  ]);
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`API ${path} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function waitForDisplayName(displayName, timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const settings = await apiJson("/v1/settings", {
      headers: { Authorization: `Bearer ${globalThis.adminSessionToken}` },
    });

    if (settings.displayName === displayName) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`display name did not persist as ${displayName}`);
}

async function check(name, fn) {
  const startedAt = Date.now();

  try {
    const detail = await fn();
    results.push({ name, status: "pass", ms: Date.now() - startedAt, detail });
    console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "fail", ms: Date.now() - startedAt, detail: message });
    console.error(`FAIL ${name} - ${message}`);
  }
}

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
}

async function clickBuilderStep(page, label) {
  await page
    .locator("button.builder-step-tab")
    .filter({ has: page.locator("strong", { hasText: label }) })
    .click({ timeout: 15_000 });
}

async function sendCurrentDraftAndWaitForReply(page, timeoutMs = 60_000) {
  const assistantCountBefore = await page.locator(".message-row.assistant").count();
  await page.getByRole("button", { name: "Send message" }).click();
  await waitForChatAssistantReply(page, assistantCountBefore, timeoutMs);
  await waitForChatTurnSettled(page, timeoutMs);
}

async function waitForChatAssistantReply(page, previousCount, timeoutMs = 60_000) {
  await page.waitForFunction(
    (count) => {
      const bubbles = Array.from(
        document.querySelectorAll(".message-row.assistant .message-bubble"),
      );

      return (
        bubbles.length > count &&
        bubbles.slice(count).some((bubble) => (bubble.textContent ?? "").trim().length > 8)
      );
    },
    previousCount,
    { timeout: timeoutMs },
  );
}

async function waitForChatTurnSettled(page, timeoutMs = 60_000) {
  await page.waitForFunction(
    () => new URL(window.location.href).searchParams.has("conversationId"),
    undefined,
    { timeout: timeoutMs },
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".typing-indicator").length === 0,
    undefined,
    { timeout: timeoutMs },
  );
}

async function waitForChatCharacterReady(page, characterName, timeoutMs = 15_000) {
  await expectVisible(page.getByRole("heading", { name: characterName }));
  await page.waitForFunction(
    (name) => {
      const title = document.querySelector(".chat-room-header h2")?.textContent?.trim();
      const roomMeta = document.querySelector(".chat-room-header p")?.textContent ?? "";

      return title === name && /fresh room| room /.test(roomMeta);
    },
    characterName,
    { timeout: timeoutMs },
  );
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

async function openChatSettings(page) {
  const panel = page.locator(".chat-settings-panel");

  if (
    !(await panel
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByRole("button", { name: "Chat settings", exact: true }).click();
  }

  await expectVisible(panel);
  await expectVisible(page.getByRole("heading", { name: "Evolving profile" }));
}

async function assertNoBrokenImages(page) {
  const brokenImages = await page.evaluate(() =>
    Array.from(document.images)
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src || image.alt),
  );

  assert(brokenImages.length === 0, `broken images: ${brokenImages.join(", ")}`);
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  assert(
    metrics.scrollWidth <= metrics.viewportWidth + 1,
    `horizontal overflow ${metrics.scrollWidth}px > ${metrics.viewportWidth}px`,
  );
}

async function assertLandingCtasUseCurrentOrigin(page) {
  const ctas = await page.evaluate(() => {
    const origin = window.location.origin;
    const links = Array.from(
      document.querySelectorAll(
        "header a.nav-cta, .hero-actions a.primary-action, .pricing-card a.full-width",
      ),
    );

    return links.map((link) => ({
      label: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
      href: link.href,
      currentOrigin: origin,
    }));
  });

  const offOrigin = ctas.filter((cta) => !cta.href.startsWith(`${cta.currentOrigin}/`));
  const productionLeaked = ctas.filter((cta) => /app\.hanachat\.live/i.test(cta.href));

  assert(offOrigin.length === 0, `landing CTA off current origin: ${JSON.stringify(offOrigin)}`);
  assert(
    productionLeaked.length === 0,
    `landing CTA leaked production app domain: ${JSON.stringify(productionLeaked)}`,
  );
}

async function assertLegalNavShowsDashboard(page) {
  const legalNav = page.locator("header.legal-nav");
  const dashboardLink = legalNav.getByRole("link", { name: "Dashboard", exact: true });

  await expectVisible(dashboardLink);
  assert(
    (await legalNav.getByRole("link", { name: "Sign in", exact: true }).count()) === 0,
    "signed-in legal nav should not show Sign in",
  );

  const href = await dashboardLink.getAttribute("href");
  assert(href, "signed-in legal nav Dashboard link is missing href");
  const resolved = new URL(href, WEB_BASE_URL);
  const expectedOrigin = new URL(WEB_BASE_URL).origin;

  assert(
    resolved.origin === expectedOrigin,
    `signed-in legal nav should stay on current origin: ${resolved.href}`,
  );
  assert(
    resolved.pathname === "/app",
    `signed-in legal nav should point to /app: ${resolved.href}`,
  );
}

async function assertPanelCoversViewport(page, selector) {
  const metrics = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  assert(metrics.left <= 1, `panel left edge starts at ${metrics.left}px`);
  assert(metrics.top <= 1, `panel top edge starts at ${metrics.top}px`);
  assert(
    metrics.width >= metrics.viewportWidth - 2,
    `panel width ${metrics.width}px < viewport ${metrics.viewportWidth}px`,
  );
  assert(
    metrics.height >= metrics.viewportHeight - 2,
    `panel height ${metrics.height}px < viewport ${metrics.viewportHeight}px`,
  );
}

async function assertElementCanScrollWhenOverflowing(page, selector) {
  const metrics = await page.locator(selector).evaluate((element) => {
    const style = window.getComputedStyle(element);
    const before = element.scrollTop;
    element.scrollTop = element.scrollHeight;
    const after = element.scrollTop;
    element.scrollTop = before;

    return {
      before,
      after,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
    };
  });

  assert(
    metrics.overflowY !== "hidden",
    `${selector} prevents vertical scroll with overflow-y: ${metrics.overflowY}`,
  );

  if (metrics.scrollHeight > metrics.clientHeight + 1) {
    assert(
      metrics.after > metrics.before,
      `${selector} overflows ${metrics.scrollHeight}px > ${metrics.clientHeight}px but cannot scroll`,
    );
  }
}

async function screenshot(page, fileName) {
  await page.screenshot({
    path: resolve(screenshotDir, fileName),
    fullPage: false,
    caret: "initial",
  });
}

function wireConsoleCapture(page) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({ type: "console", message: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push({ type: "pageerror", message: error.message });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      consoleErrors.push({
        type: "response",
        message: `${response.status()} ${response.url()}`,
      });
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function loadDotEnv(path) {
  if (!existsSync(path)) {
    return;
  }

  const source = readFileSync(path, "utf8");

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey.trim();
    let value = rawValue.join("=").trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function printSummary() {
  const passed = results.filter((result) => result.status === "pass").length;
  const failed = results.length - passed;

  console.log("");
  console.log(`Web smoke summary: ${passed} passed, ${failed} failed`);
  console.log(`Screenshots: ${screenshotDir}`);

  for (const result of results) {
    console.log(
      `${result.status.toUpperCase().padEnd(4)} ${String(result.ms).padStart(5)}ms ${result.name}${
        result.detail ? ` - ${result.detail}` : ""
      }`,
    );
  }
}
