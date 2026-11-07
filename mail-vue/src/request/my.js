import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(currentPassword, password) {
    return http.put('/my/resetPassword', {currentPassword, password})
}

// First password for an account created by the OAuth bind flow. The server
// only accepts it inside a short window after a provider sign-in.
export function getInitialPasswordStatus() {
    return http.get('/my/initialPasswordStatus')
}

export function setInitialPassword(password) {
    return http.put('/my/setInitialPassword', { password })
}

export function userDelete() {
    return http.delete('/my/delete', { noMsg: true })
}

export function revokeTelegramLinks() {
    return http.post('/my/telegram/revokeLinks', {});
}

export function userSetCustomLabels(customLabels) {
    return http.put('/my/setCustomLabels', { customLabels })
}

export function updateProfile(data) {
    return http.put('/my/updateProfile', data)
}

export function uploadImage(formData) {
    return http.post('/my/uploadImage', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
}

export function getTotpStatus() {
    return http.get('/my/totp/status');
}

export function getTotpSetup(data) {
    return http.post('/my/totp/setup', data);
}

export function enableTotp(data) {
    return http.post('/my/totp/enable', data);
}

export function disableTotp(data) {
    return http.post('/my/totp/disable', data);
}

export function regenerateBackupCodes(data) {
    return http.post('/my/totp/backup-codes', data);
}

export function viewBackupCodes(data) {
    return http.post('/my/totp/view-backup-codes', data);
}

export function getPasskeySetup(data) {
    return http.post('/my/passkey/setup', data);
}

export function registerPasskey(data) {
    return http.post('/my/passkey/register', data);
}

export function getPasskeyList() {
    return http.get('/my/passkey/list');
}

export function deletePasskey(passkeyId, data) {
    return http.delete(`/my/passkey/${passkeyId}`, { data });
}

export function updateTotp(data) {
    return http.post('/my/totp/update', data);
}

export function approvePasskeyWithTotp(passkeyId, data) {
    return http.post(`/my/passkey/${passkeyId}/approve-totp`, data);
}

export function activateTimelockedPasskey(passkeyId, data) {
    return http.post(`/my/passkey/${passkeyId}/activate-timelock`, data);
}

export function getPasskeyTestOptions(passkeyId) {
    return http.post(`/my/passkey/${passkeyId}/test-options`);
}

export function verifyPasskeyTest(passkeyId, data) {
    return http.post(`/my/passkey/${passkeyId}/test-verify`, data);
}

export function getGeo() {
    return http.get('/my/geo');
}

export function exportUserData(params) {
    return http.get('/my/exportData', { params });
}

export function testTelegramBot(data) {
    return http.post('/my/testTelegram', data);
}

export function getApiTokens() {
    return http.get('/my/apiTokens');
}

export function createApiToken(data) {
    return http.post('/my/apiTokens', data);
}

export function deleteApiToken(tokenId) {
    return http.delete(`/my/apiTokens/${tokenId}`);
}

export function getUserStorage() {
    return http.get('/my/storage');
}

export function updateUserStorage(data) {
    return http.put('/my/storage', data);
}

export function testUserStorage(data) {
    return http.post('/my/storage/test', data);
}

export function clearUserStorage() {
    return http.delete('/my/storage');
}

export function getMyOauthGrants() {
    return http.get('/my/oauthGrants');
}

export function revokeMyOauthGrant(id) {
    return http.delete(`/my/oauthGrants/${id}`);
}

export function revokeMyOauthGrantByClient(clientId) {
    return http.post('/my/revokeOauthGrant', { clientId });
}

// ---------------------------------------------------------------------------
// Third-party sign-in identities bound to the signed-in account.
// The server derives the account from the session; no userId is ever sent.
// ---------------------------------------------------------------------------

export function getOauthIdentities() {
    return http.get('/my/oauthIdentities');
}

// Issues a single-use step-up grant bound to the current session. Required
// before binding or unbinding an identity.
export function reauthOauthIdentity(data) {
    return http.post('/my/oauthIdentities/reauth', data);
}

export function startOauthIdentityBind(data) {
    return http.post('/my/oauthIdentities/bind/start', data);
}

export function completeOauthIdentityBind(token) {
    return http.post('/my/oauthIdentities/bind/complete', { token });
}

export function unbindOauthIdentity(id, stepUpToken) {
    return http.delete(`/my/oauthIdentities/${id}`, { data: { stepUpToken } });
}

export function securityReauthOptions(data) { return http.post('/my/security/reauth-options', data); }
export function securityReauthenticate(data) { return http.post('/my/security/reauth', data); }
