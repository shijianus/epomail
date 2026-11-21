import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { withLocalStack } from './helpers/local-stack.mjs';

test('restricted decision documents fit a narrow screen and expose only their wording', async () => {
	await withLocalStack(async ({ base, jwtSecret, addCleanup }) => {
		const initialized = await fetch(base + '/api/init', { method: 'POST', headers: { 'x-init-secret': jwtSecret } });
		assert.equal(initialized.status, 200);
		const browser = await chromium.launch({ executablePath: process.env.EPOMAIL_CHROMIUM_PATH || undefined });
		addCleanup(() => browser.close());
		const context = await browser.newContext({ viewport: { width: 320, height: 812 }, serviceWorkers: 'block' });
		await context.addInitScript(() => sessionStorage.setItem('epomail_restricted_token', 'fixture-only'));
		let imageRequests = 0;
		let viewRequests = 0;
		const ticketId = 'CASE-' + 'A'.repeat(120);
		// This page historically received documents formatted with a head stylesheet.
		// Only its authorized view response is simulated. The candidate serves the UI.
		const htmlContent = `<style>.card{width:640px}</style><div class="card">
			<h2>Case decision</h2><p>Reader copy &amp; details</p>
			<div><span>Case:</span><span>${ticketId}</span></div>
			<img src="/notice-fixture-pixel"><p style="color:white">End of notice</p></div>`;
		await context.route('**/*', async route => {
			const url = new URL(route.request().url());
			if (url.origin !== new URL(base).origin) return route.abort();
			if (url.pathname === '/notice-fixture-pixel') { imageRequests++; return route.abort(); }
			if (url.pathname !== '/api/notice/restricted/view') return route.continue();
			viewRequests++;
			assert.equal(route.request().headers().authorization, 'Bearer fixture-only');
			return route.fulfill({ json: { code: 200, data: { hasCase: true, ticketId, email: 'reader@example.test',
				subject: 'Case decision', htmlContent } } });
		});
		const page = await context.newPage();
		await page.goto(base + '/mail/u/0/#notice/restricted', { waitUntil: 'domcontentloaded' });
		const body = page.locator('.notice-html-wrapper');
		await body.waitFor();
		assert.match(await body.innerText(), /Reader copy & details/);
		assert.match(await body.innerText(), /End of notice/);
		assert.equal(await body.locator('img, style, [style]').count(), 0);
		for (const width of [320, 390, 1280]) {
			await page.setViewportSize({ width, height: 812 });
			const measured = await body.evaluate(el => ({
				pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth,
				bodyWidth: el.clientWidth, contentWidth: el.scrollWidth,
				font: parseFloat(getComputedStyle(el.querySelector('p')).fontSize)
			}));
			assert.ok(measured.pageWidth <= measured.viewport && measured.contentWidth <= measured.bodyWidth + 1,
				`restricted decision overflows at ${width}px: ${JSON.stringify(measured)}`);
			assert.ok(measured.font >= 14, `restricted decision text shrank at ${width}px`);
		}
		assert.ok(viewRequests >= 1);
		assert.equal(imageRequests, 0);
	});
});
