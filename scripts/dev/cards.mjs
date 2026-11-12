// Local synthetic demonstration only. Never accepts an existing DATABASE_URL.
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, access, open } from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import net from 'node:net';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2).filter(x => x !== '--');
const init = args.includes('--init'), check = args.includes('--check');
const binAt = args.indexOf('--postgres-bin');
const bin = binAt < 0 ? undefined : resolve(args[binAt + 1] || '');
if (args.some((x,i) => !['--init','--check','--postgres-bin'].includes(x) && !(binAt>=0 && i===binAt+1)) || (binAt>=0&&!args[binAt+1])) throw Error('Unknown dev:cards argument');
if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Node >=24 required');
if(process.env.NODE_ENV==='production')throw Error('Production mode cannot start the local demonstration');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const pnpmFile = process.env.npm_execpath;
if (!pnpmFile || !/pnpm\.(?:c?js|mjs)$/.test(pnpmFile)) throw Error('Run through pnpm dev:cards');
// Do not inherit production credentials, model addresses, proxies, PG* or VITE_* settings.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\))$/i.test(k)));
env.NODE_ENV = 'development';
env.npm_config_manage_package_manager_versions = 'false';
env.pnpm_config_pm_on_fail = 'ignore';
function run(file, argv, options={}) {
  const r = spawnSync(file, argv, { cwd:root, env, windowsHide:true, encoding:'utf8', timeout:180_000, ...options });
  if (r.error || r.status !== 0) throw Error(`${file.split(/[\\/]/).at(-1)} failed (${r.status ?? r.error?.code}); ${String(r.stderr || '').slice(-1200)}`);
  return String(r.stdout || '').trim();
}
const pnpm = argv => run(process.execPath, [pnpmFile,...argv]);
const pnpmVersion=pnpm(['--version']);
if (!/^11\./.test(pnpmVersion) || Number(pnpmVersion.split('.')[1])<19) throw Error(`Use ${manifest.packageManager} (compatible local 11.x >=11.19 permitted)`);
let docker = false; try { run('docker',['version','--format','{{.Server.Version}}']); docker=true; } catch {}
console.log(`Node ${process.versions.node}; pnpm ${pnpmVersion} (lock: ${manifest.packageManager}); Docker ${docker?'available':'unavailable'}`);
if (check) process.exit(0);
if (!bin && !docker) throw Error('Docker is unavailable. Start Docker Desktop, or use --postgres-bin <PostgreSQL bin directory>. No data was changed.');
const stateDir = join(root,'.cards-local'), stateFile = join(stateDir,'state.json');
const exists = async path => access(path).then(()=>true,()=>false);
let state;
if (await exists(stateFile)) {
  state = JSON.parse(await readFile(stateFile,'utf8'));
  if (state.format !== 'jiuxiao-cards-demo-v1' || state.root !== root || state.mode !== (bin?'native':'docker') || state.bin !== bin || !/^[a-f0-9-]{36}$/.test(state.id)) throw Error('Local state identity mismatch; preserve it and use its original checkout/options.');
} else {
  if (!init) throw Error('First run: pnpm dev:cards --init [--postgres-bin <bin>]. Creates a NEW dedicated database only.');
  if (await exists(stateDir)) throw Error('.cards-local exists without valid state; preserve it for inspection.');
  const port = async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
  state = {format:'jiuxiao-cards-demo-v1',root,id:randomUUID(),mode:bin?'native':'docker',bin,port:await port(),apiPort:await port(),webPort:await port(),password:randomBytes(32).toString('hex'),secret:randomBytes(32).toString('hex'),installed:false};
  await mkdir(stateDir); await writeFile(stateFile,JSON.stringify(state),{mode:0o600});
}
const dataDir=join(stateDir,'postgres'), label=`jiuxiao-cards-${state.id}`, volume=`${label}-data`;
const lockPath=join(stateDir,'launcher.lock'), lockToken=randomUUID();
let lock;
try {lock=await open(lockPath,'wx',0o600);}catch{throw Error('Demo launcher lock exists. Do not start twice; preserve data and verify the previous launcher has exited before removing only launcher.lock.');}
await lock.writeFile(JSON.stringify({pid:process.pid,token:lockToken}));await lock.close();
process.on('exit',()=>{try{if(JSON.parse(readFileSync(lockPath,'utf8')).token===lockToken)unlinkSync(lockPath);}catch{}});
const pgExe=name=>join(bin,`${name}${process.platform==='win32'?'.exe':''}`);
if (bin) {
  if (!await exists(dataDir)) {
    if (!init || state.installed) throw Error('Missing preserved database; no automatic recreation');
    await writeFile(join(stateDir,'password'),state.password,{mode:0o600});
    run(pgExe('initdb'),['-D',dataDir,'-U','cards_local','-A','scram-sha-256','--encoding=UTF8','--no-locale',`--pwfile=${join(stateDir,'password')}`]);
  }
  const status=spawnSync(pgExe('pg_ctl'),['-D',dataDir,'status'],{env,encoding:'utf8',windowsHide:true});
  // Detached PostgreSQL must not retain spawnSync's stdout/stderr pipes on Windows.
  if(status.status!==0)run(pgExe('pg_ctl'),['-D',dataDir,'-l',join(stateDir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${state.port}`,'-w','start'],{stdio:'ignore',timeout:30_000});
} else {
  let container;
  try { container=JSON.parse(run('docker',['inspect',label]))[0]; } catch {}
  if (!container) {
    if (!init || state.installed) throw Error('Missing preserved container; no automatic recreation');
    try { run('docker',['volume','inspect',volume]); throw Error('Existing unverified volume'); } catch(e) { if(e.message==='Existing unverified volume')throw e; }
    run('docker',['volume','create','--label',`jiuxiao.cards=${state.id}`,volume]);
    await writeFile(join(stateDir,'postgres.env'),`POSTGRES_USER=cards_local\nPOSTGRES_PASSWORD=${state.password}\nPOSTGRES_DB=postgres\n`,{mode:0o600});
    run('docker',['run','-d','--name',label,'--label',`jiuxiao.cards=${state.id}`,'--env-file',join(stateDir,'postgres.env'),'-p',`127.0.0.1:${state.port}:5432`,'-v',`${volume}:/var/lib/postgresql/data`,'postgres:17-alpine']);
  } else {
    const port=container.HostConfig.PortBindings?.['5432/tcp']?.[0];
    if(container.Config.Labels?.['jiuxiao.cards']!==state.id || port?.HostIp!=='127.0.0.1' || port.HostPort!==String(state.port) || container.Mounts?.find(x=>x.Destination==='/var/lib/postgresql/data')?.Name!==volume)throw Error('Docker identity/binding mismatch');
    if(!container.State.Running)run('docker',['start',label]);
  }
}
const {Pool}=createRequire(join(root,'apps/api/package.json'))('pg');
const options={host:'127.0.0.1',port:state.port,user:'cards_local',password:state.password,connectionTimeoutMillis:2000};
const admin=new Pool({...options,database:'postgres'});
try {
  let ready=false;for(let i=0;i<40;i++){try{await admin.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
  if(!ready)throw Error('Dedicated PostgreSQL not ready');
  if(bin && resolve((await admin.query('SHOW data_directory')).rows[0].data_directory)!==resolve(dataDir))throw Error('Wrong PostgreSQL data directory');
  const database='jiuxiao_test_cards_demo';
  const found=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount;
  if(!found){if(state.installed)throw Error('Missing preserved database');await admin.query(`CREATE DATABASE ${database}`);}
  const pool=new Pool({...options,database});
  try {
    const dir=join(root,'packages/db/drizzle');
    const files=(await readdir(dir)).filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort();
    const sources=await Promise.all(files.map(x=>readFile(join(dir,x),'utf8')));
    sources.push(await readFile(join(root,'apps/api/src/card-import/schema.sql'),'utf8'));
    const digest=createHash('sha256').update(sources.join('\n')).digest('hex');
    if(!state.installed){
      const count=Number((await pool.query("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows[0].count);
      if(count)throw Error('Nonempty uninitialized database: preserve it; no automatic repair or migration');
      for(const sql of sources.slice(0,-1))await pool.query(sql);
      const client=await pool.connect();try{await client.query('BEGIN');await client.query(sources.at(-1));await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      state.installed=true;state.schemaDigest=digest;await writeFile(stateFile,JSON.stringify(state),{mode:0o600});
    }else if(state.schemaDigest!==digest)throw Error('Schema changed: no automatic upgrade of preserved demo data. Review a new isolated copy.');
    await pool.query('SELECT greeting_index,recursive_worldbook FROM card_import.sessions LIMIT 0');
  }finally{await pool.end();}
}finally{await admin.end();}
pnpm(['--filter','@jiuxiao/contracts','--filter','@jiuxiao/content','--filter','@jiuxiao/domain','--filter','@jiuxiao/api','-r','build']);
const children=[];
const child=(file,argv,cwd=root,extra={})=>{const p=spawn(file,argv,{cwd,env:{...env,...extra},windowsHide:true,stdio:['ignore','inherit','inherit']});children.push(p);return p;};
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;process.stdin.pause();for(const p of children)if(p.exitCode===null)p.kill();console.log('Application stopped. Dedicated database and all data retained.');};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop'){stop();process.stdin.pause();}});
child(process.execPath,[join(root,'scripts/dev/cards-host.mjs')]);
// Launcher owns stdin/shutdown. Vite must not exit when its detached stdin ends.
child(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(state.webPort),'--strictPort','--mode','cards-local'],join(root,'apps/web'),{CI:'true',JIUXIAO_API_TARGET:`http://127.0.0.1:${state.apiPort}`,VITE_API_BASE_URL:'/api'});
for(const p of children)p.on('exit',code=>{if(!stopping){process.exitCode=code||1;stop();}});
console.log(`Local synthetic UI: http://127.0.0.1:${state.webPort}/lobby\nUse demo@example.invalid; request a code in the UI and read it in this terminal. No external email/model is contacted.\nDatabase stays on loopback port ${state.port}. Ctrl+C stops the app, never deletes its volume/data.\nExample card: docs/examples/cards-demo.json`);
