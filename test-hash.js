import cryptoUtils from './mail-worker/src/utils/crypto-utils.js';

(async () => {
  const hash = await cryptoUtils.genHashPassword(process.env.EPOMAIL_E2E_TEST_PASSWORD || '', 'bSNaC2jxL9dUNb9FjkdKOA==');
  console.log("Hash for 123456 is:", hash);
  console.log("Matches DB?", hash === 'TpuwlBfUTPsdMWzu6KZ6aGPKleuqnROeQR2uuXqgoxs=');
})();
