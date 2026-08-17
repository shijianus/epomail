import http from '@/axios/index.js';

export function getProfile(username) {
    return http.get(`/public/profile/${username}`)
}
