import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {createRecordPDF} from '../src/scripts/pdf.js';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const font=await readFile(new URL('../public/fonts/DejaVuSans.ttf',import.meta.url));
const draft={vehicle:{registration:'ND 123',make:'Citroën',model:'C3'},transport:{origin:'Durban',destination:'Cape Town'},damage:[{id:'mark',area:'Rear',kind:'Scratch',description:'Long condition note. '.repeat(100),photo:true}],photos:[{key:'front'},{key:'damage-mark'}]};

test('designed PDF paginates long notes and includes saved integrity pages',async()=>{
  const bytes=await createRecordPDF({id:'test-record',manifest:{...draft,finalizedAt:'2026-10-06T12:00:00Z',photos:draft.photos.map(p=>({...p,sha256:'a'.repeat(64)}))},manifestSha256:'b'.repeat(64)}, {'front':png,'damage-mark':png},font);
  const loaded=await PDFDocument.load(bytes);
  assert.ok(loaded.getPageCount()>=5);
  assert.equal(loaded.getTitle(),'How It Was - ND 123');
  assert.ok(loaded.getPages().every(page=>page.getWidth()>590 && page.getHeight()>840));
});

test('missing required images fail rather than producing a misleading PDF',async()=>{
  await assert.rejects(()=>createRecordPDF(draft,{front:png},font),/existing mark photo is missing/);
  await assert.rejects(()=>createRecordPDF(draft,{},font),/photo is missing/);
});
