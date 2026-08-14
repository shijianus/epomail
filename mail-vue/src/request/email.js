import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type, folder, keyword) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, folder, keyword}})
}

export function emailDelete(emailIds, physical = false) {
    return http.delete('/email/delete', {params: {emailIds, physical}})
}

export function emailSpam(emailIds, isSpam) {
    return http.put('/email/spam', {emailIds, isSpam})
}

export function emailSnooze(emailIds, time) {
    return http.put('/email/snooze', {emailIds, time})
}

export function emailRestore(emailIds) {
    return http.put('/email/restore', {emailIds})
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
export function emailSearchSuggestions(params) {
    return http.get('/email/searchSuggestions', { params, noMsg: true })
}
