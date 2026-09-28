import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteRecord,expired,removeExpired} from '../server/retention.js';

test('a saved record expires after twelve calendar months',()=>{
  assert.equal(expired('2026-09-28T10:00:00.000Z',new Date('2027-09-28T09:59:59.000Z')),false);
  assert.equal(expired('2026-09-28T10:00:00.000Z',new Date('2027-09-28T10:00:00.000Z')),true);
  assert.equal(expired('2024-02-29T10:00:00.000Z',new Date('2025-02-28T12:00:00.000Z')),false);
});

test('retention removes R2 photos and manifest before deleting D1 rows',async()=>{
  const operations=[],id='123e4567-e89b-12d3-a456-426614174000';
  const env={
    PHOTOS:{
      async list({prefix}){assert.equal(prefix,'records/'+id+'/');return {objects:operations.some(op=>op[0]==='objects')?[]:[{key:prefix+'manifest.json'},{key:prefix+'photos/front'}],truncated:false};},
      async delete(keys){operations.push(['objects',keys]);}
    },
    DB:{prepare(sql){return {bind(...args){return {
      async all(){assert.match(sql,/finalized_at/);assert.equal(args[0],'2026-09-28T00:00:00.000Z');return {results:[{id}]};},
      async run(){operations.push([sql,args]);}
    };}}}}
  };
  assert.equal(await removeExpired(env,new Date('2027-09-28T00:00:00.000Z')),1);
  assert.equal(operations.length,4);
  assert.match(operations[0][0],/status = 'deleting'/);
  assert.equal(operations[1][0],'objects');
  assert.match(operations[2][0],/DELETE FROM photos/);
  assert.match(operations[3][0],/DELETE FROM records/);
  operations.length=0;
  await deleteRecord(env,id);
  assert.equal(operations.length,4);
});
