/** Finite body-description / retention vocabulary. Never normalizes entity IDs or output prose. */
export function lexicalForm(text:string):string {
 return text.normalize('NFKC').toLowerCase()
  .replace(/眼睛|双眼|两眼|眼眸/gu,'眼睛')
  // Bare 发 is deliberately excluded: 发出、出发、发现 are not hair descriptions.
  .replace(/头发|秀发|发丝|(?:一|几|数)[缕束撮]发|[乌黑白乱长短]发/gu,'头发')
  .replace(/留住|留下|保留/gu,'留存')
  // Match-only physical-event wording; original strings and span offsets are untouched.
  .replace(/落在地上/gu,'落地');
}
export function concreteForm(text:string,dialogue:boolean):string {
 const canonical=lexicalForm(text);
 // Requests are speech acts, not the requested object. A retention verb is not
 // enough to support a named object; retain other concrete words for matching.
 return dialogue?canonical.replace(/请求|要求|希望|请/gu,'').replace(/留存/gu,''):canonical;
}

/** Conservative local event cue, applied only to explicitly physical landing queries. */
export function hasGroundLanding(text:string):boolean {
 return text.normalize('NFKC').split(/[。！？；，,;:\n]/u).some(clause=>
  /落(?:在地上|地)/u.test(clause)
  && !/计划|方案|项目/u.test(clause)
  && !/(?:没有|没|并未|尚未|还未|未曾|未|不能|不会|不)[^。！？；，,;:]{0,3}落(?:在地上|地)/u.test(clause));
}
