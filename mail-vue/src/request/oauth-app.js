import http from '@/axios/index.js';

export function getOAuthApps() {
    return http.get('/admin/oauthApp/list');
}

export function createOAuthApp(data) {
    return http.post('/admin/oauthApp/add', data);
}

export function updateOAuthApp(data) {
    return http.put('/admin/oauthApp/update', data);
}

export function resetOAuthAppSecret(id) {
    return http.post('/admin/oauthApp/resetSecret', { id });
}

export function setOAuthAppStatus(id, status) {
    return http.put('/admin/oauthApp/status', { id, status });
}

export function deleteOAuthApp(id) {
    return http.delete('/admin/oauthApp/delete', { data: { id } });
}

// 供独立授权页 /oauth/authorize 使用
export function getOAuthAuthorizeInfo(params) {
    return http.get('/oauth/authorize/info', { params });
}

export function confirmOAuthAuthorize(data) {
    return http.post('/oauth/authorize', data);
}
