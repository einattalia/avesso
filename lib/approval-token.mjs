import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

export function createApprovalToken(){return randomBytes(32).toString('hex');}

export function hashApprovalToken(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('Link de aprovação inválido ou expirado.');
  return createHash('sha256').update(token.toLowerCase(),'utf8').digest('hex');
}

function encryptionKey(secret){
  if(typeof secret!=='string'||secret.length<32)throw new Error('Chave de criptografia de links indisponível.');
  return createHash('sha256').update(secret,'utf8').digest();
}

export function encryptApprovalToken(token,secret){
  hashApprovalToken(token);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(secret),iv);
  const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptApprovalToken(value,secret){
  try{
    const [ivText,tagText,cipherText]=String(value||'').split('.');
    const decipher=createDecipheriv('aes-256-gcm',encryptionKey(secret),Buffer.from(ivText,'base64url'));
    decipher.setAuthTag(Buffer.from(tagText,'base64url'));
    const token=Buffer.concat([decipher.update(Buffer.from(cipherText,'base64url')),decipher.final()]).toString('utf8');
    hashApprovalToken(token);return token;
  }catch{throw new Error('Link de aprovação indisponível. Gere um novo link.');}
}
