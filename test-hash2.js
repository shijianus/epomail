import cryptoUtils from './mail-worker/src/utils/crypto-utils.js';
const encoder = new TextEncoder();
async function test(p, s) {
    const methods = [
        s + p,
        p + s,
        p,
        s
    ];
    for(let m of methods) {
        const data = encoder.encode(m);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const b = btoa(String.fromCharCode(...hashArray));
        console.log(m.substring(0, 10) + "... => " + b);
        if(b === 'TpuwlBfUTPsdMWzu6KZ6aGPKleuqnROeQR2uuXqgoxs=') {
            console.log("MATCH FOUND!");
        }
    }
}
test('123456', 'bSNaC2jxL9dUNb9FjkdKOA==');
