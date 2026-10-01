import { useEffect, useRef, useState } from 'react';
import { CloudHttpError, CloudSync, IndexedCloudQueue, archiveFromEnvelope, cloudRequest, type CloudRecord } from '../cloud-sync';
import type { LocalSave } from '../storage';

type Account = { id: string; email: string };
function readAccount(value: unknown): Account {
  if (!value || typeof value !== 'object' || !('id' in value) || !('email' in value) || typeof value.id !== 'string' || typeof value.email !== 'string') throw new Error('INVALID_ACCOUNT');
  return { id: value.id, email: value.email };
}
export function CloudSettings({ saves, onRestore }: { saves: LocalSave[]; onRestore: (save: LocalSave) => Promise<boolean> }) {
  const sync = useRef(new CloudSync(new IndexedCloudQueue())).current;
  const [account, setAccount] = useState<Account | null>(null); const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [notice, setNotice] = useState('正在检查云档服务…'); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [queue, setQueue] = useState<CloudRecord[]>([]); const [remote, setRemote] = useState<Array<{ saveId: string; name: string; revision: number }>>([]); const [offset, setOffset] = useState(0); const [hasMore, setHasMore] = useState(false);
  const refresh = async (owner: string, pageOffset = offset) => {
    const result = await cloudRequest(`/api/save-index?offset=${pageOffset}&limit=20`, 'GET', undefined, owner);
    if (!Array.isArray(result.saves) || !result.saves.every(value => value && typeof value.saveId === 'string' && typeof value.name === 'string' && Number.isSafeInteger(value.revision))) throw new Error('INVALID_CLOUD_RESPONSE');
    setRemote(result.saves as Array<{ saveId: string; name: string; revision: number }>); setHasMore(result.hasMore === true); setOffset(pageOffset);
    setQueue(await sync.list(owner));
  };
  useEffect(() => {
    let active = true;
    void cloudRequest('/api/auth/session').then(async result => {
      if (!active) return; const user = readAccount(result.account); setAccount(user); await refresh(user.id); if (active) setNotice('已登录。云端备份需手动提交，本地存档始终保留。');
    }).catch(error => { if (active) setNotice(error instanceof CloudHttpError && error.status === 401 ? '使用邮箱验证码登录。' : '云档服务尚未启用或暂不可用；本地功能不受影响。'); });
    return () => { active = false; };
  }, []);
  const act = async (work: () => Promise<string>) => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true);
    try { setNotice(await work()); } catch (error) {
      setNotice(error instanceof CloudHttpError && error.status === 401 ? '会话失效或账号已切换，请重新登录。原账号队列保留。' : error instanceof CloudHttpError && error.status === 429 ? '验证码发送过于频繁，请稍后重试。' : '操作未完成。未确认的上传保留在队列，本地存档未覆盖；可稍后重试。');
      if (error instanceof CloudHttpError && error.status === 401) { setAccount(null); setRemote([]); setQueue([]); }
      if (account) { try { setQueue(await sync.list(account.id)); } catch { /* Keep visible previous queue. */ } }
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <section className="card" aria-busy={busy}><span className="eyebrow">账号与云端备份</span><h1>云档</h1><p role="status">{notice}</p>
    {!account ? <><label>邮箱<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={busy} onClick={() => void act(async () => { await cloudRequest('/api/auth/code', 'POST', { email }); return '验证码已发送，10 分钟内有效。'; })}>发送验证码</button>
      <label>验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /></label>
      <button disabled={busy} onClick={() => void act(async () => { const result = await cloudRequest('/api/auth/verify', 'POST', { email, code }); const user = readAccount(result.account); setAccount(user); setCode(''); await refresh(user.id); return '已登录。'; })}>登录</button></>
      : <><p>{account.email}</p><div className="actions"><button disabled={busy} onClick={() => void act(async () => { await cloudRequest('/api/auth/refresh', 'POST', {}, account.id); return '会话已刷新。'; })}>刷新会话</button>
        <button disabled={busy} onClick={() => void act(async () => { await cloudRequest('/api/auth/logout', 'POST', {}, account.id); setAccount(null); setRemote([]); setQueue([]); return '已退出；本地存档及未完成队列保留。'; })}>退出</button>
        <button disabled={busy} onClick={() => void act(async () => { await sync.flush(account.id); await refresh(account.id); return '已重试队列。冲突需要逐项选择。'; })}>重试待上传</button></div>
        <h2>本地存档</h2>{saves.map(save => <div key={save.saveId}><span>{save.name}</span><button disabled={busy} onClick={() => void act(async () => { await sync.enqueue(account.id, save); await sync.flush(account.id); await refresh(account.id); return '已处理备份请求；若有冲突，请先核对双方版本。'; })}>备份到云端</button></div>)}
        <h2>待上传与冲突</h2>{queue.filter(r => r.pending || r.conflict).map(record => <div key={record.key}><p>{record.localSaveId}：{record.conflict ? '云端已变化，上传暂停' : '待重试'}</p>
          {record.conflict && <><p>本地回合：{record.pending ? archiveFromEnvelope(record.pending).revision : '无'}；云端回合：{archiveFromEnvelope(record.conflict).revision}</p>
            <button disabled={busy} onClick={() => void act(async () => { await sync.keepLocal(record); await sync.flush(account.id); await refresh(account.id); return '按已核对的云端版本重试；后续变化仍会触发冲突。'; })}>确认用本地更新云端</button>
            <button disabled={busy} onClick={() => void act(async () => { if (!await onRestore(archiveFromEnvelope(record.conflict))) throw new Error('LOCAL_WRITE_FAILED'); await sync.discardUpload(record); await refresh(account.id); return '云端版本已另存本地副本，原档保留。'; })}>云端另存本地副本</button></>}
        </div>)}<h2>云端备份</h2>{remote.map((save, index) => <div key={`${save.saveId}-${index}`}><span>{save.name} · 回合 {save.revision}</span>
          <button disabled={busy} onClick={() => void act(async () => { const cloud = await cloudRequest(`/api/saves/${encodeURIComponent(save.saveId)}`, 'GET', undefined, account.id); if (!await onRestore(archiveFromEnvelope(cloud.save))) throw new Error('LOCAL_WRITE_FAILED'); return '已恢复为本地新副本，原档保留。'; })}>恢复为本地副本</button></div>)}
        <div className="actions"><button disabled={busy || offset === 0} onClick={() => void act(async () => { await refresh(account.id, Math.max(0, offset - 20)); return '已读取上一页。'; })}>上一页</button>
          <button disabled={busy || !hasMore} onClick={() => void act(async () => { await refresh(account.id, offset + 20); return '已读取下一页。'; })}>下一页</button></div></>}
  </section>;
}
