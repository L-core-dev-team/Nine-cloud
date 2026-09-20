function validItems(items){return Array.isArray(items)&&items.every(x=>x&&typeof x.id==='string'&&x.id.trim()&&typeof x.name==='string'&&x.name.trim()&&(x.quantity===null||(Number.isSafeInteger(x.quantity)&&x.quantity>=0))&&(x.unit===undefined||typeof x.unit==='string'))&&new Set(items.map(x=>x.id)).size===items.length}
function importItems(record){
  const items=[];let item=null;
  for(const line of record.split('\n')){
    const match=line.match(/^- \*\*(.+?)[：:]\*\*\s*$/);
    if(match&&!['效果','来历'].includes(match[1])){
      const label=match[1],name=label.split(/[（(]/)[0].trim();
      const count=label.match(/[（(]([0-9]+|[一二两三四五六七八九十])([瓶包枚颗张块件把本份株])(?![\u4e00-\u9fff])/);
      const numbers={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
      const quantity=count?(numbers[count[1]]??Number(count[1])):null;
      item={id:'legacy-item-'+items.length,name,quantity,unit:count?.[2]||'',record:label,source:'IMPORTED_SAVE'};
      items.push(item);
    }else if(item&&line.trim())item.record+='\n'+line.trim();
  }
  return items;
}
function inventoryText(items){return items.length?items.map(x=>`${x.name} · ${x.quantity===null?'数量未知':x.quantity+(x.unit||'')}\n${x.record||''}`).join('\n\n'):'尚无结构化物品记录'}
