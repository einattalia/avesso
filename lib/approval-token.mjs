import {createHash,randomBytes} from 'node:crypto';

export function createApprovalToken(){return randomBytes(32).toString('hex');}

export function hashApprovalToken(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('Link de aprovação inválido ou expirado.');
  return createHash('sha256').update(token.toLowerCase(),'utf8').digest('hex');
}
