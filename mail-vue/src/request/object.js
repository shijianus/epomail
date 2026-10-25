import http from '@/axios/index.js';

export function signObjectUrls(keys) {
	return http.post('/oss-url/batch', { keys }, { noMsg: true });
}
