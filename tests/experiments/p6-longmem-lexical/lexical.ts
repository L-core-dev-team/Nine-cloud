/** Finite body-description / retention vocabulary. Never normalizes entity IDs or output prose. */
export function lexicalForm(text:string):string {
 return text.normalize('NFKC').toLowerCase()
  .replace(/眼睛|双眼|两眼|眼眸/gu,'眼睛')
  // Bare 发 is deliberately excluded: 发出、出发、发现 are not hair descriptions.
  .replace(/头发|秀发|发丝|(?:一|几|数)[缕束撮]发|[乌黑白乱长短]发/gu,'头发')
  .replace(/留住|留下|保留/gu,'留存');
}
export function concreteForm(text:string,dialogue:boolean):string {
 const canonical=lexicalForm(text);
 // Requests are speech acts, not the requested object. A retention verb is not
 // enough to support a named object; retain other concrete words for matching.
 return dialogue?canonical.replace(/请求|要求|希望|请/gu,'').replace(/留存/gu,''):canonical;
}
