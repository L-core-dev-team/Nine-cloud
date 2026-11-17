import { useEffect, useState } from 'react';
import { cloudRequest } from '../cloud-sync';
import { CardLibrary } from './CardLibrary';
import { CardSession } from './CardSession';
import { useCardAvailability } from '../card-availability';

type CardAreaProps = {sessionId?:string|undefined;onBack:()=>void;onSession:(id:string)=>void;onLogin:()=>void};
export function CardArea(props: CardAreaProps) {
  const available = useCardAvailability();
  if (available !== true) return <section className="card"><p role="status">{available === null ? '正在核对角色卡服务…' : '当前服务暂未开放角色卡模式。'}</p><button onClick={props.onBack}>返回</button></section>;
  return <AuthenticatedCardArea {...props}/>;
}
function AuthenticatedCardArea({sessionId,onBack,onSession,onLogin}:CardAreaProps) {
  const [owner,setOwner]=useState<string|null>(null),[notice,setNotice]=useState('正在核对账号…');
  const [checking,setChecking]=useState(true);
  useEffect(()=>{
    let active=true, generation=0, request:AbortController|undefined;
    const check=async()=>{
      const n=++generation;request?.abort();request=new AbortController();setChecking(true);setNotice('正在核对账号…');
      try {
        const v=await cloudRequest('/api/auth/session','GET',undefined,undefined,request.signal);
        const account=v.account as {id?:unknown}|undefined;
        if(!active||n!==generation)return;
        if(typeof account?.id!=='string')throw Error();
        setOwner(account.id);setNotice('');
      }catch{if(active&&n===generation){setOwner(null);setNotice('请先登录角色卡所属账号。');}}
      finally{if(active&&n===generation)setChecking(false);}
    };
    const focus=()=>void check();
    const visible=()=>{if(document.visibilityState==='visible')focus();};
    void check();
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('jiuxiao-cloud-game-session');
    if(channel)channel.onmessage=focus;
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);
    return()=>{active=false;generation++;request?.abort();channel?.close();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
  },[]);
  if(!owner)return <section className="card"><p role="status">{notice}</p><button className="primary" onClick={onLogin}>账号与云档</button><button onClick={onBack}>返回大厅</button></section>;
  // Hide/inert while identity is unknown, but preserve the same owner's unsent draft.
  // A changed owner key or failed verification still destroys the old private view.
  return <>{checking&&<section className="card"><p role="status">正在核对账号…</p></section>}
    <div hidden={checking} inert={checking} style={checking?undefined:{display:'contents'}}>
      {sessionId?<CardSession key={`${owner}:${sessionId}`} owner={owner} sessionId={sessionId} onBack={onBack}/>:<CardLibrary key={owner} owner={owner} onSession={onSession} onBack={onBack}/>}
    </div></>;
}
