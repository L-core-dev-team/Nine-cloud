// Test-only mount: no production route or application entry is changed.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardLibrary } from './routes/CardLibrary';
import { CardSession } from './routes/CardSession';
import './design-system/tokens.css';
import './style.css';
import './design-system/tokens-v2.css';
import './design-system/jx-e.css';
import './design-system/story-e.css';

document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'day' ? 'day' : 'night';
function Fixture() {
  const [owner, setOwner] = useState('owner-a'), [session, setSession] = useState<string | null>(null);
  return <div className="jx-shell" data-jx-layer={session ? 'story' : 'lobby'} data-jx-route={session ? 'card-session' : 'cards'}><header><button onClick={() => { setSession(null); setOwner(owner === 'owner-a' ? 'owner-b' : 'owner-a'); }}>切换测试账号</button></header><main>{session ? <CardSession owner={owner} sessionId={session} onBack={() => setSession(null)} /> : <CardLibrary owner={owner} onSession={setSession} onBack={() => {}} />}</main><footer>测试入口</footer></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
