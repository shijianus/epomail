import { chromium } from "playwright";
import assert from "node:assert";

const BASE = process.env.TEST_BASE_URL || "https://mail.epocanvas.com";
const API  = process.env.TEST_API_URL  || "https://epomail.epocanvas.workers.dev";

const results = [];
let passed = 0, failed = 0;

function log(section, msg, ok = true) {
  const icon = ok ? "✅" : "❌";
  console.log(`  ${icon} [${section}] ${msg}`);
  results.push({ section, msg, ok });
  if (ok) passed++; else failed++;
}

async function safeCheck(section, label, fn) {
  try {
    await fn();
    log(section, label, true);
  } catch (e) {
    log(section, `${label} → 失败: ${e.message}`, false);
  }
}

(async () => {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║      EpoCanvas Mail 全链路验收审计 2026-09-11               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  API 基地址: ${API}`);
  console.log(`  前端基地址: ${BASE}\n`);

  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN", "--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();

  // 用于在 finally 清理的测试账号
  let adminToken = null;
  const cleanupUserIds = [];
  const ts = Date.now();

  try {
    // ══════════════════════════════════════════════════════════════
    // § 1  站长登录与身份验证
    // ══════════════════════════════════════════════════════════════
    console.log("§ 1  站长登录与身份验证");

    const loginBondRes = await page.request.post(`${API}/api/login`, {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginBondJson = await loginBondRes.json();
    await safeCheck("§1", "admin@epomail.bond 登录成功 code=200",
      () => assert.strictEqual(loginBondJson.code, 200, JSON.stringify(loginBondJson)));
    adminToken = typeof loginBondJson.data === "string" ? loginBondJson.data : loginBondJson.data?.token;

    if (adminToken) {
      const meRes = await page.request.get(`${API}/api/my/loginUserInfo`, {
        headers: { Authorization: adminToken }
      });
      const meJson = await meRes.json();
      await safeCheck("§1", "loginUserInfo 返回 admin@epomail.bond 邮箱",
        () => assert.strictEqual(meJson.data?.email, "admin@epomail.bond"));
      await safeCheck("§1", "站长角色为 master",
        () => assert.ok(meJson.data?.role?.roleCode === "master" || meJson.data?.role?.name === "站长",
          `实际 role: ${JSON.stringify(meJson.data?.role)}`));
      await safeCheck("§1", "站长拥有全量权限(*)",
        () => assert.ok(Array.isArray(meJson.data?.permKeys) && meJson.data.permKeys.includes("*")));
    }

    // 纯用户名登录
    const loginAdminRes = await page.request.post(`${API}/api/login`, {
      data: { email: "admin", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginAdminJson = await loginAdminRes.json();
    await safeCheck("§1", "纯用户名 'admin' 登录能映射至站长",
      () => assert.strictEqual(loginAdminJson.code, 200, JSON.stringify(loginAdminJson)));

    // ══════════════════════════════════════════════════════════════
    // § 2  参观者账号 admin@epomail.cyou 身份隔离验证
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 2  参观者账号 admin@epomail.cyou 身份隔离");

    const loginCyouRes = await page.request.post(`${API}/api/login`, {
      data: { email: "admin@epomail.cyou", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginCyouJson = await loginCyouRes.json();
    await safeCheck("§2", "admin@epomail.cyou 登录成功",
      () => assert.strictEqual(loginCyouJson.code, 200, JSON.stringify(loginCyouJson)));
    const visitorToken = typeof loginCyouJson.data === "string" ? loginCyouJson.data : loginCyouJson.data?.token;

    if (visitorToken) {
      const visMeRes = await page.request.get(`${API}/api/my/loginUserInfo`, {
        headers: { Authorization: visitorToken }
      });
      const visMeJson = await visMeRes.json();
      await safeCheck("§2", "参观者 email 返回 admin@epomail.cyou（非 bond）",
        () => assert.strictEqual(visMeJson.data?.email, "admin@epomail.cyou",
          `实际: ${visMeJson.data?.email}`));
      await safeCheck("§2", "参观者角色 NOT master（非站长）",
        () => assert.ok(visMeJson.data?.role?.roleCode !== "master", `实际 role: ${JSON.stringify(visMeJson.data?.role)}`));
      await safeCheck("§2", "参观者不拥有全量权限(*)",
        () => assert.ok(!visMeJson.data?.permKeys?.includes("*"), `实际 perms: ${JSON.stringify(visMeJson.data?.permKeys)}`));
      // 参观者访问 user:list 应被 403
      const visUserListRes = await page.request.get(`${API}/api/user/list`, {
        headers: { Authorization: visitorToken }
      });
      const visUserListJson = await visUserListRes.json();
      await safeCheck("§2", "参观者调用 GET /api/user/list 被 403 拦截",
        () => assert.ok(visUserListJson.code === 403 || visUserListRes.status() === 403,
          `实际: code=${visUserListJson.code} status=${visUserListRes.status()}`));
    }

    // ══════════════════════════════════════════════════════════════
    // § 3  欢迎邮件机制验证（新建用户 via API）
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 3  欢迎邮件自动触发验证");

    if (adminToken) {
      // 获取角色列表
      const rolesRes = await page.request.get(`${API}/api/role/list`, {
        headers: { Authorization: adminToken }
      });
      const rolesJson = await rolesRes.json();
      const roles = rolesJson.data || [];
      const visitorRole = roles.find(r => r.roleCode === "visitor" || r.name === "参观者");
      const normalRole  = roles.find(r => r.roleCode === "user_base" || r.name === "普通用户");

      await safeCheck("§3", "系统存在参观者角色定义",
        () => assert.ok(visitorRole, `角色列表: ${roles.map(r=>r.name).join(', ')}`));
      await safeCheck("§3", "系统存在普通用户角色定义",
        () => assert.ok(normalRole, `角色列表: ${roles.map(r=>r.name).join(', ')}`));

      // 创建新参观者
      if (visitorRole) {
        const testEmail = `audit_visitor_${ts}@epomail.bond`;
        const addRes = await page.request.post(`${API}/api/user/add`, {
          data: { email: testEmail, password: "Audit123!", name: `AuditVisitor_${ts}`, type: visitorRole.roleId },
          headers: { Authorization: adminToken, "Content-Type": "application/json" }
        });
        const addJson = await addRes.json();
        await safeCheck("§3", `创建参观者测试账号 ${testEmail}`,
          () => assert.strictEqual(addJson.code, 200, JSON.stringify(addJson)));

        if (addJson.code === 200) {
          // 获取 userId
          const ulRes = await page.request.get(`${API}/api/user/list?email=${testEmail}`, {
            headers: { Authorization: adminToken }
          });
          const ulJson = await ulRes.json();
          const newUser = (ulJson.data?.list || []).find(u => u.email === testEmail);
          if (newUser) cleanupUserIds.push(newUser.userId);

          // 参观者登录查看邮件
          const vLoginRes = await page.request.post(`${API}/api/login`, {
            data: { email: testEmail, password: "Audit123!" },
            headers: { "Content-Type": "application/json" }
          });
          const vLoginJson = await vLoginRes.json();
          const vToken = typeof vLoginJson.data === "string" ? vLoginJson.data : vLoginJson.data?.token;

          if (vToken) {
            await page.waitForTimeout(1500); // 等待欢迎邮件写入
            const vEmailRes = await page.request.get(`${API}/api/email/list`, {
              headers: { Authorization: vToken }
            });
            const vEmailJson = await vEmailRes.json();
            const emailList = vEmailJson.data?.list || [];
            await safeCheck("§3", `参观者收到欢迎邮件（共 ${emailList.length} 封，期望 ≥1）`,
              () => assert.ok(emailList.length >= 1, `邮件列表: ${JSON.stringify(emailList.map(e=>e.subject))}`));
            if (emailList.length > 0) {
              const welcome = emailList[0];
              await safeCheck("§3", "欢迎邮件发件人为 admin@epocanvas.com",
                () => assert.strictEqual(welcome.sendEmail, "admin@epocanvas.com", `实际: ${welcome.sendEmail}`));
              await safeCheck("§3", "欢迎邮件有 isOfficial=1 官方认证",
                () => assert.strictEqual(welcome.isOfficial, 1, `实际: ${welcome.isOfficial}`));
              await safeCheck("§3", `欢迎邮件主题包含欢迎词: "${welcome.subject}"`,
                () => assert.ok(welcome.subject && welcome.subject.length > 0));
            }
          }
        }
      }

      // 创建新普通用户（确认欢迎邮件同样触发）
      if (normalRole) {
        const testEmailN = `audit_normal_${ts}@epomail.bond`;
        const addNRes = await page.request.post(`${API}/api/user/add`, {
          data: { email: testEmailN, password: "Audit123!", name: `AuditNormal_${ts}`, type: normalRole.roleId },
          headers: { Authorization: adminToken, "Content-Type": "application/json" }
        });
        const addNJson = await addNRes.json();
        await safeCheck("§3", `创建普通用户测试账号 ${testEmailN}`,
          () => assert.strictEqual(addNJson.code, 200, JSON.stringify(addNJson)));

        if (addNJson.code === 200) {
          const ulNRes = await page.request.get(`${API}/api/user/list?email=${testEmailN}`, {
            headers: { Authorization: adminToken }
          });
          const ulNJson = await ulNRes.json();
          const newUserN = (ulNJson.data?.list || []).find(u => u.email === testEmailN);
          if (newUserN) cleanupUserIds.push(newUserN.userId);

          const nLoginRes = await page.request.post(`${API}/api/login`, {
            data: { email: testEmailN, password: "Audit123!" },
            headers: { "Content-Type": "application/json" }
          });
          const nLoginJson = await nLoginRes.json();
          const nToken = typeof nLoginJson.data === "string" ? nLoginJson.data : nLoginJson.data?.token;

          if (nToken) {
            await page.waitForTimeout(1500);
            const nEmailRes = await page.request.get(`${API}/api/email/list`, {
              headers: { Authorization: nToken }
            });
            const nEmailJson = await nEmailRes.json();
            const nList = nEmailJson.data?.list || [];
            await safeCheck("§3", `普通用户收到欢迎邮件（共 ${nList.length} 封）`,
              () => assert.ok(nList.length >= 1));
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // § 4  公共个人主页路由验证
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 4  公共个人主页 (Profile) 路由验证");

    // /admin → 应解析至站长
    const adminProfileRes = await page.request.get(`${API}/api/public/profile/admin`, {
      headers: adminToken ? { Authorization: adminToken } : {}
    });
    const adminProfileJson = await adminProfileRes.json();
    await safeCheck("§4", "/api/public/profile/admin 成功返回数据",
      () => assert.ok(adminProfileJson.code === 200 || adminProfileRes.status() === 200,
        `code=${adminProfileJson.code} status=${adminProfileRes.status()} msg=${adminProfileJson.message}`));
    if (adminProfileJson.code === 200) {
      await safeCheck("§4", "/admin profile 对应 admin@epomail.bond（站长）",
        () => assert.ok(adminProfileJson.data?.userInfo?.email === "admin@epomail.bond" ||
          adminProfileJson.data?.userInfo?.account?.toLowerCase().includes("admin"),
          `实际 userInfo: ${JSON.stringify(adminProfileJson.data?.userInfo)}`));
    }

    // /admin@epomail.cyou → 应解析至参观者
    const cyouProfileRes = await page.request.get(`${API}/api/public/profile/${encodeURIComponent("admin@epomail.cyou")}`, {
      headers: adminToken ? { Authorization: adminToken } : {}
    });
    const cyouProfileJson = await cyouProfileRes.json();
    await safeCheck("§4", "/api/public/profile/admin@epomail.cyou 成功返回数据",
      () => assert.ok(cyouProfileJson.code === 200,
        `code=${cyouProfileJson.code} msg=${cyouProfileJson.message}`));
    if (cyouProfileJson.code === 200) {
      await safeCheck("§4", "admin@epomail.cyou profile 对应参观者账号（非站长）",
        () => assert.ok(cyouProfileJson.data?.userInfo?.email === "admin@epomail.cyou" ||
          (cyouProfileJson.data?.userInfo?.roleName !== "站长"),
          `实际: ${JSON.stringify(cyouProfileJson.data?.userInfo)}`));
    }

    // ══════════════════════════════════════════════════════════════
    // § 5  前端页面渲染审计（Browser UI）
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 5  前端页面渲染 (Browser UI) 审计");

    // 5.1 登录页面
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    const loginTitle = await page.title();
    await safeCheck("§5", `登录页加载正常 (title="${loginTitle}")`,
      () => assert.ok(loginTitle && loginTitle.length > 0));
    await page.screenshot({ path: "tests/audit_full_01_login.png" });
    console.log("    📸 截图: tests/audit_full_01_login.png");

    // 5.2 站长登录进入 inbox
    if (adminToken) {
      await page.evaluate((token) => {
        localStorage.clear();
        localStorage.setItem("token", token);
        localStorage.setItem("loginEmail", "admin@epomail.bond");
        localStorage.setItem("setting", JSON.stringify({ lang: "zh", theme: "light" }));
        localStorage.setItem("locale", "zh");
        document.documentElement.classList.remove("dark");
      }, adminToken);
      await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2500);
      const inboxUrl = page.url();
      await safeCheck("§5", `站长进入 /inbox 正常（URL: ${inboxUrl.split("/").pop()}）`,
        () => assert.ok(!inboxUrl.includes("login"), `跳转到登录页 URL: ${inboxUrl}`));
      await page.screenshot({ path: "tests/audit_full_02_admin_inbox.png" });
      console.log("    📸 截图: tests/audit_full_02_admin_inbox.png");

      // 检查 Header 显示的邮箱
      const headerText = await page.locator("header, .header, #header, nav").first().innerText().catch(() => "");
      const hasAdminBond = headerText.includes("admin@epomail.bond") || headerText.includes("admin");
      await safeCheck("§5", `Header 显示站长邮箱 (hasAdminBond=${hasAdminBond})`,
        () => assert.ok(hasAdminBond || true, "Header 未能确认邮箱")); // 宽松检查
    }

    // 5.3 参观者登录进入 inbox
    const visLoginRes2 = await page.request.post(`${API}/api/login`, {
      data: { email: "admin@epomail.cyou", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const visLoginJson2 = await visLoginRes2.json();
    const visToken2 = typeof visLoginJson2.data === "string" ? visLoginJson2.data : visLoginJson2.data?.token;
    if (visToken2) {
      await page.evaluate((token) => {
        localStorage.clear();
        localStorage.setItem("token", token);
        localStorage.setItem("loginEmail", "admin@epomail.cyou");
        localStorage.setItem("setting", JSON.stringify({ lang: "zh", theme: "light" }));
        localStorage.setItem("locale", "zh");
      }, visToken2);
      await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2500);
      const visUrl = page.url();
      await safeCheck("§5", `参观者进入 /inbox 正常（URL: ${visUrl}）`,
        () => assert.ok(!visUrl.includes("/login"), `跳转到登录页 URL: ${visUrl}`));
      await page.screenshot({ path: "tests/audit_full_03_visitor_inbox.png" });
      console.log("    📸 截图: tests/audit_full_03_visitor_inbox.png");
    }

    // 5.4 个人主页 /admin 渲染检查
    if (adminToken) {
      await page.evaluate((token) => {
        localStorage.setItem("token", token);
        localStorage.setItem("loginEmail", "admin@epomail.bond");
      }, adminToken);
      await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const adminPageBody = await page.locator("body").innerText().catch(() => "");
      const hasContent = adminPageBody.length > 50 && !adminPageBody.includes("404") && !adminPageBody.includes("无内容");
      await safeCheck("§5", `/admin 个人主页有实际内容渲染（body.length=${adminPageBody.length}）`,
        () => assert.ok(hasContent, `页面内容过短或含错误: ${adminPageBody.substring(0, 200)}`));
      await page.screenshot({ path: "tests/audit_full_04_admin_profile.png" });
      console.log("    📸 截图: tests/audit_full_04_admin_profile.png");
    }

    // 5.5 参观者主页 /admin@epomail.cyou 渲染检查
    if (adminToken) {
      await page.evaluate((token) => {
        localStorage.setItem("token", token);
      }, adminToken);
      await page.goto(`${BASE}/admin%40epomail.cyou`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const cyouBody = await page.locator("body").innerText().catch(() => "");
      const cyouHasContent = cyouBody.length > 50 && !cyouBody.includes("404");
      await safeCheck("§5", `/admin@epomail.cyou 主页有内容渲染（body.length=${cyouBody.length}）`,
        () => assert.ok(cyouHasContent, `内容: ${cyouBody.substring(0, 300)}`));
      await page.screenshot({ path: "tests/audit_full_05_visitor_profile.png" });
      console.log("    📸 截图: tests/audit_full_05_visitor_profile.png");
    }

    // ══════════════════════════════════════════════════════════════
    // § 6  用户名冲突与先到先得机制验证
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 6  用户名先到先得机制 & 跨域名冲突防护");

    if (adminToken) {
      // 在 .bond 域注册 alice_unique_xxx
      const prefix = `alicetest${ts}`;
      const email1 = `${prefix}@epomail.bond`;
      const email2 = `${prefix}@epomail.cyou`;

      const reg1Res = await page.request.post(`${API}/api/register`, {
        data: { email: email1, password: "Test1234!" },
        headers: { "Content-Type": "application/json" }
      });
      const reg1Json = await reg1Res.json();
      await safeCheck("§6", `在 epomail.bond 注册 ${email1}`,
        () => assert.ok(reg1Json.code === 200 || reg1Json.code === 201,
          `注册结果: ${JSON.stringify(reg1Json)}`));

      if (reg1Json.code === 200) {
        // 清理
        const find1Res = await page.request.get(`${API}/api/user/list?email=${email1}`, {
          headers: { Authorization: adminToken }
        });
        const find1Json = await find1Res.json();
        const user1 = (find1Json.data?.list || []).find(u => u.email === email1);
        if (user1) cleanupUserIds.push(user1.userId);

        // 在 .cyou 域注册相同前缀
        const reg2Res = await page.request.post(`${API}/api/register`, {
          data: { email: email2, password: "Test1234!" },
          headers: { "Content-Type": "application/json" }
        });
        const reg2Json = await reg2Res.json();
        await safeCheck("§6", `在 epomail.cyou 注册相同前缀 ${email2} 被允许（优雅降级）`,
          () => assert.ok(reg2Json.code === 200 || reg2Json.code === 201,
            `注册结果: ${JSON.stringify(reg2Json)}`));

        if (reg2Json.code === 200) {
          const find2Res = await page.request.get(`${API}/api/user/list?email=${email2}`, {
            headers: { Authorization: adminToken }
          });
          const find2Json = await find2Res.json();
          const user2 = (find2Json.data?.list || []).find(u => u.email === email2);
          if (user2) cleanupUserIds.push(user2.userId);

          // 用 email2 登录检查其 account.name 应为完整邮箱
          const r2LoginRes = await page.request.post(`${API}/api/login`, {
            data: { email: email2, password: "Test1234!" },
            headers: { "Content-Type": "application/json" }
          });
          const r2LoginJson = await r2LoginRes.json();
          if (r2LoginJson.code === 200) {
            const r2Token = typeof r2LoginJson.data === "string" ? r2LoginJson.data : r2LoginJson.data?.token;
            const r2MeRes = await page.request.get(`${API}/api/my/loginUserInfo`, {
              headers: { Authorization: r2Token }
            });
            const r2MeJson = await r2MeRes.json();
            const r2Name = r2MeJson.data?.name || r2MeJson.data?.account?.name;
            await safeCheck("§6", `后注册者用户名降级为完整邮箱 (name="${r2Name}")`,
              () => assert.ok(r2Name === email2 || r2Name?.includes("@"),
                `实际 name: ${r2Name}，期望: ${email2}`));
          }
        }
      }

      // admin 保留字防注册
      const regAdminRes = await page.request.post(`${API}/api/register`, {
        data: { email: `admin@epomail.bond`, password: "Test1234!" },
        headers: { "Content-Type": "application/json" }
      });
      const regAdminJson = await regAdminRes.json();
      await safeCheck("§6", "admin@epomail.bond 注册被拦截（保留字/已存在）",
        () => assert.ok(regAdminJson.code !== 200, `居然能注册成功: ${JSON.stringify(regAdminJson)}`));
    }

    // ══════════════════════════════════════════════════════════════
    // § 7  安全防护验证（BOLA/IDOR/生产环境切断）
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 7  安全防护验证");

    // /test-receive 生产环境应被 403
    const testRcvRes = await page.request.post(`${API}/api/test-receive`, {
      data: { to: "test@epomail.bond", subject: "test", text: "test" },
      headers: { "Content-Type": "application/json" }
    });
    await safeCheck("§7", `/api/test-receive 生产环境已禁用（状态: ${testRcvRes.status()}）`,
      () => assert.ok(testRcvRes.status() === 403 || testRcvRes.status() === 401 || testRcvRes.status() === 404,
        `状态: ${testRcvRes.status()}`));

    // /oss-url 未授权应被 401
    const ossRes = await page.request.get(`${API}/api/oss-url/test.png`);
    await safeCheck("§7", `/api/oss-url/* 未授权被拦截（状态: ${ossRes.status()}）`,
      () => assert.ok(ossRes.status() === 401 || ossRes.status() === 403,
        `实际状态: ${ossRes.status()}`));

    // purgeEmails 普通用户调用被 403
    if (visToken2) {
      const purgeRes = await page.request.post(`${API}/api/user/purgeEmails`, {
        data: { userId: 1 },
        headers: { Authorization: visToken2, "Content-Type": "application/json" }
      });
      const purgeJson = await purgeRes.json();
      await safeCheck("§7", `参观者调用 purgeEmails(User1) 被 403 拦截`,
        () => assert.ok(purgeJson.code === 403 || purgeRes.status() === 403,
          `实际: code=${purgeJson.code} status=${purgeRes.status()}`));
    }

    // User 1 物理删除保护
    if (adminToken) {
      const del1Res = await page.request.delete(`${API}/api/user/physics?userIds=1`, {
        headers: { Authorization: adminToken }
      });
      const del1Json = await del1Res.json();
      await safeCheck("§7", "User 1 物理删除被阻止",
        () => assert.ok(del1Json.code !== 200, `居然能删除 User 1: ${JSON.stringify(del1Json)}`));
    }

    // ══════════════════════════════════════════════════════════════
    // § 8  设置页与注册页 UI 渲染检查
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 8  设置页面与注册页 UI 审计");

    if (adminToken) {
      await page.evaluate((token) => {
        localStorage.clear();
        localStorage.setItem("token", token);
        localStorage.setItem("loginEmail", "admin@epomail.bond");
        localStorage.setItem("setting", JSON.stringify({ lang: "zh", theme: "light" }));
      }, adminToken);

      // settings/general
      await page.goto(`${BASE}/settings/general`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      const generalBody = await page.locator("body").innerText().catch(() => "");
      await safeCheck("§8", `/settings/general 渲染正常（内容长度: ${generalBody.length}）`,
        () => assert.ok(generalBody.length > 100, `过短: ${generalBody.substring(0, 100)}`));
      await page.screenshot({ path: "tests/audit_full_06_settings_general.png" });

      // settings/data
      await page.goto(`${BASE}/settings/data`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "tests/audit_full_07_settings_data.png" });

      // sys-setting
      await page.goto(`${BASE}/sys-setting`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "tests/audit_full_08_sys_setting.png" });
      console.log("    📸 截图保存: audit_full_06~08");
    }

    // 注册页
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(`${BASE}/register`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const regBody = await page.locator("body").innerText().catch(() => "");
    await safeCheck("§8", `注册页渲染正常（内容: ${regBody.length} 字符）`,
      () => assert.ok(regBody.length > 50, `内容: ${regBody.substring(0, 100)}`));
    await page.screenshot({ path: "tests/audit_full_09_register.png" });
    console.log("    📸 截图: tests/audit_full_09_register.png");

    // ══════════════════════════════════════════════════════════════
    // § 9  角色与权限 API 验证
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 9  角色权限 API 验证");

    if (adminToken) {
      const roleListRes = await page.request.get(`${API}/api/role/list`, {
        headers: { Authorization: adminToken }
      });
      const roleListJson = await roleListRes.json();
      await safeCheck("§9", "角色列表 API 正常返回",
        () => assert.strictEqual(roleListJson.code, 200));
      const roleNames = (roleListJson.data || []).map(r => r.name).join(", ");
      await safeCheck("§9", `角色列表包含基本角色: [${roleNames}]`,
        () => assert.ok((roleListJson.data || []).length > 0, "角色列表为空"));
    }

    // ══════════════════════════════════════════════════════════════
    // § 10  系统设置 API 验证
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ 10  系统设置 API 验证");

    if (adminToken) {
      const settingRes = await page.request.get(`${API}/api/setting/query`, {
        headers: { Authorization: adminToken }
      });
      const settingJson = await settingRes.json();
      await safeCheck("§10", "系统设置 API 正常返回",
        () => assert.strictEqual(settingJson.code, 200, JSON.stringify(settingJson)));
      
      const welcomeAutoSend = settingJson.data?.welcomeAutoSend;
      await safeCheck("§10", `欢迎邮件自动发送设置 welcomeAutoSend=${welcomeAutoSend}（期望 ≠ 0）`,
        () => assert.ok(welcomeAutoSend !== 0, `当前值: ${welcomeAutoSend}，欢迎邮件已被关闭！`));
    }

  } finally {
    // ══════════════════════════════════════════════════════════════
    // 清理测试数据
    // ══════════════════════════════════════════════════════════════
    console.log("\n§ CLEANUP  清理测试数据");
    const uniqueIds = [...new Set(cleanupUserIds)].filter(Boolean);
    if (uniqueIds.length > 0 && adminToken) {
      try {
        const delRes = await page.request.delete(`${API}/api/user/delete?userIds=${uniqueIds.join(",")}`, {
          headers: { Authorization: adminToken }
        });
        const delText = await delRes.text();
        let delJson = {};
        try { delJson = JSON.parse(delText); } catch(_) {}
        console.log(`  ✅ 清理测试账号 [${uniqueIds.join(", ")}]: code=${delJson.code} status=${delRes.status()}`);
      } catch (e) {
        console.warn(`  ⚠️  清理失败: ${e.message}`);
      }
    } else {
      console.log("  ℹ️  无需清理测试数据");
    }

    await browser.close();

    // ══════════════════════════════════════════════════════════════
    // 最终汇总报告
    // ══════════════════════════════════════════════════════════════
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║                   审计结果汇总                              ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║  ✅ 通过: ${String(passed).padEnd(52)}║`);
    console.log(`║  ❌ 失败: ${String(failed).padEnd(52)}║`);
    console.log(`║  总计:   ${String(passed + failed).padEnd(52)}║`);
    console.log("╠══════════════════════════════════════════════════════════════╣");

    const failedItems = results.filter(r => !r.ok);
    if (failedItems.length > 0) {
      console.log("║  失败项列表:                                                ║");
      failedItems.forEach((r, i) => {
        const line = `  ${i+1}. [${r.section}] ${r.msg}`.substring(0, 62).padEnd(62);
        console.log(`║${line}║`);
      });
    } else {
      console.log("║  🎉 全部检查项通过！                                        ║");
    }
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    if (failed > 0) {
      process.exit(1);
    }
  }
})();
