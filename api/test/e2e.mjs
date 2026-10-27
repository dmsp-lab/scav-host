// End-to-end smoke test for a FRESH stack (empty database, default seed).
//   docker compose up -d   then   node api/test/e2e.mjs
// Needs ffmpeg on your machine to generate the test photo and video. It writes test data,
// so reset afterwards with: docker compose down -v && docker compose up -d
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
process.chdir(tmpdir());
execFileSync('ffmpeg', ['-loglevel','error','-y','-f','lavfi','-i','testsrc=size=1920x1080:rate=30','-t','3','-f','lavfi','-i','sine=frequency=440','-t','3','-c:v','libx264','-c:a','aac','-shortest','clip.mov']);
execFileSync('ffmpeg', ['-loglevel','error','-y','-f','lavfi','-i','testsrc=size=3000x2000','-frames:v','1','photo.jpg']);
const B=process.env.API_URL||'http://localhost:8080';
const PARTY=process.env.PARTY_CODE||'gobble', GMCODE=process.env.ADMIN_CODE||'gamemaster';
const jar={};
async function call(who,method,path,body){
  const r=await fetch(B+path,{method,headers:{'content-type':'application/json',...(jar[who]?{cookie:jar[who]}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});
  const sc=r.headers.get('set-cookie'); if(sc) jar[who]=sc.split(';')[0];
  const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t}
  return {status:r.status,body:j,loc:r.headers.get('location')};
}
const must=(c,m)=>{ if(!c) {console.error('FAIL',m); process.exit(1);} else console.log('ok -',m); };
const pl=await call('x','GET','/api/players');
must(pl.body.teams.length===3 && pl.body.players.length===10,'3 teams, 9 players + GM');
const lani=pl.body.players.find(p=>p.name==='Lani'), gm=pl.body.players.find(p=>p.isAdmin), david=pl.body.players.find(p=>p.name==='David');
must((await call('lani','POST','/api/auth/login',{playerId:lani.id,code:'wrong'})).status===401,'wrong code rejected');
must((await call('lani','POST','/api/auth/login',{playerId:lani.id,code:PARTY.toUpperCase()})).status===200,'Lani signs in');
must((await call('gm','POST','/api/auth/login',{playerId:gm.id,code:'gobble'})).status===401,'GM needs GM code');
must((await call('gm','POST','/api/auth/login',{playerId:gm.id,code:GMCODE})).status===200,'GM signs in');
await call('david','POST','/api/auth/login',{playerId:david.id,code:PARTY});
const me=await call('lani','GET','/api/me'); must(me.body.team.members.length===3,'me has team of 3: '+me.body.team.members.map(m=>m.name));
const qs=await call('lani','GET','/api/quests'); must(qs.body.length===85,'85 quests');
const g=qs.body.find(q=>q.id==='POP-06'); must(g.totalPoints===15+1+5,'group total = base+bonus+5 ('+g.totalPoints+')');
must((await call('lani','GET','/api/admin/submissions')).status===403,'players blocked from admin');
async function upload(file,mime){
  const buf=await readFile(file);
  const u=await call('lani','POST','/api/uploads',{filename:file,mimeType:mime,size:buf.length});
  must(u.status===200,'presign '+file);
  const put=await fetch(u.body.uploadUrl,{method:'PUT',headers:u.body.headers,body:buf});
  must(put.ok,'PUT to storage '+put.status);
  must((await call('lani','POST',`/api/uploads/${u.body.mediaId}/complete`)).status===200,'complete');
  return u.body.mediaId;
}
must((await call('lani','POST','/api/uploads',{filename:'a.pdf',mimeType:'application/pdf',size:10})).status===400,'non-media rejected');
const ids=[await upload('photo.jpg','image/jpeg'), await upload('clip.mov','video/quicktime')];
const sub=await call('lani','POST','/api/submissions',{questId:'POP-02',text:'Pivot!',mediaIds:ids});
must(sub.status===201 && sub.body.media.length===2,'submission created');
must((await call('lani','POST','/api/submissions',{questId:'POP-02',mediaIds:ids})).status===409,'media cannot be reused');
const dv=await call('david','GET','/api/submissions'); must(dv.body.length===0,'other team cannot see pending');
for(let i=0;i<30;i++){ const s=await call('lani','GET','/api/quests/POP-02'); if(s.body.submissions[0].media.every(m=>m.status==='ready')) break; await new Promise(r=>setTimeout(r,1000)); }
const det=await call('lani','GET','/api/quests/POP-02'); must(det.body.submissions[0].media.every(m=>m.status==='ready'),'worker processed media: '+det.body.submissions[0].media.map(m=>m.status));
const q1=(await call('lani','GET','/api/quests')).body.find(q=>q.id==='POP-02'); must(q1.myStatus==='pending','quest shows pending');
const queue=await call('gm','GET','/api/admin/submissions'); must(queue.body.length===1,'GM sees queue');
const rv=await call('gm','POST',`/api/admin/submissions/${sub.body.id}/review`,{status:'approved'}); must(rv.body.pointsAwarded===13,'approved with full points '+rv.body.pointsAwarded);
const lb=await call('david','GET','/api/leaderboard'); must(lb.body.teams[0].name==='Team 1' && lb.body.teams[0].points===13,'leaderboard');
must((await call('david','GET','/api/submissions')).body.length===1,'approved visible to everyone');
const thumb=await call('david','GET',`/api/media/${ids[1]}/thumb`); must(thumb.status===302,'media redirect');
const img=await fetch(thumb.loc); must(img.ok && (await img.arrayBuffer()).byteLength>1000,'thumb downloadable');
const disp=await call('david','GET',`/api/media/${ids[1]}/display`); const v=await fetch(disp.loc,{headers:{Range:'bytes=0-15'}}); must(v.headers.get('content-type')==='video/mp4','display is mp4');
must((await call('lani','DELETE',`/api/submissions/${sub.body.id}`)).status===409,'cannot delete reviewed');
must((await call('gm','PATCH','/api/admin/quests/SEA-08',{isActive:false})).status===200,'GM deactivates quest');
must((await call('lani','GET','/api/quests')).body.length===84,'hidden from players');
must((await call('gm','POST','/api/admin/players',{name:'Extra Friend',teamId:null})).status===200,'GM adds player');
console.log('ALL PASSED');
