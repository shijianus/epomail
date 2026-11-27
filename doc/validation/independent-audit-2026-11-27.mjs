// Isolated audit reproduction. It observes existing gaps, not a CI regression contract.
// All network calls are stubbed; no D1/KV writes or real credentials are used.
import assert from 'node:assert/strict';
import { dbInit } from '../../mail-worker/src/init/init.js';
import app from '../../mail-worker/src/hono/webs.js';
import emailService from '../../mail-worker/src/service/email-service.js';
const observations = [];
const originalWarn = console.warn;
const originalFetch = globalThis.fetch;
try {
 const warnings=[];
 console.warn=(...args)=>warnings.push(args.map(String).join(' '));
 const db={prepare(){return {run:async()=>{throw new Error('audit-injected-write-failure')},first:async()=>null}}};
 let rejected=false;
 try{await dbInit.v3_20DB({env:{USER_DB:db}})}catch{rejected=true}
 assert.equal(rejected,false);
 assert.equal(warnings.length,2);
 observations.push({probe:'migration-v3_20DB',injectedWritesFailed:2,rejected,warnings:warnings.length});
 let consumed=0;
 const bytes=2*1024*1024;
 const chunkSize=65536;
 const body=new ReadableStream({pull(controller){if(consumed>=bytes){controller.close();return}controller.enqueue(new Uint8Array(chunkSize).fill(120));consumed+=chunkSize}});
 const request=new Request('http://localhost/webhooks',{method:'POST',body,duplex:'half'});
 const response=await app.fetch(request,{resend_webhook_secret:'audit-test-webhook-secret',ENVIRONMENT:'test'},{});
 assert.equal(response.status,401);
 assert.equal(consumed,bytes);
 observations.push({probe:'unsigned-webhook',consumedBytes:consumed,status:response.status,body:await response.text()});
 let captured=null;
 globalThis.fetch=async(url,options)=>{captured={url,signalPresent:Boolean(options?.signal)};return new Response(JSON.stringify({id:'test-only-audit-id'}),{status:200,headers:{'content-type':'application/json'}})};
 const result=await emailService.sendByResend('test-only-api-key',{accountEmail:'sender@example.test',receiveEmail:['receiver@example.test'],subject:'audit',text:'test',html:'<p>test</p>',name:'audit',attachments:[],idempotencyKey:'test-only-audit'});
 assert.equal(result.data.id,'test-only-audit-id');
 assert.equal(captured.signalPresent,false);
 observations.push({probe:'resend-timeout',...captured,realNetwork:false});
} finally {console.warn=originalWarn;globalThis.fetch=originalFetch;}
for(const observation of observations)console.log(JSON.stringify(observation));
