import { randomUUID } from 'node:crypto';
export type AuthStage = 'verification_store' | 'mail_connect' | 'mail_send' | 'auth_config' | 'sms_config' | 'sms_send' | 'auth_verify' | 'auth_request' | 'identity_map' | 'identity_link';
export class AuthFailure extends Error {
 constructor(readonly code:string,readonly stage:AuthStage,readonly requestId=randomUUID()){super(code);}
}
export type AuthDiagnostic={requestId:string;stage:string;code:string;responseCode?:number};
export function classifyMailFailure(error:unknown):AuthFailure {
 const value=error&&typeof error==='object'?error as {code?:unknown;responseCode?:unknown}:{};
 if(value.code==='EAUTH')return new AuthFailure('MAIL_AUTH_FAILED','mail_connect');
 if(['ETIMEDOUT','ESOCKET','ECONNECTION','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETLS'].includes(String(value.code)))return new AuthFailure('MAIL_UNAVAILABLE','mail_connect');
 if(value.code==='EENVELOPE'||value.code==='EMESSAGE'||(typeof value.responseCode==='number'&&value.responseCode>=500))return new AuthFailure('MAIL_REJECTED','mail_send');
 return new AuthFailure('MAIL_UNAVAILABLE','mail_send');
}
