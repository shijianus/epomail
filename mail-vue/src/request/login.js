import http from '@/axios/index.js';

export function login(emailOrPayload, password) {
    const payload = emailOrPayload && typeof emailOrPayload === 'object'
        ? emailOrPayload
        : { email: emailOrPayload, password };
    return http.post('/login', payload)
}

export function loginTotp(payload) {
    return http.post('/login/totp', payload)
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}