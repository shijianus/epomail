import http from '@/axios/index.js';

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

export function testS3Setting(params) {
    return http.post('/setting/s3/test', params)
}

export function getDbStatus() {
    return http.get('/setting/db/status')
}

export function testDbSetting(params) {
    return http.post('/setting/db/test', params)
}