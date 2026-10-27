import http from '@/axios/index.js';

// The legacy code-only LinuxDo login endpoint is disabled server-side because
// it bypassed OAuth state and browser binding. Use /oauth/authorize/linuxdo.
export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}
