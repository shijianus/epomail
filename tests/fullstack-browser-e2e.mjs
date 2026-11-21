/**
 * Browser end-to-end test against a real local stack.
 *
 * Unlike tests/oauth-bind-login-ui-e2e.mjs this does NOT mock /api/**: it runs
 * `wrangler dev` on a throwaway D1/KV directory, builds nothing itself (the
 * committed dist must already exist), and drives Chromium through the actual
 * login app and the actual mail app.
 *
 * What it proves:
 *   - the login app posts to the real /api/login and stores a real session;
 *   - the post-login URL (/mail/u/N/#inbox) is understood by the mail app's
 *     custom account history and lands on the inbox, not on the profile/404
 *     fallback;
 *   - the mailbox APIs answer with 200 during that first render;
 *   - the security settings page renders its linked-identity section from the
 *     real /api/my/oauthIdentities response;
 *   - removing the stored token sends the user back to /login/.
 *
 * Usage: node tests/fullstack-browser-e2e.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { withLocalStack } from './helpers/local-stack.mjs';

const results = [];
const failures = [];
function check(name, fn) {
	try {
		fn();
		results.push(`PASS ${name}`);
	} catch (err) {
		failures.push(`${name}: ${err.message}`);
		results.push(`FAIL ${name}: ${err.message}`);
		throw err;
	}
}

// An older stored official message used white text over an inline gradient
// and fixed-width content. Sending those bytes through the API also exercises
// the reader for existing HTML after an upgrade.
const legacyBrandSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="76" height="76">
	<defs><linearGradient id="epomailLogoGrad"><stop offset="0%" stop-color="#00F5D4"/></linearGradient>
	<mask id="epomailCutout"><rect width="100%" height="100%" fill="white"/></mask></defs>
	<path d="M10 10h100v100z" fill="url(#epomailLogoGrad)" mask="url(#epomailCutout)"/>
</svg>`;
const legacyNotice = {
	subject: 'Stored official mail layout',
	content: `<div style="width:100%;max-width:100%">
		<div style="background:linear-gradient(135deg,#0078D4,#4338ca);padding:40px 42px">
			<h1 style="font-size:26px;color:#fff">Stored welcome heading</h1>
			<p style="font-size:14.5px;color:rgba(255,255,255,0.95)">Stored welcome paragraph</p>
			<div style="width:92px;height:92px;border-radius:22px;background:rgba(255,255,255,0.18);border:1px solid #aaa">
				${legacyBrandSvg}
			</div>
		</div>
		<div style="display:flex;flex-wrap:wrap">
			<div style="min-width:300px">Service information</div>
			<div style="width:300px">Mailbox information</div>
		</div>
	</div>`
};

const ordinaryMail = {
	subject: 'Ordinary mail privacy fixture',
	content: `<h2>Meeting update</h2><p>Friday at nine</p>
    <table width="2600"><tr><td>Wide report</td><td>Last column</td></tr></table>
    <table width="700"><tr><td>Meeting agenda</td></tr></table>
    <p>End of report</p>${legacyBrandSvg}<img src="https://tracker.invalid/epomail-reader-check.png" alt="">`
};

async function sendReaderFixtures(page) {
	await page.evaluate(async ({ notice, ordinary }) => {
		const session = JSON.parse(sessionStorage.getItem('epomail_tab_identity'));
		async function request(route, body) {
			const response = await fetch('/api/' + route, {
				method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', token: session.token },
				body: body ? JSON.stringify(body) : undefined
			});
			const result = await response.json();
			if (response.status !== 200 || result.code !== 200) throw new Error('Fixture failed at ' + route);
			return result.data;
		}
		await request('setting/sendGlobalEmail', { ...notice, targetType: 'all' });
		const accounts = await request('account/list');
		await request('email/send', {
			...ordinary, accountId: (accounts.list ?? accounts)[0].accountId, receiveEmail: ['admin@example.com'],
			text: 'Friday at nine', sendType: 0, attachments: [], idempotencyKey: 'reader-e2e-ordinary'
		});
	}, { notice: legacyNotice, ordinary: ordinaryMail });
}

async function measureMailText(locator) {
	await locator.scrollIntoViewIfNeeded();
	return locator.evaluate(element => {
		const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		ctx.canvas.width = ctx.canvas.height = 1;
		function rgba(color) {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, 1, 1);
			return ctx.getImageData(0, 0, 1, 1).data;
		}
		function over(color, background) {
			const [r, g, b, alpha] = rgba(color);
			return [r, g, b].map((channel, i) => (channel * alpha + background[i] * (255 - alpha)) / 255);
		}
		function luminance(channels) {
			const [r, g, b] = channels.map(value => {
				const s = value / 255;
				return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		}
		const colors = [];
		for (let node = element; node; node = node.parentElement ?? node.getRootNode().host) {
			colors.push(getComputedStyle(node).backgroundColor);
		}
		const backdrop = colors.reverse().reduce((bg, color) => over(color, bg), [255, 255, 255]);
		const style = getComputedStyle(element);
		const values = [luminance(backdrop), luminance(over(style.color, backdrop))].sort((a, b) => b - a);
		const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let text;
		do { text = texts.nextNode(); } while (text && !text.textContent.trim());
		if (!text) throw new Error('Empty mail text');
		const range = document.createRange();
		const first = text.textContent.search(/\S/);
		range.setStart(text, first);
		range.setEnd(text, first + 1);
		const rect = range.getBoundingClientRect();
		return {
			font: parseFloat(style.fontSize) * element.currentCSSZoom,
			glyphHeight: rect.height,
			visible: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom > 0 && rect.top < innerHeight,
			contrast: (values[0] + 0.05) / (values[1] + 0.05)
		};
	});
}

async function checkWelcomeEmblem(page, label) {
	await page.setViewportSize({ width: 320, height: 740 });
	const reader = page.locator('.shadow-content').first();
	// Previously shipped mail reserved a 92px square for its inline brand SVG.
	// A retained panel must contain visible ink after sanitization. No visible
	// panel is also valid when a decorative image has been omitted.
	const panels = reader.locator('div[style*="width: 92px"][style*="height: 92px"]');
	const coverage = [];
	for (const panel of await panels.all()) {
		if (!await panel.isVisible()) continue;
		const hasMark = await panel.evaluate(element => {
			element.scrollIntoView({ block: 'center', behavior: 'instant' });
			const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
			let item;
			while ((item = text.nextNode())) {
				if (item.textContent.trim() && item.parentElement.checkVisibility()) return true;
			}
			if ([...element.querySelectorAll('img')].some(image => image.complete && image.naturalWidth && image.checkVisibility())) return true;
			return [null, '::before', '::after'].some(pseudo => {
				const style = getComputedStyle(element, pseudo);
				return style.backgroundImage !== 'none' || (pseudo && !['none', 'normal', '""'].includes(style.content));
			});
		});
		if (!hasMark) { coverage.push(0); continue; }
		const png = await panel.screenshot();
		coverage.push(await page.evaluate(async encoded => {
			const file = Uint8Array.from(atob(encoded), letter => letter.charCodeAt(0));
			const bitmap = await createImageBitmap(new Blob([file], { type: 'image/png' }));
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(bitmap, 0, 0);
			// Ignore the rounded border and surrounding message background.
			const width = Math.floor(bitmap.width / 2), height = Math.floor(bitmap.height / 2);
			const pixels = ctx.getImageData(Math.floor(bitmap.width / 4), Math.floor(bitmap.height / 4), width, height).data;
			const colors = new Map();
			for (let i = 0; i < pixels.length; i += 4) {
				const color = [pixels[i], pixels[i + 1], pixels[i + 2]].map(channel => Math.floor(channel / 8)).join(',');
				colors.set(color, (colors.get(color) ?? 0) + 1);
			}
			return 1 - Math.max(...colors.values()) / (width * height);
		}, png.toString('base64')));
	}
	check(`${label} has no empty brand panel on mobile`, () => {
		assert.ok(coverage.every(ratio => ratio > 0.01), 'Empty brand-panel interior: ' + JSON.stringify(coverage));
	});
}

async function checkWelcomeFeatures(page) {
	const reader = page.locator('.shadow-content').first();
	const headings = await reader.locator('h3').all();
	assert.equal(headings.length, 5, 'The welcome message contains five feature sections');
	for (const width of [320, 1440]) {
		await page.setViewportSize({ width, height: 812 });
		const empty = [];
		for (const [index, heading] of headings.entries()) {
			await heading.scrollIntoViewIfNeeded();
			const readable = await heading.evaluate(title => {
				if (!title.textContent.trim() || !title.checkVisibility()) return false;
				const card = title.parentElement.parentElement;
				const illustration = [...card.children].find(child => child.style.width === '300px');
				if (!illustration || !illustration.getBoundingClientRect().width) return true;
				const text = document.createTreeWalker(illustration, NodeFilter.SHOW_TEXT);
				let item;
				while ((item = text.nextNode())) {
					if (item.textContent.trim() && item.parentElement.checkVisibility()) return true;
				}
				return [...illustration.querySelectorAll('img')].some(image => image.complete && image.naturalWidth && image.checkVisibility());
			});
			if (!readable) empty.push(index + 1);
		}
		check(`all five welcome features have content without empty illustration columns at ${width}px`, () =>
			assert.deepEqual(empty, []));
	}
}

async function checkMailReadability(page, subject, label) {
	await page.getByText(subject, { exact: true }).first().click();
	const reader = page.locator('.shadow-content').first();
	await reader.waitFor({ state: 'visible' });
	for (const width of [320, 390, 1440]) {
		await page.setViewportSize({ width, height: 812 });
		await page.evaluate(async () => {
			await document.fonts.ready;
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		});
		const heading = await measureMailText(reader.locator('h1, h2').first());
		const copy = await measureMailText(reader.locator('p').first());
		check(`${label} heading and body remain readable at ${width}px`, () => {
			for (const [sample, font, contrast] of [[heading, 16, 3], [copy, 12, 4.5]]) {
				assert.ok(sample.visible && sample.font >= font && sample.glyphHeight >= font && sample.contrast >= contrast,
					'Rendered mail text: ' + JSON.stringify(sample));
			}
		});
	}
}

async function checkOrdinaryMailLayout(page) {
	const reader = page.locator('.shadow-content').first();
	const wasDark = await page.locator('html').evaluate(html => html.classList.contains('dark'));
	if (!wasDark) await page.locator('.theme-toggle-btn:visible').first().click();
	await page.waitForFunction(() => document.documentElement.classList.contains('dark') &&
		!document.documentElement.hasAttribute('data-theme-to'));
	await page.setViewportSize({ width: 320, height: 812 });
	const geometry = await reader.evaluate(body => {
		const [wide, medium] = body.querySelectorAll('table');
		const paragraph = body.querySelector('p');
		const left = paragraph.getBoundingClientRect().left;
		const scroller = wide.parentElement;
		scroller.scrollLeft = 600;
		return {
			tableWidth: wide.getBoundingClientRect().width,
			scroll: scroller.scrollLeft, scrollArea: scroller.clientWidth,
			pageWidth: document.documentElement.scrollWidth,
			textShift: paragraph.getBoundingClientRect().left - left,
			mediumScrolls: medium.parentElement.scrollWidth > medium.parentElement.clientWidth
		};
	});
	check('wide tables scroll independently without moving ordinary mobile text', () => {
		assert.ok(geometry.tableWidth >= 2500 && geometry.scroll === 600 && geometry.scrollArea <= 320 &&
			geometry.pageWidth <= 321 && Math.abs(geometry.textShift) <= 1 && geometry.mediumScrolls,
			JSON.stringify(geometry));
	});
	// Sample the actual composited pixels, including the reader's dark-mode filter.
	const png = await reader.locator('p').first().screenshot();
	const inkContrast = await page.evaluate(async encoded => {
		const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(bitmap, 0, 0);
		const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		const levels = [];
		const linear = channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
		for (let i = 0; i < pixels.length; i += 4) {
			levels.push(0.2126 * linear(pixels[i] / 255) + 0.7152 * linear(pixels[i + 1] / 255) +
				0.0722 * linear(pixels[i + 2] / 255));
		}
		levels.sort((a, b) => a - b);
		// The background occupies most of the paragraph. Its lightest 0.5% contains the ink.
		return (levels[Math.floor(levels.length * 0.995)] + 0.05) / (levels[Math.floor(levels.length / 2)] + 0.05);
	}, png.toString('base64'));
	check('ordinary unstyled text has readable ink on the dark-mode background', () => {
		assert.ok(inkContrast >= 4.5, 'Rendered contrast ' + inkContrast);
	});
	await page.setViewportSize({ width: 1440, height: 812 });
	await page.waitForFunction(() => {
		const body = document.querySelector('.content-html').shadowRoot.querySelector('.shadow-content');
		const medium = body.querySelectorAll('table')[1];
		return medium.parentElement === body.querySelector('p').parentElement;
	});
	if (!wasDark) {
		await page.locator('.theme-toggle-btn:visible').first().click();
		await page.waitForFunction(() => !document.documentElement.classList.contains('dark') &&
			!document.documentElement.hasAttribute('data-theme-to'));
	}
}

async function runBrowserChecks({ base, jwtSecret, addCleanup }) {

	const init = await fetch(`${base}/api/init`, {
		method: 'POST',
		headers: { 'x-init-secret': jwtSecret }
	});
	const initBody = await init.text();
	assert.equal(init.status, 200, initBody.slice(0, 200));
	const password = (initBody.match(/Initial admin password:\s*(\S+)/) || [])[1];
	assert.ok(password, 'init did not return the one-time admin password');

	const browser = await chromium.launch({
		headless: true,
		executablePath: process.env.EPOMAIL_CHROMIUM_PATH || undefined
	});
	addCleanup(() => browser.close());
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();

	const apiStatuses = [];
	const consoleErrors = [];
	page.on('response', res => {
		const url = res.url();
		if (url.includes('/api/')) apiStatuses.push({ url, status: res.status() });
	});
	page.on('console', msg => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', err => consoleErrors.push(String(err)));

	// 1. Sign in through the real form.
	await page.goto(`${base}/login/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('input[type="email"]', { timeout: 30000 });
	await page.fill('input[type="email"]', 'admin@example.com');
	const recoveryHref = await page.locator('a[href*="/appeal/"]').first().getAttribute('href');
	check('recovery link sends only language and request type', () => {
		const url = new URL(recoveryHref);
		assert.equal(url.protocol, 'https:');
		assert.deepEqual([...url.searchParams.keys()].sort(), ['lang', 'type']);
		assert.equal(url.searchParams.get('type'), 'password');
		assert.equal(url.hash, '');
	});
	await page.fill('input[type="password"]', password);
	const listResponse = page
		.waitForResponse(res => res.url().includes('/api/email/list'), { timeout: 90000 })
		.catch(() => null);
	await page.click('button[type="submit"]');

	await page.waitForURL(/#inbox/, { timeout: 90000, waitUntil: 'domcontentloaded' });
	check('login lands on the inbox URL', () => {
		assert.match(page.url(), /\/mail\/u\/0\/#inbox/);
	});

	// 2. The mail app must have kept the session and mounted.
	const session = await page.evaluate(() => {
		const current = JSON.parse(sessionStorage.getItem('epomail_tab_identity') || 'null');
		const sessions = JSON.parse(localStorage.getItem('epo_sessions') || '[]');
		return { active: current?.status === 'active', hasToken: typeof current?.token === 'string' && current.token.length > 20,
			registered: sessions.some(row => row.sessionId === current?.sessionId && row.token === current?.token),
			globalToken: localStorage.getItem('token') };
	});
	check('session token is pinned to this tab and recorded in the account registry', () => {
		assert.equal(session.active, true);
		assert.equal(session.hasToken, true);
		assert.equal(session.registered, true);
		assert.equal(session.globalToken, null);
	});

	await page.waitForFunction(
		() => {
			const root = document.querySelector('#app');
			return Boolean(root && root.children.length > 0);
		},
		null,
		{ timeout: 90000 }
	);
	check('mail app mounts after login', () => {
		assert.match(page.url(), /#inbox/);
	});
	const listRes = await listResponse;
	check('mailbox list request succeeded during first render', () => {
		assert.ok(listRes, `no /api/email/list response observed (api calls: ${apiStatuses.map(r => `${r.status} ${r.url.split('/api/')[1]}`).join(', ')})`);
		assert.equal(listRes.status(), 200, `status ${listRes.status()}`);
	});
	check(
		'inbox route is active (no unauthorised-access redirect)',
		() => {
			assert.match(page.url(), /#inbox/);
		}
	);

	// 3. Security settings loads linked identities from the real API.
	const identitiesResponse = page
		.waitForResponse(res => res.url().includes('/api/my/oauthIdentities'), { timeout: 45000 })
		.catch(() => null);
	await page.goto(`${base}/mail/u/0/#settings/security`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#oauthIdentities', { timeout: 45000 });
	const identitiesRes = await identitiesResponse;
	check('linked third-party accounts section renders', () => {
		assert.ok(identitiesRes, `no /api/my/oauthIdentities request observed (api calls: ${apiStatuses.map(r => `${r.status} ${r.url.split('/api/')[1]}`).join(', ')})`);
		assert.equal(identitiesRes.status(), 200, `status ${identitiesRes.status()}`);
	});
	const identityText = await page.locator('#oauthIdentities').innerText();
	check('linked accounts list shows at least one provider row', () => {
		assert.ok(identityText.trim().length > 0, 'section is empty');
	});

	// 3b. A provider bind returns to the account slot with the one-time claim
	// inside the fragment. The settings page must spend it and scrub the URL.
	const bindComplete = page.route('**/api/my/oauthIdentities/bind/complete', route =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ code: 200, data: { bound: true } })
		})
	);
	await bindComplete;
	const bindRequestPromise = page.waitForRequest(
		req => req.url().includes('/api/my/oauthIdentities/bind/complete') && req.method() === 'POST',
		{ timeout: 45000 }
	);
	await page.goto(
		`${base}/mail/u/0/#settings/security?oauth_bind=linked&oauth_link=browser-e2e-claim`,
		{ waitUntil: 'domcontentloaded' }
	);
	// A same-document hash change does not re-run onMounted; reload so the
	// callback is consumed exactly as it would be after a provider redirect.
	await page.reload({ waitUntil: 'domcontentloaded' });
	const bindRequest = await bindRequestPromise;
	check('settings bind return consumes the claim from the fragment', () => {
		assert.equal(JSON.parse(bindRequest.postData() || '{}').token, 'browser-e2e-claim');
		assert.doesNotMatch(page.url(), /oauth_link/, 'claim must be scrubbed from the address bar');
	});
	await page.unroute('**/api/my/oauthIdentities/bind/complete');

	await sendReaderFixtures(page);
	// The mobile app must authenticate and render real mail, not an error or login shell.
	const phone = await browser.newContext({ locale: 'zh-CN', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
	const mobile = await phone.newPage();
	await mobile.goto(`${base}/login/`, { waitUntil: 'domcontentloaded' });
	await mobile.locator('input[type="email"]').fill('admin@example.com');
	await mobile.locator('input[type="password"]').fill(password);
	const [mobileList] = await Promise.all([
		mobile.waitForResponse(res => new URL(res.url()).pathname === '/api/email/list', { timeout: 90000 }),
		mobile.locator('button[type="submit"]').click()
	]);
	await mobile.waitForURL(/\/mail\/u\/0\/#inbox/, { timeout: 90000, waitUntil: 'domcontentloaded' });
	const mobileBody = await mobileList.json();
	check('mobile login opens the authenticated inbox at 375px', () => {
		assert.equal(mobileList.status(), 200);
		assert.equal(mobileBody.code, 200);
	});
	await mobile.evaluate(() => document.fonts.ready);
	const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	check('inbox has no horizontal overflow at 375px', () => {
		assert.ok(overflow <= 1, `scrollWidth exceeds viewport by ${overflow}px`);
	});
	for (const width of [375, 320, 390]) {
		await mobile.setViewportSize({ width, height: 812 });
		await mobile.locator('.mode-tag span').waitFor({ state: 'visible' });
		const clipped = await mobile.locator('.custom-footer').evaluate(footer => {
			const box = footer.getBoundingClientRect();
			const problems = [];
			for (const selector of ['.mode-tag span', '.audit-status-tag span']) {
				const label = footer.querySelector(selector);
				if (!label?.textContent.trim()) {
					problems.push(selector + ' missing text');
					continue;
				}
				const text = document.createRange();
				text.selectNodeContents(label);
				const lines = [...text.getClientRects()];
				if (!lines.length || lines.some(line => !line.width || !line.height ||
					line.left < Math.max(0, box.left) - 1 || line.right > Math.min(innerWidth, box.right) + 1 ||
					line.top < Math.max(0, box.top) - 1 || line.bottom > Math.min(innerHeight, box.bottom) + 1)) {
					problems.push(selector + ' clipped');
				}
			}
			const compose = document.querySelector('.compose-fab');
			if (!compose?.getAttribute('aria-label')?.trim()) problems.push('compose button missing accessible name');
			else if (compose.getBoundingClientRect().bottom > box.top + 1) problems.push('compose overlaps footer');
			return problems;
		});
		check(`privacy and audit labels fit the mobile footer at ${width}px`, () => assert.deepEqual(clipped, []));
	}
	const messages = mobileBody.data.list;
	const welcome = messages.find(mail => /欢迎来到|歡迎來到|Welcome to/i.test(mail.subject));
	assert.ok(welcome?.subject, 'Expected an actual system welcome in the inbox');
	assert.ok(messages.some(mail => mail.subject === legacyNotice.subject), 'Expected the stored notice in the inbox');
	let trackerRequests = 0;
	await mobile.route('https://tracker.invalid/**', route => {
		trackerRequests++;
		return route.abort();
	});
	await checkMailReadability(mobile, ordinaryMail.subject, 'ordinary mail');
	if (process.env.EPOMAIL_SCREENSHOT_DIR) {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		await fs.mkdir(process.env.EPOMAIL_SCREENSHOT_DIR, { recursive: true });
		await mobile.setViewportSize({ width: 390, height: 844 });
		await mobile.screenshot({ path: path.join(process.env.EPOMAIL_SCREENSHOT_DIR, 'ordinary-light-390.png') });
	}
	await checkOrdinaryMailLayout(mobile);
	const untrustedSvg = await mobile.locator('.shadow-content svg').count();
	check('reading ordinary mail preserves remote image privacy and strips embedded SVG', () => {
		assert.equal(trackerRequests, 0);
		assert.equal(untrustedSvg, 0);
	});
	await Promise.all([
		mobile.waitForRequest('https://tracker.invalid/**'),
		mobile.locator('.remote-images-button').click()
	]);
	await mobile.waitForFunction(() => document.querySelector('.remote-images-button') === null);
	check('authorizing remote images loads the image for that message only', () => {
		assert.equal(trackerRequests, 1);
	});
	if (process.env.EPOMAIL_SCREENSHOT_DIR) {
		const path = await import('node:path');
		await mobile.setViewportSize({ width: 1440, height: 900 });
		await mobile.screenshot({ path: path.join(process.env.EPOMAIL_SCREENSHOT_DIR, 'ordinary-light-1440.png') });
	}
	await mobile.goto(`${base}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
	await checkMailReadability(mobile, welcome.subject, 'system welcome');
	await checkWelcomeEmblem(mobile, 'system welcome');
	await checkWelcomeFeatures(mobile);
	if (process.env.EPOMAIL_SCREENSHOT_DIR) {
		const path = await import('node:path');
		await mobile.setViewportSize({ width: 320, height: 812 });
		await mobile.screenshot({ path: path.join(process.env.EPOMAIL_SCREENSHOT_DIR, 'welcome-light-320.png') });
		await mobile.setViewportSize({ width: 1440, height: 900 });
		await mobile.screenshot({ path: path.join(process.env.EPOMAIL_SCREENSHOT_DIR, 'welcome-light-1440.png') });
	}
	await mobile.goto(`${base}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
	await checkMailReadability(mobile, legacyNotice.subject, 'stored official notice');
	await checkWelcomeEmblem(mobile, 'stored official notice');
	await phone.close();

	// 5. Expired session is forced back to the login app.
	await page.evaluate(() => localStorage.clear());
	await page.goto(`${base}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
	await page.waitForURL(/\/login\//, { timeout: 45000, waitUntil: 'commit' });
	check('missing token redirects to /login/', () => {
		assert.match(page.url(), /\/login\//);
	});

	check('no uncaught page errors', () => {
		const serious = consoleErrors.filter(text =>
			!/favicon|net::ERR_|Failed to load resource|STATUS_BREAKPOINT|401 \(Unauthorized\)/i.test(text)
		);
		assert.deepEqual(serious, [], serious.join(' | '));
	});

}

try {
	await withLocalStack(runBrowserChecks);
	console.log(results.join('\n'));
	console.log(`\n${results.length}/${results.length} browser checks passed (cleanup complete)`);
} catch (err) {
	if (results.length) console.log(results.join('\n'));
	console.error(`\nFAILED: ${err.message}`);
	process.exitCode = 1;
}
