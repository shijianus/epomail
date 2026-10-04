import http from '@/axios/index.js'

export function auditList(params) {
    return http.get('/audit/list', { params: { ...params } })
}

export function auditAction(data) {
    return http.post('/audit/action', data)
}

export function auditAdjudicate(data) {
    return http.post('/audit/adjudicate', data)
}

export function auditPurge() {
    return http.post('/audit/purge')
}
