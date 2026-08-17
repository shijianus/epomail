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

