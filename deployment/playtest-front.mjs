import {createServer, request as proxyRequest} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const allowedAuth=new Set(['/api/auth/session','/api/auth/providers','/api/auth/guest','/api/auth/refresh','/api/auth/logout']);
const hop=new Set(['connection','transfer-encoding','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','upgrade','host','authorization']);
/** Dedicated invited playtest gateway. Never used by production Pages or the production database. */
export function createPlaytestServer({webRoot,apiOrigin,accessHash,publicOrigin}) {
  const root=resolve(webRoot);const upstream=new URL(apiOrigin);const publicUrl=new URL(publicOrigin);
  if(!['127.0.0.1','localhost','api'].includes(upstream.hostname)||upstream.protocol!=='http:'||!/^https?:$/.test(publicUrl.protocol)||!/^[a-f0-9]{64}$/.test(accessHash))throw new Error('INVALID_PLAYTEST_CONFIGURATION');
  const expected=Buffer.from(accessHash,'hex');
  const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
  return createServer(async(req,res)=>{
    res.setHeader('X-Ninecloud-Environment','isolated-playtest');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
    const header=req.headers.authorization??'';const digest=createHash('sha256').update(header).digest();
    if(!timingSafeEqual(digest,expected)){res.setHeader('WWW-Authenticate','Basic realm="Nine-cloud invited playtest", charset="UTF-8"');res.writeHead(401);res.end('需要测试访问口令。');return;}
    let url;try{url=new URL(req.url??'/',publicUrl);}catch{return json(res,400,{code:'INVALID_REQUEST'});}
    if(url.origin!==publicUrl.origin||/[\\\u0000]/.test(url.pathname))return json(res,400,{code:'INVALID_REQUEST'});
    const path=url.pathname;
    if(path.startsWith('/api/')||path==='/health'||path==='/ready'){
      if((path.startsWith('/api/auth/')&&!allowedAuth.has(path))||path==='/api/account'||path.startsWith('/api/account/'))return json(res,404,{code:'PLAYTEST_GUEST_ONLY'});
      if(path==='/api/auth/providers'&&req.method==='GET')return json(res,200,{email:false,phone:false,emailCaptcha:false,privacyPolicyUrl:'/privacy',privacyPolicyVersion:'isolated-playtest'});
      const headers=Object.fromEntries(Object.entries(req.headers).filter(([name])=>!hop.has(name.toLowerCase())));
      const forwarded=(req.headers['x-forwarded-for']??'').toString().split(',')[0].trim();
      headers['x-forwarded-for']=isIP(forwarded)?forwarded:req.socket.remoteAddress??'127.0.0.1';
      headers.host=publicUrl.host;
      const target=new URL(upstream);target.pathname=path;target.search=url.search;
      let bytes=0;const parts=[];
      try{for await(const chunk of req){bytes+=chunk.length;if(bytes>8*1024*1024)return json(res,413,{code:'REQUEST_TOO_LARGE'});parts.push(chunk);}}catch{return;}
      const proxy=proxyRequest(target,{method:req.method,headers,timeout:45000},response=>{
        if(response.statusCode>=300&&response.statusCode<400){response.resume();return json(res,502,{code:'UNEXPECTED_UPSTREAM_REDIRECT'});}
        for(const [name,value]of Object.entries(response.headers))if(value!==undefined&&!hop.has(name)&&name!=='cache-control')res.setHeader(name,value);
        res.setHeader('Cache-Control','no-store');res.writeHead(response.statusCode??502);response.pipe(res);
      });
      proxy.on('timeout',()=>proxy.destroy());proxy.on('error',()=>{if(!res.headersSent)json(res,502,{code:'PLAYTEST_API_UNAVAILABLE'});else res.destroy();});proxy.end(Buffer.concat(parts));return;
    }
    if(!['GET','HEAD'].includes(req.method??''))return json(res,405,{code:'METHOD_NOT_ALLOWED'});
    try{
      const decoded=decodeURIComponent(path);if(decoded.includes('\\')||decoded.includes('\0'))return json(res,400,{code:'INVALID_PATH'});
      let file=resolve(root,'.'+decoded);if(!file.startsWith(root+sep)&&file!==root)return json(res,404,{code:'NOT_FOUND'});
      let info;try{info=await stat(file);}catch{}
      if(!info?.isFile()){if(extname(decoded))return json(res,404,{code:'NOT_FOUND'});file=resolve(root,'index.html');}
      file=await realpath(file);if(!file.startsWith(root+sep))return json(res,404,{code:'NOT_FOUND'});
      const extension=extname(file);let content=await readFile(file);
      if(extension==='.html')content=Buffer.from(content.toString('utf8').replace('<head>','<head><meta name="ninecloud-isolated-playtest" content="true">'));
      res.setHeader('content-type',mime[extension]??'application/octet-stream');
      res.setHeader('Cache-Control',extension==='.html'?'no-store':/\/assets\//.test(path)?'public, max-age=31536000, immutable':'no-cache');
      res.writeHead(200);res.end(req.method==='HEAD'?undefined:content);
    }catch{return json(res,404,{code:'NOT_FOUND'});}
  });
}
if(import.meta.url===(process.argv[1]?pathToFileURL(resolve(process.argv[1])).href:'')){
  const server=createPlaytestServer({webRoot:process.env.PLAYTEST_WEB_ROOT??'/app/playtest-web',apiOrigin:process.env.PLAYTEST_API_ORIGIN??'http://api:8787',accessHash:process.env.PLAYTEST_ACCESS_SHA256??'',publicOrigin:process.env.AUTH_PUBLIC_ORIGIN??''});
  server.listen(Number(process.env.PLAYTEST_PORT??8080),'0.0.0.0',()=>console.log('Isolated invited playtest gateway listening'));
}
