import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { openGame } from './game.mjs';
import { fileURLToPath } from 'node:url';
import {randomUUID} from 'node:crypto';

const dist=fileURLToPath(new URL('../../../apps/web/dist/',import.meta.url));
export async function listen({file,generate,source,port=0,allowStart=true}){
  const game=openGame(file,generate,source);
  const secret=randomUUID();
  let origin;
  const server=createServer(async (req,res)=>{
    try{
      if(req.headers.host!==new URL(origin).host){res.writeHead(403).end();return}
      const {pathname,searchParams}=new URL(req.url,origin);
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Referrer-Policy','no-referrer');
      if(req.method==='POST'&&req.headers.origin!==origin){res.writeHead(403).end();return}
      if(pathname==='/start' && req.method==='GET' && searchParams.get('ticket')===secret && allowStart){
        const old=await game.app.request('/api/auth/session',{headers:{cookie:req.headers.cookie??''}});
        const owner=(await old.json()).account.id;
        const saved=owner&&!searchParams.has('fresh')&&game.db.prepare('select id from saves where owner=? order by rowid desc limit 1').get(owner);
        const trial=saved?{id:saved.id,token:game.db.prepare('SELECT token FROM sessions WHERE owner=?').get(owner).token}:await game.create(owner??undefined);
        res.writeHead(303,{'Set-Cookie':'greywing='+trial.token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800',Location:'/game/'+trial.id}).end();return;
      }
      if(pathname.startsWith('/api/')){
        if(!['GET','POST'].includes(req.method)){res.writeHead(405).end();return}
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return}chunks.push(chunk)}
        const response=await game.app.request(origin+pathname+new URL(req.url,origin).search,{method:req.method,headers:req.headers,
          ...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
        res.writeHead(response.status,{'Content-Type':'application/json'}).end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(req.method!=='GET'){res.writeHead(405).end();return}
      const target=resolve(dist,'.'+decodeURIComponent(extname(pathname)?pathname:'/index.html'));
      if(!target.startsWith(resolve(dist)+sep)){res.writeHead(404).end();return}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
      res.setHeader('Content-Type',mime[extname(target)]??'application/octet-stream');
      const bytes=await readFile(target);
      res.end(extname(target)==='.html'?bytes.toString().replace('<head>','<head><meta name="ninecloud-isolated-playtest" content="true">'):bytes);
    }catch{if(!res.headersSent)res.writeHead(404);res.end()}
  });
  await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes)});
  origin='http://127.0.0.1:'+server.address().port;
  return {...game,origin,startURL:origin+'/start?ticket='+secret,async close(){
    await new Promise(done=>server.close(done));game.db.close();
  }};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {spawn}=await import('node:child_process');
  const {playerNarrator}=await import('./provider.mjs');
  const key=process.env.NARRATIVE_KEY_CARD_LOCAL;
  delete process.env.NARRATIVE_KEY_CARD_LOCAL;
  const server=await listen({file:resolve(process.argv[2]??'greywing-demo.sqlite'),port:47811,generate:playerNarrator(key),source:'model'});
  console.log('芦花渡试玩 · 关闭窗口即可结束。',server.startURL);
  const url=server.startURL+(process.argv.includes('--fresh')?'&fresh=1':'');
  if(process.argv.includes('--open'))spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore'}).unref();
}
