import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const derive=promisify(scrypt),digest=t=>createHash('sha256').update(t).digest('hex');
const lifetime=30*24*60*60*1000;
export const DEFAULT_COLORS=Object.freeze({survivorColor:'#657f62',killerColor:'#643e37'});
export function credentials(data){
  const nickname=typeof data?.nickname==='string'?data.nickname.normalize('NFC').trim():'';
  if(!/^[\p{L}\p{N}_-]{2,12}$/u.test(nickname))throw new Error('닉네임은 한글·영문·숫자·_·-를 사용해 2~12자로 입력해주세요.');
  if(typeof data?.password!=='string'||data.password.length<8||Buffer.byteLength(data.password)>72)throw new Error('비밀번호는 8자 이상, 72바이트 이하로 입력해주세요.');
  return {nickname,password:data.password};
}
export function colors(data){
  if(!data||!/^#[0-9a-f]{6}$/i.test(data.survivorColor)||!/^#[0-9a-f]{6}$/i.test(data.killerColor))throw new Error('캐릭터 색상을 다시 선택해주세요.');
  return {survivorColor:data.survivorColor.toLowerCase(),killerColor:data.killerColor.toLowerCase()};
}
const publicUser=u=>u?{id:u.id,nickname:u.nickname}:null;
const idleDatabaseError=()=>console.error('NIGHTFALL database idle connection lost');
async function passwordHash(password,salt=randomBytes(16).toString('hex')){
  const key=await derive(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  return `scrypt$${salt}$${key.toString('hex')}`;
}

// Atomic local persistence. The deployed shared server supplies its PostgreSQL account store.
export class FileAccounts{
  constructor(file){this.file=file;this.data={users:[],sessions:[],profiles:{}};this.queue=Promise.resolve();}
  async init(){try{
    const saved=JSON.parse(await readFile(this.file,'utf8'));
    if(!saved||typeof saved!=='object'||Array.isArray(saved)||saved.users!==undefined&&!Array.isArray(saved.users)||saved.sessions!==undefined&&!Array.isArray(saved.sessions)||saved.profiles!==undefined&&(!saved.profiles||typeof saved.profiles!=='object'||Array.isArray(saved.profiles)))throw new Error('계정 저장 파일 형식이 올바르지 않습니다.');
    this.data={users:saved.users??[],sessions:saved.sessions??[],profiles:saved.profiles??{}};
  }catch(e){if(e.code!=='ENOENT')throw e;}}
  mutate(fn){const job=this.queue.then(async()=>{
    const next=structuredClone(this.data),result=fn(next),tmp=this.file+'.'+randomBytes(6).toString('hex')+'.tmp';
    await mkdir(path.dirname(this.file),{recursive:true});await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,this.file);this.data=next;return result;
  });this.queue=job.catch(()=>{});return job;}
  async register(nickname,password){
    const hash=await passwordHash(password);
    return this.mutate(d=>{if(d.users.some(u=>u.nickname.toLowerCase()===nickname.toLowerCase()))throw new Error('중복된 닉네임입니다.');const u={id:randomUUID(),nickname,passwordHash:hash};d.users.push(u);return publicUser(u);});
  }
  async login(nickname,password){
    await this.queue;const u=this.data.users.find(u=>u.nickname.toLowerCase()===nickname.toLowerCase());
    const stored=u?.passwordHash||'scrypt$00000000000000000000000000000000$'+'0'.repeat(64),[,salt,hash]=stored.split('$');
    const computed=await passwordHash(password,salt),actual=Buffer.from(computed.split('$')[2],'hex'),expected=Buffer.from(hash,'hex');
    return u&&expected.length===actual.length&&timingSafeEqual(expected,actual)?publicUser(u):null;
  }
  async createSession(id){const token=randomBytes(32).toString('hex');await this.mutate(d=>{d.sessions=d.sessions.filter(s=>s.expires>Date.now());d.sessions.push({hash:digest(token),id,expires:Date.now()+lifetime});});return token;}
  async authenticate(token){await this.queue;const s=this.data.sessions.find(s=>s.hash===digest(token)&&s.expires>Date.now());return publicUser(this.data.users.find(u=>u.id===s?.id));}
  logout(token){return this.mutate(d=>{d.sessions=d.sessions.filter(s=>s.hash!==digest(token));});}
  async getProfile(id){await this.queue;return {...DEFAULT_COLORS,...this.data.profiles[id]};}
  saveProfile(id,value){return this.mutate(d=>{d.profiles[id]=colors(value);return d.profiles[id];});}
  async close(){await this.queue;}
}

export async function createIdentityStore(options={}){
  if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL&&!options.accountStore)throw new Error('계정 영구 저장을 위해 DATABASE_URL을 설정해주세요.');
  const local=new FileAccounts(options.dataFile||path.resolve(process.env.NIGHTFALL_DATA_DIR||'.data','nightfall-accounts.json'));
  await local.init();
  let accounts=options.accountStore||local,ownedPool=null,pool=null;await options.ready;
  try{
  if(!options.accountStore&&process.env.DATABASE_URL){
    const [{default:pg},{default:bcrypt}]=await Promise.all([import('pg'),import('bcryptjs')]);
    ownedPool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000});
    ownedPool.on('error',idleDatabaseError);
    await ownedPool.query(`CREATE TABLE IF NOT EXISTS accounts(id UUID PRIMARY KEY,nickname VARCHAR(12) NOT NULL,password_hash TEXT NOT NULL,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE UNIQUE INDEX IF NOT EXISTS accounts_nickname_lower_unique ON accounts(LOWER(nickname));CREATE TABLE IF NOT EXISTS account_sessions(token_hash CHAR(64) PRIMARY KEY,account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)`);
    const db=ownedPool;
    accounts={
      async register(nickname,password){try{const r=await db.query('INSERT INTO accounts(id,nickname,password_hash) VALUES($1,$2,$3) RETURNING id,nickname',[randomUUID(),nickname,await bcrypt.hash(password,12)]);return r.rows[0];}catch(e){if(e.code==='23505')throw new Error('중복된 닉네임입니다.');throw e;}},
      async login(nickname,password){const r=await db.query('SELECT id,nickname,password_hash FROM accounts WHERE LOWER(nickname)=LOWER($1)',[nickname]);return r.rows[0]&&await bcrypt.compare(password,r.rows[0].password_hash)?publicUser(r.rows[0]):null;},
      async createSession(id){const t=randomBytes(32).toString('hex');await db.query("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[digest(t),id]);return t;},
      async authenticate(t){const r=await db.query('SELECT a.id,a.nickname FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>NOW()',[digest(t)]);return publicUser(r.rows[0]);},
      async logout(t){await db.query('DELETE FROM account_sessions WHERE token_hash=$1',[digest(t)]);}
    };
  }
  if(process.env.DATABASE_URL){
    const {default:pg}=await import('pg');pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
    pool.on('error',idleDatabaseError);
    await pool.query(`CREATE TABLE IF NOT EXISTS nightfall_profiles (
      account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      survivor_color VARCHAR(7) NOT NULL DEFAULT '#657f62',killer_color VARCHAR(7) NOT NULL DEFAULT '#643e37',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }
  return {
    accounts,
    async getProfile(id){if(!pool)return local.getProfile(id);const r=await pool.query('SELECT survivor_color,killer_color FROM nightfall_profiles WHERE account_id=$1',[id]);return r.rows[0]?{survivorColor:r.rows[0].survivor_color,killerColor:r.rows[0].killer_color}:{...DEFAULT_COLORS};},
    async saveProfile(id,value){const c=colors(value);if(pool)await pool.query('INSERT INTO nightfall_profiles(account_id,survivor_color,killer_color) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET survivor_color=$2,killer_color=$3,updated_at=NOW()',[id,c.survivorColor,c.killerColor]);else await local.saveProfile(id,c);return c;},
    async close(){await local.close();if(pool)await pool.end();if(ownedPool)await ownedPool.end();}
  };
  }catch(error){await Promise.allSettled([pool?.end(),ownedPool?.end()]);throw error;}
}

export const cookieName='nightfall_session';
export function readSession(header=''){
  for(const part of header.split(';')){const [key,...value]=part.trim().split('=');if(key===cookieName){const token=value.join('=');return /^[a-f0-9]{64}$/.test(token)?token:null;}}
  return null;
}
export function sessionCookie(token,secure=false){return `${cookieName}=${token||''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token?2592000:0}${secure?'; Secure':''}`;}
