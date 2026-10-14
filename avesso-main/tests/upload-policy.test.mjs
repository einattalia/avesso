import test from 'node:test';
import assert from 'node:assert/strict';
import {PART_SIZE,validateFile,validateParts,canReadClientVersion} from '../lib/upload-policy.mjs';
const file={name:'produção.mp4',size:3*1024**3,type:'video/mp4',fingerprint:'a'.repeat(64)};
test('accepts multi-GB videos and rejects malformed metadata',()=>{
  assert.doesNotThrow(()=>validateFile(file));
  for(const bad of [{size:0},{size:51*1024**3},{size:1.5},{type:'text/html'},{name:''},{fingerprint:'x'}]) assert.throws(()=>validateFile({...file,...bad}));
});
test('validates ordered, complete multipart list including last-part size',()=>{
  const parts=[{PartNumber:2,ETag:'two',Size:7},{PartNumber:1,ETag:'one',Size:PART_SIZE}];
  assert.deepEqual(validateParts(parts,PART_SIZE+7),[{PartNumber:1,ETag:'one'},{PartNumber:2,ETag:'two'}]);
  assert.throws(()=>validateParts(parts.slice(1),PART_SIZE+7));
  assert.throws(()=>validateParts([{...parts[0],Size:8},parts[1]],PART_SIZE+7));
  assert.throws(()=>validateParts([{...parts[0],PartNumber:1},parts[1]],PART_SIZE+7));
  assert.throws(()=>validateParts([{...parts[0],ETag:''},parts[1]],PART_SIZE+7));
});
test('client reads exclude draft and unknown states',()=>{
  assert.equal(canReadClientVersion('draft'),false);
  assert.equal(canReadClientVersion('sent_for_review'),true);
  assert.equal(canReadClientVersion('delivered'),true);
  assert.equal(canReadClientVersion('internal_review'),false);
});
