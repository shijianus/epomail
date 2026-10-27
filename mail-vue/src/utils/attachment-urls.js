import { computed, reactive, watch } from 'vue';
import { signObjectUrls } from '@/request/object.js';
import { useSettingStore } from '@/store/setting.js';
import { cvtR2Url, toOssDomain } from '@/utils/convert.js';

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const PLACEHOLDER_PATTERN = /{{domain}}(attachments\/[A-Za-z0-9._-]+)/g;
const DIRECT_PATTERN = /(["'(=\s])\/?(attachments\/[A-Za-z0-9._-]+)/g;

function collectAttachmentKeys(messages) {
	const keys = new Set();
	for (const message of messages || []) {
		if (!message) continue;
		const content = typeof message.content === 'string' ? message.content : '';
		for (const match of content.matchAll(PLACEHOLDER_PATTERN)) keys.add(match[1]);
		for (const match of content.matchAll(DIRECT_PATTERN)) keys.add(match[2]);
		for (const attachment of message.attList || []) {
			if (typeof attachment?.key === 'string' && attachment.key.startsWith('attachments/')) {
				keys.add(attachment.key);
			}
		}
	}
	return [...keys].sort();
}

/**
 * Convert {{domain}}attachments/<key> placeholders and explicit attachment
 * links into short-lived signed URLs for exactly the keys present in the
 * current mailbox view. When a public object domain is configured the legacy
 * direct-link mode is preserved.
 */
export function useAttachmentUrls(getMessages) {
	const settingStore = useSettingStore();
	const urlMap = reactive({});
	const pending = new Set();

	const attachmentKeys = computed(() => collectAttachmentKeys(getMessages()));

	async function ensureSignedUrls(keys) {
		const publicDomain = toOssDomain(settingStore.settings?.r2Domain);
		if (publicDomain) return;

		const missing = keys.filter(key => !urlMap[key] && !pending.has(key));
		if (missing.length === 0) return;

		missing.forEach(key => pending.add(key));
		try {
			const response = await signObjectUrls(missing);
			const urls = response?.urls || {};
			Object.assign(urlMap, urls);
		} catch (_) {
			// A failed batch leaves the placeholders untouched; a later render
			// retries for the same keys instead of exposing a bare object key.
		} finally {
			missing.forEach(key => pending.delete(key));
		}
	}

	watch(attachmentKeys, keys => {
		ensureSignedUrls(keys);
	}, { immediate: true });

	function attachmentUrl(keyOrAttachment) {
		const key = typeof keyOrAttachment === 'string' ? keyOrAttachment : keyOrAttachment?.key;
		if (!key) return '';
		const publicDomain = toOssDomain(settingStore.settings?.r2Domain);
		if (publicDomain) return cvtR2Url(key);
		return urlMap[key] || '';
	}

	function formatImage(content) {
		content = content || '';
		const publicDomain = toOssDomain(settingStore.settings?.r2Domain);
		if (publicDomain) {
			return content.replace(/{{domain}}/g, publicDomain + '/');
		}

		return content
			.replace(PLACEHOLDER_PATTERN, (match, key) => urlMap[key] || TRANSPARENT_PIXEL)
			.replace(DIRECT_PATTERN, (match, prefix, key) => prefix + (urlMap[key] || TRANSPARENT_PIXEL))
			.replace(/{{domain}}/g, '/');
	}

	return { formatImage, attachmentUrl };
}
