import { launchForLoopbackOrigin } from './isolated-chromium.mjs';
import { legacyOrigin, legacyAdminEmail, legacyUserEmail } from './legacy-target.mjs';

export function launchIsolatedChromium(chromium, options = {}) {
	return launchForLoopbackOrigin(chromium, legacyOrigin, options, { legacyOrigin, legacyAdminEmail, legacyUserEmail });
}
