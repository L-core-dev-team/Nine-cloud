// Public endpoint checks only: no email sent, no credentials printed.
const raw=process.env.PUBLIC_API_BASE_URL;
// 路线 A（AUTH_ENABLED=false 且边缘封锁写端点）：/api/auth/session 由 API notFound 返回 404，
// 封锁端点返回 404；默认（auth 已挂载）维持原 401 契约。
const routeA=process.env.SMOKE_ROUTE_A==='1';
try{
 const base=new URL(raw||'');
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('PUBLIC_HTTPS_API_REQUIRED');
 const checks=[['/health',200],['/ready',200],['/api/auth/session',routeA?404:401]];
 if(routeA)checks.push(['/api/auth/guest',404],['/api/account/capabilities',404]);
 for(const [path,status] of checks){
  const response=await fetch(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status!==status)throw new Error('API_SMOKE_FAILED');await response.body?.cancel();
 }
 console.log(JSON.stringify({status:'PUBLIC_API_SMOKE_PASS',routeA:routeA||undefined,emailDelivery:'NOT_TESTED',authenticatedCloud:'NOT_TESTED'}));
}catch(error){console.error(JSON.stringify({status:'PUBLIC_API_SMOKE_FAILED',code:['PUBLIC_HTTPS_API_REQUIRED','API_SMOKE_FAILED'].includes(error?.message)?error.message:'PUBLIC_API_UNREACHABLE'}));process.exitCode=1;}
