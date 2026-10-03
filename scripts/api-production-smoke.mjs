// Public endpoint checks only: no email sent, no credentials printed.
const raw=process.env.PUBLIC_API_BASE_URL;
try{
 const base=new URL(raw||'');
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('PUBLIC_HTTPS_API_REQUIRED');
 for(const [path,status] of [['/health',200],['/ready',200],['/api/auth/session',401]]){
  const response=await fetch(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status!==status)throw new Error('API_SMOKE_FAILED');await response.body?.cancel();
 }
 console.log(JSON.stringify({status:'PUBLIC_API_SMOKE_PASS',emailDelivery:'NOT_TESTED',authenticatedCloud:'NOT_TESTED'}));
}catch(error){console.error(JSON.stringify({status:'PUBLIC_API_SMOKE_FAILED',code:['PUBLIC_HTTPS_API_REQUIRED','API_SMOKE_FAILED'].includes(error?.message)?error.message:'PUBLIC_API_UNREACHABLE'}));process.exitCode=1;}
