// Run from workspace root: node --env-file=.env scripts/verify-auth-mail.mjs
// Checks DNS/TCP/TLS/AUTH only. Never sends a message or prints credentials.
import {createEmailAuthRuntime} from '../apps/api/dist/services/auth-runtime.js';
try {
 const runtime=createEmailAuthRuntime({},process.env);
 if(!runtime)throw Object.assign(new Error('AUTH_DISABLED'),{code:'AUTH_DISABLED'});
 console.log(JSON.stringify(await runtime.verifyMail()));
}catch(error){console.error(JSON.stringify({status:'MAIL_PREFLIGHT_FAILED',code:error?.code??'AUTH_CONFIGURATION_INVALID',stage:error?.stage??'configuration'}));process.exitCode=1;}
