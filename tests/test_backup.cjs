const assert = require('node:assert/strict');
const {validateBackup} = require('../backup.js');
const template = {id:'abc',title:'Submit assignment',course:'FST',due:'2026-11-20',priority:'high',done:false,notes:'Prepare report'};
function payload(tasks){return JSON.stringify({app:'StudyFlow',exportedAt:'2026-11-15T00:00:00Z',tasks});}
function mustReject(data,pattern){assert.throws(()=>validateBackup(data),pattern);}
assert.deepEqual(validateBackup(payload([template])),[template]);
assert.deepEqual(validateBackup(payload([])),[]);
mustReject('{bad json',/not valid JSON/);
mustReject(JSON.stringify({app:'Other',tasks:[template]}),/not a StudyFlow/);
mustReject(payload([{...template,id:''}]),/identifier/);
mustReject(payload([template,template]),/duplicate/);
mustReject(payload([{...template,title:'  '}]),/title/);
mustReject(payload([{...template,due:'2026-02-30'}]),/impossible date/);
mustReject(payload([{...template,priority:'urgent'}]),/priority/);
mustReject(payload([{...template,done:'false'}]),/completion/);
mustReject(payload([{...template,notes:'x'.repeat(301)}]),/notes/);
mustReject(payload(Array.from({length:501},(_,i)=>({...template,id:String(i)}))),/at most 500/);
assert.equal(validateBackup(payload([{...template,title:'  Clean title  ' }]))[0].title,'Clean title');
console.log('12 backup validation checks passed.');
