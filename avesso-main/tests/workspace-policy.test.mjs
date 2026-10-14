import test from 'node:test';
import assert from 'node:assert/strict';
import {eventPayload,overlaps,safeLink,localInput,brazilISO} from '../lib/workspace-policy.mjs';
const a={title:'Gravação',kind:'recording',starts_at:'2026-10-06T13:00:00Z',ends_at:'2026-10-06T14:00:00Z',member_ids:['a'],buffer_before:0,buffer_after:0,status:'scheduled'};
test('agenda blocks shared people across clients but allows independent teams',()=>{assert.equal(overlaps(a,{...a,client_id:'other'}),true);assert.equal(overlaps(a,{...a,member_ids:['b']}),false);assert.equal(overlaps(a,{...a,member_ids:[]}),true)});
test('adjacent events allowed; travel buffers block; posts and cancellations do not',()=>{const b={...a,starts_at:a.ends_at,ends_at:'2026-10-06T15:00:00Z'};assert.equal(overlaps(a,b),false);assert.equal(overlaps({...a,buffer_after:15},b),true);assert.equal(overlaps(a,{...a,kind:'post'}),false);assert.equal(overlaps(a,{...a,status:'cancelled'}),false)});
test('input validates times and buffers and hides internal blocks',()=>{assert.throws(()=>eventPayload({...a,ends_at:a.starts_at}));assert.throws(()=>eventPayload({...a,buffer_before:-1}));assert.equal(eventPayload({...a,kind:'block',shared:true}).shared,false)});
test('references allow no link but reject executable links',()=>{assert.equal(safeLink(''),'');assert.equal(safeLink('https://example.com/x'),'https://example.com/x');assert.throws(()=>safeLink('javascript:alert(1)'));assert.throws(()=>safeLink('https://user:pass@example.com'))});
test('Brazil calendar date survives UTC midnight and is round tripped',()=>{assert.equal(localInput('2026-10-07T01:00:00Z'),'2026-10-06T22:00');assert.equal(brazilISO('2026-10-06T22:00'),'2026-10-07T01:00:00.000Z')});
