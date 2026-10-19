import {createHash,randomBytes} from 'node:crypto';

export function createClientPortalToken(){return randomBytes(32).toString('hex')}

export function hashClientPortalToken(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw new Error('Link do portal inválido.');
  return createHash('sha256').update(token.toLowerCase(),'utf8').digest('hex');
}
