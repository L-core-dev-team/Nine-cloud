const JX_WORLD_BOOK_DATA=__WORLD_DATA__;
const JX_WORLD_SOURCE_INDEX=__SOURCE_INDEX__;
const JX_WORLD_OPEN_STATE=new Set();
const JX_WORLD_SOURCE_MAP=new Map(MATERIALS.sources.map(source=>[source.id,source]));

function worldSourceTitle(source,number){
  const line=source.text.split(/\r?\n/).map(value=>value.trim()).find(value=>
    (value.match(/[\u4e00-\u9fff]/g)||[]).length>=4 &&
    !/^(?:电脑端|回到底部|评论|世界观设定)/.test(value) &&
    !/Mod|gemini|fengyue/.test(value)
  );
  return line?line.slice(0,34):`原设片段 ${number}`;
}
function worldSearchKey(value){return value.toLocaleLowerCase().replaceAll('吴天','昊天')}

function worldView(){
  const total=MATERIALS.sources.length;
  $('#sourceStatus').textContent=`原始世界书 · ${total} 份去重截图转写完整保留。下列 OCR 尚未逐字核对；关键名称、数字和设定以原图为准。`;
  const box=$('#worldSections');box.replaceChildren();
  const search=el('input');search.className='world-search';search.type='search';
  search.placeholder='搜索全部原设：势力、境界、功法、物价…';
  search.setAttribute('aria-label','搜索全部原始设定');box.append(search);
  const count=el('p',`${total} 份原图转写可查看`,'world-result-count');box.append(count);
  const groups=[];
  for(let i=0;i<JX_WORLD_SOURCE_INDEX.length;i++){
    const section=JX_WORLD_SOURCE_INDEX[i],group=el('details');
    group.className='world-group world-source-group';group.open=JX_WORLD_OPEN_STATE.has(section.title);
    group.append(el('summary',`${section.title} · ${section.ids.length}`));
    const children=el('div',undefined,'world-children');
    const items=[];
    if(!section.ids.length)children.append(el('p','原图目录中有此标题，但现存截图尚未确认该节正文。','world-empty'));
    for(let j=0;j<section.ids.length;j++){
      const source=JX_WORLD_SOURCE_MAP.get(section.ids[j]);
      if(!source)continue;
      const item=el('details');item.className='world-item world-source-item';
      item.append(el('summary',worldSourceTitle(source,j+1)));
      const content=el('div',undefined,'world-text');
      content.append(el('p','OCR 待校对 · 来源 '+source.id.slice(0,8),'world-provenance'));
      content.append(el('pre',source.text,'world-raw-text'));
      item.append(content);children.append(item);items.push({item,source});
    }
    group.append(children);
    group.addEventListener('toggle',()=>{
      if(search.value.trim())return;
      if(group.open)JX_WORLD_OPEN_STATE.add(section.title);
      else JX_WORLD_OPEN_STATE.delete(section.title);
    });
    box.append(group);groups.push({group,section,items});
  }
  const reviewed=el('details');reviewed.className='world-group world-reviewed';
  reviewed.append(el('summary','地理整理摘要（非原文） · 7 区'));
  const reviewedBody=el('div',undefined,'world-children');
  for(const section of JX_WORLD_BOOK_DATA){
    const item=el('details');item.className='world-item';item.append(el('summary',section.title));
    const content=el('div',undefined,'world-text');
    for(const entry of section.children){
      content.append(el('h3',entry.title));
      for(const paragraph of entry.paragraphs)content.append(el('p',paragraph));
    }
    item.append(content);reviewedBody.append(item);
  }
  reviewed.append(reviewedBody);box.append(reviewed);
  search.addEventListener('input',()=>{
    const query=worldSearchKey(search.value.trim());let matches=0;
    for(const {group,section,items} of groups){
      const groupHit=worldSearchKey(section.title).includes(query);
      let shown=0;
      for(const {item,source} of items){
        const hit=!query||groupHit||worldSearchKey(source.text).includes(query);
        item.hidden=!hit;if(hit)shown++;
      }
      group.hidden=!!query&&!groupHit&&shown===0;
      group.open=query?(!group.hidden):JX_WORLD_OPEN_STATE.has(section.title);
      matches+=shown;
    }
    count.textContent=query?`找到 ${matches} 份原图转写（共 ${total} 份）`:`${total} 份原图转写可查看`;
    reviewed.hidden=!!query;
  });
}

function openWorld(){
  if(!$('#game').classList.contains('active')){home('world');return}
  const landing=$('#landing');
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.page==='world'));
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-world'));
  landing.classList.remove('hidden');landing.classList.add('world-open');
  document.body.classList.add('world-book-open');
  $('#game').setAttribute('aria-hidden','true');
  landing.setAttribute('role','dialog');landing.setAttribute('aria-modal','true');
  worldView();$('#worldClose').focus();
}
function closeWorld(){
  const landing=$('#landing');
  if(landing.classList.contains('world-open')){
    landing.classList.remove('world-open');landing.classList.add('hidden');
    document.body.classList.remove('world-book-open');
    $('#game').removeAttribute('aria-hidden');
    landing.removeAttribute('role');landing.removeAttribute('aria-modal');
    $('#dockWorld').focus();
  }else showGame();
}
$('#worldClose').onclick=closeWorld;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#landing').classList.contains('world-open')){e.preventDefault();closeWorld()}});
