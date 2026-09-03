import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
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

export function getTotpSetup() {
    return http.get('/my/totp/setup');
}

export function enableTotp(code) {
    return http.post('/my/totp/enable', { code });
}

export function disableTotp(password, code) {
    return http.post('/my/totp/disable', { password, code });
}

export function regenerateBackupCodes(password) {
    return http.post('/my/totp/backup-codes', { password });
}

export function viewBackupCodes(password) {
    return http.post('/my/totp/view-backup-codes', { password });
}

export function getPasskeySetup() {
    return http.get('/my/passkey/setup');
}

export function registerPasskey(data) {
    return http.post('/my/passkey/register', data);
}

export function getPasskeyList() {
    return http.get('/my/passkey/list');
}

export function deletePasskey(passkeyId) {
    return http.delete(`/my/passkey/${passkeyId}`);
}

export function renamePasskey(passkeyId, name) {
    return http.put(`/my/passkey/${passkeyId}`, { name });
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



