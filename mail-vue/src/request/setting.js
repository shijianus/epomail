import http from '@/axios/index.js';
import { resolveTabSession } from '@/utils/tab-session.js';
import { submitGlobalBroadcast } from '@/utils/global-broadcast.js';

export function settingSet(setting) {
    return http.put('/setting/set', setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}

export function setBlackList(params) {
    return http.put('/setting/setBlacklist', params)
}

export function sendWelcomeEmail(params) {
    return http.post('/setting/sendWelcomeEmail', params)
}

export function sendGlobalEmail(params) {
    let storage;
    try { storage = globalThis.sessionStorage; } catch (_) {}
    return submitGlobalBroadcast(params, {
        storage,
        identity: () => resolveTabSession()?.sessionId,
        post: payload => http.post('/setting/sendGlobalEmail', payload)
    })
}

export function getGlobalEmailConfig() {
    return http.get('/setting/globalEmailConfig')
}

export function testS3Setting(params) {
    return http.post('/setting/s3/test', params)
}

export function getDbStatus() {
    return http.get('/setting/db/status')
}

export function testDbSetting(params) {
    return http.post('/setting/db/test', params)
}

export function scanStorage() {
    return http.post('/setting/storage/scan')
}

export function cleanupStorage(page = {}) {
    const query = new URLSearchParams(page).toString()
    return http.post('/setting/storage/cleanup' + (query ? '?' + query : ''))
}

export function testAiSetting(params) {
    return http.post('/setting/ai/test', params)
}

export function fetchAiModels(params) {
    return http.post('/setting/ai/models', params)
}

export function verifyOauthProvider(provider, params) {
    return http.post(`/oauth/verify/${provider}`, params)
}