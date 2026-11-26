import { useEffect, useState } from 'react';
import { CardImportClient, cardError, type ImportItem } from '../card-import-client';
import { ReadableData } from '../components/ReadableData';
import './worldbook-e.css';

type Props={api:CardImportClient;imports:ImportItem[];onChanged:()=>Promise<void>};
export function WorldbookPanel({api,imports,onChanged}:Props){
 const [enabled,setEnabled]=useState<string[]>([]),[oldId,setOldId]=useState(''),[newId,setNewId]=useState(''),[selected,setSelected]=useState<ImportItem|null>(null),[entries,setEntries]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('旧会话继续使用创建时固定的世界书。');
 const books=imports.filter(x=>x.kind==='worldbook'&&!x.error);
 async function reload(){const rows=await api.globalBooks();setEnabled(rows.map(x=>x.import_id));}
 useEffect(()=>{let live=true;void api.globalBooks().then(rows=>{if(live)setEnabled(rows.map(x=>x.import_id));}).catch(e=>{if(live)setNotice(cardError(e));});return()=>{live=false;};},[api]);
 async function select(id:string){try{const item=await api.import(id);setSelected(item);setName(typeof item.parsed?.document?.name==='string'?item.parsed.document.name:'');setEntries(JSON.stringify(item.parsed?.document?.entries??[],null,2));}catch(e){setNotice(cardError(e));}}
 async function toggle(id:string,on:boolean){if(busy)return;setBusy(true);try{await api.setGlobal(id,on);await reload();setNotice('全局设置已更新，新会话使用当前设置；旧会话保持原快照。');}catch(e){setNotice(cardError(e));try{await reload();}catch{/* report original error */}}finally{setBusy(false);}}
 async function replace(){if(busy||!oldId||!newId)return;setBusy(true);try{await api.replaceGlobal(oldId,newId);await reload();setNotice('替换已完成，旧会话保持原快照。');}catch(e){try{await reload();setNotice('替换结果需要核对，已重新读取全局设置；不会自动重试。');}catch{setNotice('替换结果未知，无法读取全局设置；请恢复连接后先核对，不要重复提交。');}}finally{setBusy(false);}}
 async function edit(){if(!selected||busy)return;let value:unknown;try{value=JSON.parse(entries);}catch{setNotice('条目 JSON 无法解析。');return;}if(!Array.isArray(value)&&(!value||typeof value!=='object')){setNotice('条目必须是数组或对象。');return;}setBusy(true);try{const item=await api.editWorldbook(selected.id,{name,entries:value});await onChanged();setNotice(`已创建世界书新版本 ${item.filename}，旧会话不会改变。`);}catch(e){setNotice(cardError(e));}finally{setBusy(false);}}
 const current=selected?books.find(book=>book.id===selected.id)??selected:null;
 const preview=selected?bookEntries(selected.parsed?.document):[];
 return <section className="card card-ui-section jx-wb" aria-label="世界书管理"><h2>世界书管理</h2><p role="status" className="jx-wb-notice">{notice}</p>
  <div className="jx-wb-bench">
   <div className="jx-wb-shelf"><h3>书目</h3><p className="jx-wb-hint">先在“导入文件”里选择世界书 JSON；正则等不支持的语法会在使用时提示。</p>
    {!books.length&&<p className="jx-wb-empty">还没有导入世界书。</p>}
    <ul className="card-ui-list">{books.map(book=><li key={book.id} aria-current={selected?.id===book.id?'true':undefined}><span className="jx-wb-book"><span className="jx-wb-name">{book.filename}</span><small data-on={enabled.includes(book.id)?'true':'false'}>{enabled.includes(book.id)?'全局启用':'未全局启用'}<span className="jx-wb-id"> {book.id.slice(0,8)}</span></small></span><div className="actions"><button disabled={busy} onClick={()=>void select(book.id)}>查看与创建新版本</button><button disabled={busy} onClick={()=>void toggle(book.id,!enabled.includes(book.id))}>{enabled.includes(book.id)?'关闭全局':'启用全局'}</button></div></li>)}</ul>
   </div>
   <div className="jx-wb-desk">{selected&&current?<>
    <h3>世界书版本：{current.filename}</h3>
    {preview.length?<ol className="jx-wb-entries" aria-label="条目预览">{preview.map((entry,index)=><li key={index} data-off={entry.off?'true':undefined}><span className="jx-wb-keys">{entry.keys.length?entry.keys.join('、'):'（无关键词）'}</span>{(entry.title||entry.off)&&<span className="jx-wb-title">{entry.off&&<b className="jx-wb-off">已停用</b>}{entry.title}</span>}<span className="jx-wb-snippet">{entry.content.length>120?`${entry.content.slice(0,120)}……`:entry.content||'（无内容）'}</span><small>{entry.content.length} 字</small></li>)}</ol>:<p className="jx-wb-empty">没有可预览的条目。</p>}
    <details className="jx-wb-raw"><summary>完整解析资料</summary><ReadableData value={selected.parsed?.document}/></details>
    <div className="card-ui-form jx-wb-editor"><p className="jx-wb-hint">修改后会创建一个新版本；旧会话继续使用创建时固定的版本。</p><label>名称<input value={name} maxLength={255} onChange={e=>setName(e.target.value)}/></label><label>条目 JSON<textarea value={entries} spellCheck={false} onChange={e=>setEntries(e.target.value)} /></label><small className="jx-wb-count">{entries.length} 字符</small><button disabled={busy} onClick={()=>void edit()}>创建世界书新版本</button></div>
   </>:<p className="jx-wb-empty">从左侧选择一本世界书，查看条目并创建新版本。</p>}</div>
   <div className="jx-wb-global"><h3>全局设置</h3><p className="jx-wb-hint">全局世界书对之后新建的会话生效；替换不会改变已有会话的快照。</p>
    <div className="card-ui-form"><label>替换已启用世界书<select value={oldId} onChange={e=>setOldId(e.target.value)}><option value="">选择旧版本</option>{books.filter(x=>enabled.includes(x.id)).map(x=><option key={x.id} value={x.id}>{x.filename}（{x.id.slice(0,8)}）</option>)}</select></label><label>替换为<select value={newId} onChange={e=>setNewId(e.target.value)}><option value="">选择新版本</option>{books.filter(x=>x.id!==oldId).map(x=><option key={x.id} value={x.id}>{x.filename}（{x.id.slice(0,8)}）</option>)}</select></label><button disabled={busy||!oldId||!newId} onClick={()=>void replace()}>替换全局世界书</button></div>
   </div>
  </div></section>;
}

type EntryView={keys:string[];title:string;content:string;off:boolean};
/** Read-only view of entries in either SillyTavern world-info shape (object keyed by uid) or character-book shape (array). */
export function bookEntries(document:unknown):EntryView[]{
 const doc=document&&typeof document==='object'&&!Array.isArray(document)?document as Record<string,unknown>:null;
 const raw=doc?.entries;const list=Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw as Record<string,unknown>):[];
 return list.filter((item):item is Record<string,unknown>=>!!item&&typeof item==='object'&&!Array.isArray(item)).map(item=>{
  const keys=[item.keys,item.key].find(Array.isArray) as unknown[]|undefined;
  return {keys:(keys??[]).filter((key):key is string=>typeof key==='string'&&!!key.trim()),title:typeof item.comment==='string'?item.comment.trim():typeof item.name==='string'?item.name.trim():'',content:typeof item.content==='string'?item.content.trim():'',off:item.disable===true||item.enabled===false};
 });
}
