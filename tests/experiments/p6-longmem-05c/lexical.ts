/** Match-only finite vocabulary; never changes original bytes. */
export function lexicalForm(text:string):string {
 return text.normalize('NFKC').toLowerCase()
  .replace(/眼睛|双眼|两眼|眼眸/gu,'眼睛')
  .replace(/头发|秀发|发丝|(?:一|几|数)[缕束撮]发|[乌黑白乱长短]发/gu,'头发')
  .replace(/留住|留下|保留/gu,'留存')
  .replace(/(?:落|掉|跌|坠)(?:在|到)(?:了)?地(?:上|面)/gu,'落地')
  .replace(/(?:掉|跌|坠)落?(?:到)?地(?:上|面)?/gu,'落地');
}
export function concreteForm(text:string,dialogue:boolean):string {
 const canonical=lexicalForm(text);
 return dialogue?canonical.replace(/请求|要求|希望|请/gu,'').replace(/留存/gu,''):canonical;
}
export function hasGroundLanding(text:string):boolean {
 return lexicalForm(text).split(/[。！？；，,;:\n]/u).some(c=>/落地/u.test(c)
  && !/计划|方案|项目|梦想|政策|构想/u.test(c)
  && !/(?:没有|没|并未|尚未|还未|未曾|未|不能|不会|不)[^。！？；，,;:]{0,6}落地/u.test(c)
  && !/仿佛|犹如|好像|如同|比作/u.test(c));
}
