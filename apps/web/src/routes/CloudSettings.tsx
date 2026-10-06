import { useEffect, useRef, useState } from 'react';
import { CloudHttpError, CloudSync, IndexedCloudQueue, archiveFromEnvelope, cloudRequest, type CloudRecord } from '../cloud-sync';
import type { LocalSave } from '../storage';
import { serializeSaveForExport } from '../export-save';
import { AccountLifecyclePanel } from './AccountLifecyclePanel';

type Account = { id: string; kind: 'email'; email: string } | { id: string; kind: 'guest' };
function readAccount(value: unknown): Account {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw new Error('INVALID_ACCOUNT');
  if ('kind' in value && value.kind === 'guest' && !('email' in value)) return { id: value.id, kind: 'guest' };
  if ('email' in value && typeof value.email === 'string') return { id: value.id, kind: 'email', email: value.email };
  throw new Error('INVALID_ACCOUNT');
}
export function CloudSettings({ saves, onRestore }: { saves: LocalSave[]; onRestore: (save: LocalSave) => Promise<LocalSave | null> }) {
  const sync = useRef(new CloudSync(new IndexedCloudQueue())).current;
  const [account, setAccount] = useState<Account | null>(null); const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [upgradeEmail, setUpgradeEmail] = useState(''); const [upgradeCode, setUpgradeCode] = useState('');
  const [notice, setNotice] = useState('正在检查云档服务…'); const [busy, setBusy] = useState(true); const busyRef = useRef(true);
  const [queue, setQueue] = useState<CloudRecord[]>([]); const [remote, setRemote] = useState<Array<{ saveId: string; name: string; revision: number }>>([]); const [offset, setOffset] = useState(0); const [hasMore, setHasMore] = useState(false);
  const [trash, setTrash] = useState<Array<{ saveId: string; name: string; revision: number }>>([]); const [trashOffset, setTrashOffset] = useState(0); const [trashMore, setTrashMore] = useState(false);
  const refreshTrash = async (owner: string, pageOffset = trashOffset) => {
    const result = await cloudRequest(`/api/save-trash?offset=${pageOffset}`, 'GET', undefined, owner);
    if (!Array.isArray(result.saves) || !result.saves.every(value => value && typeof value.saveId === 'string' && typeof value.name === 'string' && Number.isSafeInteger(value.revision))) throw new Error('INVALID_CLOUD_RESPONSE');
    setTrash(result.saves as Array<{ saveId: string; name: string; revision: number }>); setTrashMore(result.hasMore === true); setTrashOffset(pageOffset);
  };
  const refresh = async (owner: string, pageOffset = offset) => {
    const result = await cloudRequest(`/api/save-index?offset=${pageOffset}&limit=20`, 'GET', undefined, owner);
    if (!Array.isArray(result.saves) || !result.saves.every(value => value && typeof value.saveId === 'string' && typeof value.name === 'string' && Number.isSafeInteger(value.revision))) throw new Error('INVALID_CLOUD_RESPONSE');
    setRemote(result.saves as Array<{ saveId: string; name: string; revision: number }>); setHasMore(result.hasMore === true); setOffset(pageOffset);
    setQueue(await sync.list(owner));
    await refreshTrash(owner, 0);
  };
  useEffect(() => {
    let active = true;
    void cloudRequest('/api/auth/session').then(async result => {
      if (!active) return; const user = readAccount(result.account); setAccount(user); await refresh(user.id, 0); if (active) setNotice(user.kind === 'guest' ? '游客会话已恢复。云端存档绑定此浏览器会话；升级为邮箱账号后才能跨设备找回。' : '已登录。云端备份需手动提交，本地存档始终保留。');
    }).catch(error => { if (active) setNotice(error instanceof Error && error.message === 'API_BASE_URL_NOT_CONFIGURED' ? '预览尚未配置公网 API；登录与云同步暂不可用，本地功能不受影响。' : error instanceof CloudHttpError && error.status === 401 ? '可创建游客会话，也可使用邮箱验证码登录。' : '云档服务尚未启用或暂不可用；本地功能不受影响。'); })
      .finally(() => { if (active) { busyRef.current = false; setBusy(false); } });
    return () => { active = false; };
  }, []);
  const act = async (work: () => Promise<string>) => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true);
    try { setNotice(await work()); } catch (error) {
      setNotice(error instanceof Error && error.message === 'API_BASE_URL_NOT_CONFIGURED' ? '预览尚未配置公网 API；登录与云同步暂不可用，本地功能不受影响。' : error instanceof CloudHttpError && error.status === 401 ? '会话失效或账号已切换，请重新登录。原账号队列保留。' : error instanceof CloudHttpError && error.status === 429 ? '验证码发送过于频繁，请稍后重试。' : '操作未完成。未确认的上传保留在队列，本地存档未覆盖；可稍后重试。');
      if (error instanceof CloudHttpError && error.code === 'UPGRADE_UNAVAILABLE') setNotice('邮箱升级未完成。账号与存档没有转移；请核对邮箱、验证码和当前游客会话后重试。');
      if (error instanceof CloudHttpError && error.status === 401) { setAccount(null); setRemote([]); setQueue([]); setTrash([]); }
      else if (account) { try { setQueue(await sync.list(account.id)); } catch { /* Keep visible previous queue. */ } }
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <section className="card cloud-page" aria-busy={busy}><span className="eyebrow">账号与云端备份</span><h1>云档</h1><p role="status">{notice}</p>
    {!account ? <><label>邮箱<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={busy} onClick={() => void act(async () => { await cloudRequest('/api/auth/code', 'POST', { email }); return '验证码已发送，10 分钟内有效。'; })}>发送验证码</button>
      <label>验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /></label>
      <button disabled={busy} onClick={() => void act(async () => { const result = await cloudRequest('/api/auth/verify', 'POST', { email, code }); const user = readAccount(result.account); setAccount(user); setCode(''); await refresh(user.id, 0); return '已登录。'; })}>登录</button><button disabled={busy} onClick={() => void act(async () => { const result=await cloudRequest('/api/auth/restore','POST',{email,code});const user=readAccount(result.account);setAccount(user);setCode('');await refresh(user.id,0);return '账号已恢复。'; })}>恢复30天宽限期内的已关闭账号</button></>
      : <><p>{account.kind === 'guest' ? '游客会话' : account.email}</p>{account.kind === 'guest' && <p>游客会话有效期为 7 天。丢失或清除浏览器站点数据后，无法仅凭存档编号找回云档；连续 90 天无活动后，在线资料进入服务器获批的清理范围，冷备遵循独立政策。</p>}<div className="actions"><button disabled={busy} onClick={() => void act(async () => { await cloudRequest('/api/auth/refresh', 'POST', {}, account.id); return '会话已刷新，有效期延长 7 天。'; })}>刷新会话</button>
        <button disabled={busy} onClick={() => { if (account.kind === 'guest' && !window.confirm('退出会撤销此游客会话。除非已升级邮箱，否则清除站点数据或丢失会话后无法找回云档。仍要退出吗？')) return; void act(async () => { await cloudRequest('/api/auth/logout', 'POST', {}, account.id); setAccount(null); setRemote([]); setQueue([]); setTrash([]); return '已退出；本地存档及未完成队列保留。'; }); }}>退出</button>
        <button disabled={busy} onClick={() => void act(async () => { const result = await sync.flush(account.id); await refresh(account.id); return `已上传 ${result.uploaded} 份；${result.failed} 份失败，${result.conflicted} 份需核对冲突。`; })}>重试待上传</button></div>
        {account.kind === 'guest' ? <section aria-label="游客账号升级"><h2>升级为邮箱账号</h2><p>升级会保留当前账号 ID 与云档。邮箱验证码证明你能收取该邮箱；当前游客会话与最终确认共同证明你要保留的游客账号。</p><p>清除浏览器站点数据会删除游客会话凭据。未活动游客在线资料在 90 天后进入经批准的数据清理；托管方冷备遵循独立政策。</p>
          <label>升级邮箱<input type="email" autoComplete="email" value={upgradeEmail} onChange={event => setUpgradeEmail(event.target.value)} disabled={busy} /></label>
          <button disabled={busy} onClick={() => void act(async () => { await cloudRequest('/api/auth/code', 'POST', { email: upgradeEmail }); return '验证码已发送。请在当前游客会话中完成核验。'; })}>发送升级验证码</button>
          <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={upgradeCode} onChange={event => setUpgradeCode(event.target.value)} disabled={busy} /></label>
          <button disabled={busy} onClick={() => { if (!window.confirm('确认把当前游客账号升级为此已验证邮箱？账号 ID 和云存档归属保持不变。')) return; void act(async () => { const result = await cloudRequest('/api/auth/guest/upgrade', 'POST', { email: upgradeEmail, code: upgradeCode, confirmation: 'UPGRADE_GUEST_TO_EMAIL' }, account.id); const user = readAccount(result.account); if (user.kind !== 'email') throw new Error('INVALID_ACCOUNT'); setAccount(user); setUpgradeCode(''); await refresh(user.id, 0); return '邮箱升级完成；账号 ID 与云档归属保持不变。'; }); }}>核验并升级</button>
        </section> : <AccountLifecyclePanel account={account} saves={saves} externalBusy={busy} acquire={() => { if (busyRef.current) return false; busyRef.current=true;setBusy(true);return true; }} release={() => {busyRef.current=false;setBusy(false);}} onSignedOut={() => { setAccount(null); setRemote([]); setQueue([]); setTrash([]); setNotice('账户操作完成，所有会话已退出。本机独立存档保留。'); }} />}
        <h2>本地存档</h2>{saves.map(save => <div key={save.saveId}><span>{save.name}</span><button disabled={busy} onClick={() => void act(async () => { await sync.enqueue(account.id, save); const result = await sync.flush(account.id); await refresh(account.id); return result.failed ? `有 ${result.failed} 份未上传；请查看下方对应存档。` : result.conflicted ? '云端版本有变化，请核对冲突。' : '云端备份已更新。'; })}>备份到云端</button></div>)}
        <h2>待上传与冲突</h2>{queue.filter(r => r.pending || r.conflict).map(record => <div key={record.key}><p>{record.localSaveId}：{record.conflict ? '云端已变化，上传暂停' : record.failure ? `上传失败（${({AUTH_REQUIRED:'请重新登录',RATE_LIMITED:'请求过多，请稍后重试',SERVER_ERROR:'服务暂不可用',NETWORK_ERROR:'网络中断',INVALID_RESPONSE:'云端响应异常',UPLOAD_FAILED:'本次上传未完成'} as Record<string,string>)[record.failure]}）` : '待重试'}</p>
          {record.conflict && <><p>本地回合：{record.pending ? archiveFromEnvelope(record.pending).revision : '无'}；云端回合：{archiveFromEnvelope(record.conflict).revision}</p>
            <button disabled={busy} onClick={() => void act(async () => { await sync.keepLocal(record); await sync.flush(account.id); await refresh(account.id); return '按已核对的云端版本重试；后续变化仍会触发冲突。'; })}>确认用本地更新云端</button>
            <button disabled={busy} onClick={() => void act(async () => { const copy = await onRestore(archiveFromEnvelope(record.conflict)); if (!copy) throw new Error('LOCAL_WRITE_FAILED'); await sync.trackRestored(account.id, copy.saveId, record.conflict); await sync.discardUpload(record); await refresh(account.id); return '云端版本已另存本地副本，原档保留。'; })}>云端另存本地副本</button></>}
          <button disabled={busy} onClick={() => void act(async () => { await sync.discardUpload(record); await refresh(account.id); return '已取消这次上传，本地存档保留。'; })}>取消待上传</button>
        </div>)}<h2>云端备份</h2>{remote.map((save, index) => <div key={`${save.saveId}-${index}`}><span>{save.name} · 云端版本 {save.revision}</span>
          <button disabled={busy} onClick={() => void act(async () => { const cloud = await cloudRequest(`/api/saves/${encodeURIComponent(save.saveId)}`, 'GET', undefined, account.id); const copy = await onRestore(archiveFromEnvelope(cloud.save)); if (!copy) throw new Error('LOCAL_WRITE_FAILED'); await sync.trackRestored(account.id, copy.saveId, cloud.save); return '已恢复为本地新副本，原档保留；后续备份仍绑定此云档。'; })}>恢复为本地副本</button>
          <button disabled={busy} onClick={() => void act(async () => {
            const cloud = await cloudRequest(`/api/saves/${encodeURIComponent(save.saveId)}`, 'GET', undefined, account.id); const archive = archiveFromEnvelope(cloud.save);
            const url = URL.createObjectURL(new Blob([serializeSaveForExport(archive)], { type: 'application/json' })); const link = document.createElement('a');
            try { link.href = url; link.download = '九霄_云端存档.json'; link.click(); } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
            return '云档导出已交给浏览器下载。';
          })}>导出云档</button>
          <button disabled={busy} onClick={() => { if (window.confirm(`将「${save.name}」移至云端回收区？本地档保留，云端可恢复。`)) void act(async () => {
            await cloudRequest(`/api/saves/${encodeURIComponent(save.saveId)}`, 'DELETE', { expectedRevision: save.revision }, account.id); await refresh(account.id); return '云档已移至回收区，本地档与待上传队列保留。';
          }); }}>删除云档</button></div>)}
        <div className="actions"><button disabled={busy || offset === 0} onClick={() => void act(async () => { await refresh(account.id, Math.max(0, offset - 20)); return '已读取上一页。'; })}>上一页</button>
          <button disabled={busy || !hasMore} onClick={() => void act(async () => { await refresh(account.id, offset + 20); return '已读取下一页。'; })}>下一页</button></div>
        <h2>云端回收区</h2>{trash.map(save => <div key={save.saveId}><span>{save.name}</span><button disabled={busy} onClick={() => void act(async () => {
          await cloudRequest(`/api/save-trash/${encodeURIComponent(save.saveId)}/restore`, 'POST', { expectedRevision: save.revision }, account.id); await refresh(account.id); return '完整性校验通过，云档已恢复。';
        })}>恢复删除的云档</button></div>)}
        <div className="actions"><button disabled={busy || trashOffset === 0} onClick={() => void act(async () => { await refreshTrash(account.id, Math.max(0, trashOffset - 20)); return '已读取回收区上一页。'; })}>回收区上一页</button>
          <button disabled={busy || !trashMore} onClick={() => void act(async () => { await refreshTrash(account.id, trashOffset + 20); return '已读取回收区下一页。'; })}>回收区下一页</button></div></>}
    {!account && <button className="secondary" disabled={busy} onClick={() => void act(async () => { const result = await cloudRequest('/api/auth/guest', 'POST', {}); const user = readAccount(result.account); setAccount(user); await refresh(user.id, 0); return '游客会话已创建，7 天内有效。云存档绑定此浏览器会话；请在到期前刷新或升级邮箱。'; })}>以游客身份继续</button>}
  </section>;
}
