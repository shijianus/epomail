import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import totpUtils from '../src/utils/totp-utils.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import JwtUtils from '../src/utils/jwt-utils.js';
import loginService from '../src/service/login-service.js';
import { dbInit } from '../src/init/init.js';

const UID=980001, EMAIL='totp-backend@example.com', PASSWORD='test-only-password';
const SECRET='JBSWY3DPEHPK3PXP';
let credentials;
beforeAll(async()=>{
 await dbInit.intDB({env}); await dbInit.v1_1DB({env});
 await env.db.prepare('ALTER TABLE user ADD COLUMN reg_key_id INTEGER NOT NULL DEFAULT 0').run().catch(() => {}); await dbInit.v3_8DB({env});
 await dbInit.v3_10DB({env}); await dbInit.v3_23DB({env});
 credentials=await cryptoUtils.hashPassword(PASSWORD,{PBKDF2_WRITER_ITERATIONS:'1000'});
});
async function clean(){
 await env.db.prepare('DELETE FROM auth_security_operation WHERE user_id=?').bind(UID).run();
 await env.db.prepare('DELETE FROM auth_totp_replay WHERE user_id=?').bind(UID).run();
 await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(UID).run();
 let cursor;
 do {const page=await env.kv.list({...(cursor?{cursor}:{})});for(const key of page.keys)await env.kv.delete(key.name);cursor=page.list_complete?null:page.cursor;}while(cursor);
}
beforeEach(async()=>{
 fetchMock.activate();fetchMock.disableNetConnect();await clean();
 await env.db.prepare('INSERT INTO user(user_id,email,password,salt,totp_key_version) VALUES(?,?,?,?,2)').bind(UID,EMAIL,credentials.hash,credentials.salt).run();
 await env.kv.put('setting:',JSON.stringify({allMailMode:0,totp:1}));
});
afterEach(async()=>{try{await clean();}finally{fetchMock.deactivate();}});
async function api(path,token,body){
 return (await SELF.fetch(`https://example.com/api${path}`,{method:'POST',headers:{'content-type':'application/json',...(token?{Authorization:token}:{})},body:JSON.stringify(body)})).json();
}
async function session(){
 const token='session-to-revoke';
 const jwt=await JwtUtils.generateToken({env},{userId:UID,token,authVersion:0});
 await env.kv.put(`auth-uid:${UID}`,JSON.stringify({tokens:['old-session',token],user:{userId:UID,email:EMAIL,isDel:0,status:0},refreshTime:new Date().toISOString()}));
 return jwt;
}
describe('TOTP backend security with real D1 mutation paths',()=>{
 it('encryption requires totp_enc_key, never jwt_secret fallback',async()=>{
  await expect(totpUtils.getEncryptionKey({})).rejects.toThrow('totp_enc_key is not configured');
  await expect(totpUtils.getEncryptionKey({jwt_secret:'test-only-secret'})).rejects.toThrow('totp_enc_key is not configured');
  await expect(totpUtils.getEncryptionKey({totp_enc_key:' '})).rejects.toThrow('totp_enc_key is not configured');
  expect(await totpUtils.getEncryptionKey({totp_enc_key:'test-only-encryption'})).toBeDefined();
 });
 it('random passwords contain only the intended rejection-sampling alphabet',()=>{
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for(let i=0;i<50;i++){const value=cryptoUtils.genRandomPwd(16);expect(value).toHaveLength(16);for(const char of value)expect(chars.includes(char)).toBe(true);}
 });
 it('enabling TOTP revokes every old session and logout awaits the exact session token',async()=>{
  const jwt=await session();
  const opts=await api('/my/security/reauth-options',jwt,{operation:'totp_enable'});
  const proof=await api('/my/security/reauth',jwt,{operation:'totp_enable',challengeToken:opts.data.challengeToken,password:PASSWORD});
  expect(proof.code).toBe(200);
  const setup=await api('/my/totp/setup',jwt,{stepUpToken:proof.data.stepUpToken,operation:'totp_enable'});
  expect(setup.code).toBe(200);
  const enabled=await api('/my/totp/enable',jwt,{setupToken:setup.data.setupToken,code:await totpUtils.generateTOTP(setup.data.secret)});
  expect(enabled.code).toBe(200);expect(enabled.data.backupCodes).toHaveLength(10);
  expect(await env.kv.get(`auth-uid:${UID}`)).toBeNull();
  expect((await env.db.prepare('SELECT auth_version FROM user WHERE user_id=?').bind(UID).first()).auth_version).toBe(1);
  await env.kv.put(`auth-uid:${UID}`,JSON.stringify({tokens:['session-to-revoke'],user:{userId:UID,email:EMAIL}}));
  await loginService.logout({env,req:{header:name=>name.toLowerCase()==='authorization'?jwt:null}},UID);
  expect(await env.kv.get(`auth-uid:${UID}`)).toBeNull();
 });
 it('accumulates account lockout across distinct D1 pending MFA credentials',async()=>{
  await env.db.prepare('UPDATE user SET totp_enabled=1,totp_secret=? WHERE user_id=?').bind(await totpUtils.encryptSecret(SECRET,env),UID).run();
  const pending=[];
  for(let i=0;i<3;i++){
   const result=await api('/login',null,{email:EMAIL,password:PASSWORD});
   expect(result.data.mfaRequired).toBe(true);pending.push(result.data.tempToken);
  }
  const actual=await totpUtils.generateTOTP(SECRET);const wrong=actual==='000000'?'111111':'000000';
  for(let i=0;i<4;i++){
   expect((await api('/login/totp',null,{tempToken:pending[0],code:wrong})).code).not.toBe(200);
   expect(Number(await env.kv.get(`login_fail:${EMAIL}`))).toBe(i+1);
  }
  expect((await api('/login/totp',null,{tempToken:pending[1],code:wrong})).code).not.toBe(200);
  expect(Number(await env.kv.get(`login_fail:${EMAIL}`))).toBe(5);
  expect((await api('/login/totp',null,{tempToken:pending[2],code:actual})).code).not.toBe(200);
  expect(await env.kv.get(`auth-uid:${UID}`)).toBeNull();
 });
 it('issues replacement recovery codes when the last backup code is used at login',async()=>{
  const backup=await totpUtils.generateBackupCodes(1,env);
  await env.db.prepare('UPDATE user SET totp_enabled=1,totp_key_version=2,totp_secret=?,totp_backup_codes=? WHERE user_id=?')
   .bind(await totpUtils.encryptSecret(SECRET,env),JSON.stringify({hashedCodes:backup.hashedCodes,encryptedRaw:backup.encryptedRaw}),UID).run();
  const begin=await api('/login',null,{email:EMAIL,password:PASSWORD});
  expect(begin.data.mfaRequired).toBe(true);
  expect(begin.data.hasBackupCodes).toBe(true);
  const completed=await api('/login/totp',null,{
   tempToken:begin.data.tempToken,code:backup.rawCodes[0],isBackupCode:true
  });
  expect(completed.code).toBe(200);
  expect(completed.data.token).toBeTruthy();
  expect(completed.data.backupCodes).toHaveLength(10);
  const stored=JSON.parse((await env.db.prepare('SELECT totp_backup_codes FROM user WHERE user_id=?').bind(UID).first()).totp_backup_codes);
  expect(stored.hashedCodes).toHaveLength(10);
  expect(stored.hashedCodes.filter(code=>code.used===0)).toHaveLength(10);
  expect(completed.data.backupCodes).not.toContain(backup.rawCodes[0]);
 });
});
