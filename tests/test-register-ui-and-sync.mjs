import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../mail-worker/dist");

let currentConfig = {
  register: 0,
  regKey: 0,
  title: "EpoCanvas Mail",
  domainList: ["@epomail.bond", "@epomail.cyou"],
  authI18n: {}
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  
  if (urlPath === "/api/setting/websiteConfig") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      code: 200,
      message: "success",
      data: currentConfig
    }));
    return;
  }

  if (urlPath === "/api/register" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const data = JSON.parse(body || "{}");
      if (currentConfig.register === 1) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 501, message: "regDisabled" }));
        return;
      }
      if (currentConfig.regKey === 0 && !data.code) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: 501, message: "emptyRegKey" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 200, message: "success", data: { regVerifyOpen: false } }));
    });
    return;
  }

  let filePath = path.join(dist, urlPath);
  if (urlPath === "/login/" || urlPath === "/login") {
    filePath = path.join(dist, "login", "index.html");
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(dist, "login", "index.html");
  }
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml"
  };
  res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
  fs.createReadStream(filePath).pipe(res);
});

async function run() {
  await new Promise(resolve => server.listen(8999, resolve));
  console.log("Mock test server running on http://localhost:8999");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", err => {
    console.error("PAGE ERROR:", err);
    pageErrors.push(err.message);
  });
  page.on("console", msg => {
    if (msg.type() === "error") {
      console.error("CONSOLE ERROR:", msg.text());
      pageErrors.push(msg.text());
    }
  });

  try {
    // 1. Scenario A: register=0, regKey=0 (Open with Required Code)
    console.log("=== Scenario A: register=0 (Open), regKey=0 (Required Code) ===");
    currentConfig = {
      register: 0,
      regKey: 0,
      title: "EpoCanvas Mail",
      domainList: ["@epomail.bond", "@epomail.cyou"],
      authI18n: {}
    };

    await page.goto("http://localhost:8999/login/?view=register", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const bodyText = await page.innerText("body");
    if (pageErrors.length > 0) {
      throw new Error(`Page crashed with errors: ${pageErrors.join(", ")}`);
    }

    if (bodyText.includes("当前没有可着陆的节点") || bodyText.includes("未开放公开注册")) {
      throw new Error("False closed registration warning shown when register=0!");
    }

    const codeInput = page.locator("input#epo-code");
    if (await codeInput.count() !== 1) {
      throw new Error("Registration code input was not shown when regKey=0!");
    }
    console.log("✓ Code input visible when regKey=0");

    // Test code prefill from URL
    console.log("Testing invite code URL parameter prefill...");
    await page.goto("http://localhost:8999/login/?view=register&code=EPO_KEY_1234", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const prefilled = await page.locator("input#epo-code").inputValue();
    if (prefilled !== "EPO_KEY_1234") {
      throw new Error(`Invite code not prefilled from URL! Expected EPO_KEY_1234, got ${prefilled}`);
    }
    console.log("✓ Invite code prefilled successfully from URL:", prefilled);

    // 2. Scenario B: Password mismatch check
    console.log("Testing password mismatch client validation...");
    await page.locator("input#epo-email").fill("testuser");
    await page.locator("input#epo-password").fill("Password123!");
    await page.locator("input#epo-confirm-password").fill("Password999!");
    await page.locator("button[type=submit]").click();
    await page.waitForTimeout(500);
    const mismatchText = await page.innerText("body");
    if (!mismatchText.includes("一致") && !mismatchText.includes("match")) {
      throw new Error("Password mismatch warning not triggered!");
    }
    console.log("✓ Password mismatch validated properly");

    // 3. Scenario C: Successful registration
    console.log("Testing successful registration submission...");
    await page.locator("input#epo-confirm-password").fill("Password123!");
    await page.locator("button[type=submit]").click();
    await page.waitForTimeout(2000);
    console.log("URL after successful registration (auto-switch to login):", page.url());
    const hasLoginInput = await page.locator("input#epo-email").count() === 1;
    if (!hasLoginInput) {
      throw new Error("Did not switch back to login view after successful registration!");
    }
    console.log("✓ Registration succeeded and automatically switched to login view");

    // 4. Scenario D: register=0, regKey=1 (Open without Registration Code)
    console.log("=== Scenario D: register=0 (Open), regKey=1 (Disabled Code) ===");
    currentConfig = {
      register: 0,
      regKey: 1,
      title: "EpoCanvas Mail",
      domainList: ["@epomail.bond"],
      authI18n: {}
    };

    await page.goto("http://localhost:8999/login/?view=register", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const noCodeInputCount = await page.locator("input#epo-code").count();
    if (noCodeInputCount !== 0) {
      throw new Error("Code input was shown when regKey=1 (disabled)!");
    }
    console.log("✓ Code input properly hidden when regKey=1");

    // 5. Scenario E: register=1 (Registration Channel Closed)
    console.log("=== Scenario E: register=1 (Closed) ===");
    currentConfig = {
      register: 1,
      regKey: 1,
      title: "EpoCanvas Mail",
      domainList: ["@epomail.bond"],
      authI18n: {}
    };

    await page.goto("http://localhost:8999/login/?view=register", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const closedBody = await page.innerText("body");
    if (!closedBody.includes("未开放公开注册通道") && !closedBody.includes("REGISTRATION CHANNEL CLOSED")) {
      throw new Error("Closed channel notice not shown when register=1!");
    }
    const isBtnDisabled = await page.locator("button[type=submit]").isDisabled();
    if (!isBtnDisabled) {
      throw new Error("Submit button should be disabled when register=1!");
    }
    console.log("✓ Registration closed banner rendered and submit button disabled when register=1");

    // 6. Scenario F: View switching between login and register
    console.log("=== Scenario F: View Switching ===");
    const toLoginLink = page.locator("a", { hasText: /返回登录|Login here/ });
    await toLoginLink.click();
    await page.waitForTimeout(600);
    if (!page.url().includes("/login/")) {
      throw new Error(`URL should be /login/, got ${page.url()}`);
    }

    const toRegisterLink = page.locator("a", { hasText: /探索节点|探索并注册节点|Explore Node/ });
    await toRegisterLink.click();
    await page.waitForTimeout(600);
    if (!page.url().includes("view=register")) {
      throw new Error(`URL should include view=register, got ${page.url()}`);
    }
    console.log("✓ Seamless two-way view switching verified");

    await page.screenshot({ path: "tests/audit_fixed_register_page.png" });
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! ZERO ERRORS!");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  server.close();
  process.exit(1);
});
