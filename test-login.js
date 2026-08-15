import saltHashUtils from './mail-worker/src/utils/crypto-utils.js';

(async () => {
    const pwd = 'password123';
    const { salt, hash } = await saltHashUtils.hashPassword(pwd);
    console.log('salt:', salt);
    console.log('hash:', hash);
    const verify = await saltHashUtils.verifyPassword(pwd, salt, hash);
    console.log('verify:', verify);
})();
