import { useEffect, useState } from 'react';
import { cloudRequest } from '../cloud-sync';
import { CardLibrary } from './CardLibrary';
import { CardSession } from './CardSession';

export function CardArea({sessionId,onBack,onSession,onLogin}:{sessionId?:string|undefined;onBack:()=>void;onSession:(id:string)=>void;onLogin:()=>void}) {
  const [owner,setOwner]=useState<string|null>(null),[notice,setNotice]=useState('正在核对账号…');
  useEffect(()=>{let active=true;let generation=0;const check=async()=>{const n=++generation;try {const v=await cloudRequest('/api/auth/session');const account=v.account as {id?:unknown}|undefined;if(!active||n!==generation)return;if(typeof account?.id!=='string')throw Error();setOwner(account.id);setNotice('');}catch{if(active&&n===generation){setOwner(null);setNotice('请先登录角色卡所属账号。');}}};void check();const focus=()=>{setOwner(null);setNotice('正在核对账号…');void check();};const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('jiuxiao-cloud-game-session');if(channel)channel.onmessage=focus;window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{active=false;generation++;channel?.close();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[]);
  if(!owner)return <section className="card"><p role="status">{notice}</p><button className="primary" onClick={onLogin}>账号与云档</button><button onClick={onBack}>返回大厅</button></section>;
  return sessionId?<CardSession key={`${owner}:${sessionId}`} owner={owner} sessionId={sessionId} onBack={onBack}/>:<CardLibrary key={owner} owner={owner} onSession={onSession} onBack={onBack}/>;
}
