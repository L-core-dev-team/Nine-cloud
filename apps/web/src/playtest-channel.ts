/** Only an operator-supplied HTML marker changes presentation; server rules still decide access. */
export const ISOLATED_PLAYTEST=typeof document!=='undefined'&&document.querySelector('meta[name="ninecloud-isolated-playtest"]')?.getAttribute('content')==='true';
