import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const b64url=value=>Buffer.from(value).toString('base64url');
export function createInstagramState(payload,secret){
 const body=b64url(JSON.stringify({...payload,nonce:randomBytes(18).toString('base64url')}));
 const signature=createHmac('sha256',secret).update(body).digest('base64url');
 return body+'.'+signature;
}
export function readInstagramState(value,secret){
 if(typeof value!=='string'||value.length>4096)throw new Error('invalid state');
 const [body,signature,...rest]=value.split('.');
 if(!body||!signature||rest.length)throw new Error('invalid state');
 const expected=createHmac('sha256',secret).update(body).digest();
 let actual;try{actual=Buffer.from(signature,'base64url')}catch{throw new Error('invalid state')}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('invalid state');
 const parsed=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
 if(!parsed.clientId||!parsed.organizationId||!parsed.userId||!Number.isFinite(parsed.exp)||parsed.exp<Date.now())throw new Error('expired state');
 return parsed;
}
function encryptionKey(){
 const raw=process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY||'';
 const key=Buffer.from(raw,'base64');
 if(key.length!==32)throw new Error('Instagram token encryption key must be a base64-encoded 32-byte key.');
 return key;
}
export function encryptInstagramToken(token){
 const key=encryptionKey(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function decryptInstagramToken(value){
 const [version,iv,tag,ciphertext,...rest]=String(value||'').split('.');
 if(version!=='v1'||!iv||!tag||!ciphertext||rest.length)throw new Error('Invalid encrypted Instagram token.');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));
 decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
