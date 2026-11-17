import { authenticateTelegram } from './auth';

export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_IDS: string;
  FRONTEND_ORIGIN?: string;
}

type Obj = Record<string, unknown>;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const text = (v: unknown, min: number, max: number, label: string): string => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) return fail(400, `Некорректное поле: ${label}`);
  return v.trim();
};
const num = (v: unknown, min: number, max: number, label: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return fail(400, `Некорректное поле: ${label}`);
  return v;
};
const integer = (v: unknown, min: number, max: number, label: string): number => {
  const n = num(v, min, max, label);
  if (!Number.isSafeInteger(n)) return fail(400, `Некорректное поле: ${label}`);
  return n;
};
const optionalText = (v: unknown, max: number, label: string) => v === undefined ? '' : (typeof v === 'string' && v.length <= max ? v : fail(400, `Некорректное поле: ${label}`));
const oneOf = (v: unknown, values: string[], label: string): string => typeof v === 'string' && values.includes(v) ? v : fail(400, `Некорректное поле: ${label}`);
const isoDate = (v: unknown): string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) !== v) return fail(400, 'Некорректная дата');
  return v;
};
const today = () => new Date().toISOString().slice(0,10);
const json = (value: unknown, status = 200) => Response.json(value, {status});
const rows = async <T = Obj>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> => (await db.prepare(sql).bind(...args).all<T>()).results;
const first = async <T = Obj>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> => db.prepare(sql).bind(...args).first<T>();
const run = (db: D1Database, sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
const exists = async (db: D1Database, table: 'inventory' | 'pets', id: number) => { if (!await first(db, `SELECT id FROM ${table} WHERE id=?`, id)) fail(404, 'Не найдено'); };
const body = async (req: Request): Promise<Obj> => {
  if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) return fail(415, 'Ожидается JSON');
  if (Number(req.headers.get('content-length') || 0) > 16_384) return fail(413, 'Слишком большой запрос');
  let value: unknown;
  try { value = JSON.parse(await req.text()); } catch { return fail(400, 'Некорректный JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'Ожидается объект');
  return value as Obj;
};
const idOf = (s: string) => /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0 ? Number(s) : fail(400, 'Некорректный ID');
const monthOf = (v: string | null) => {
  const m = v ?? today().slice(0,7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return fail(400, 'Формат месяца: ГГГГ-ММ');
  return m;
};

async function route(req: Request, env: Env, path: string, url: URL): Promise<Response> {
  const db = env.DB, method = req.method;
  if (path === '/api/me' && method === 'GET') return json({ok: true});
  const itemKind = path.match(/^\/api\/items\/(tasks|shopping)$/);
  if (itemKind) {
    const kind = itemKind[1];
    if (method === 'GET') return json(await rows(db, 'SELECT * FROM items WHERE kind=? ORDER BY id DESC', kind));
    if (method === 'POST') {
      const b = await body(req), title = text(b.title,1,160,'title');
      const r = await run(db, 'INSERT INTO items(kind,title) VALUES(?,?)',kind,title);
      return json({id:r.meta.last_row_id,kind,title,done:0});
    }
  }
  const itemId = path.match(/^\/api\/items\/(\d+)$/);
  if (itemId) {
    const id = idOf(itemId[1]);
    if (method === 'PATCH') {
      const b = await body(req);
      if (typeof b.done !== 'boolean') fail(400,'Некорректное поле: done');
      const r = await run(db,'UPDATE items SET done=? WHERE id=?',b.done ? 1:0,id);
      if (!r.meta.changes) fail(404,'Не найдено');
      return json({ok:true});
    }
    if (method === 'DELETE') { await run(db,'DELETE FROM items WHERE id=?',id); return json({ok:true}); }
  }
  if (path === '/api/inventory') {
    if (method === 'GET') {
      const data = await rows<Obj>(db,'SELECT id,name,category,unit,quantity,threshold,note FROM inventory ORDER BY category,name');
      const usage = await rows<{inventory_id:number;used:number}>(db,"SELECT inventory_id, COALESCE(SUM(-delta),0) AS used FROM movements WHERE delta<0 AND date(created_at)>=date('now','-29 days') GROUP BY inventory_id");
      const usageById = new Map(usage.map(x=>[x.inventory_id,x.used]));
      return json(data.map(x=>{
        const used = usageById.get(x.id as number) || 0;
        const daily = used > 0 ? Math.round(used / 30 * 1000) / 1000 : null;
        return {...x, daily_use:daily, days_left:daily ? Math.round((x.quantity as number)/daily*10)/10:null, low:(x.quantity as number)<=(x.threshold as number)};
      }));
    }
    if (method === 'POST') {
      const b = await body(req);
      const name = text(b.name,1,120,'name'), category = oneOf(b.category,['food','cat_food','litter','household','other'],'category'), unit = oneOf(b.unit,['г','кг','л','мл','шт'],'unit');
      const quantity = num(b.quantity,0,1e6,'quantity'), threshold = num(b.threshold ?? 0,0,1e6,'threshold'), note = optionalText(b.note,300,'note');
      // D1 batch is atomic; preserve initial stock history.
      const results = await db.batch([
        db.prepare('INSERT INTO inventory(name,category,unit,quantity,min_quantity,threshold,note) VALUES(?,?,?,?,?,?,?)').bind(name,category,unit,quantity,threshold,threshold,note),
        db.prepare("INSERT INTO movements(inventory_id,delta,note) SELECT last_insert_rowid(), ?, 'Начальный остаток' WHERE ? > 0").bind(quantity,quantity)
      ]);
      return json({id:results[0].meta.last_row_id});
    }
  }
  const movement = path.match(/^\/api\/inventory\/(\d+)\/movement$/);
  if (movement && method === 'POST') {
    const id=idOf(movement[1]), b=await body(req), delta=num(b.delta,-1e6,1e6,'delta'), note=optionalText(b.note,300,'note');
    if (delta === 0) fail(400,'Укажите изменение');
    await exists(db,'inventory',id);
    // Conditional update prevents negative stock; batch ensures ledger consistency.
    const res=await db.batch([
      db.prepare('UPDATE inventory SET quantity=quantity+? WHERE id=? AND quantity+?>=0').bind(delta,id,delta),
      db.prepare('INSERT INTO movements(inventory_id,delta,note) SELECT ?,?,? WHERE changes()>0').bind(id,delta,note)
    ]);
    if (!res[0].meta.changes) fail(400,'Недостаточный остаток');
    return json({ok:true});
  }
  const history=path.match(/^\/api\/inventory\/(\d+)\/history$/);
  if (history && method === 'GET') return json(await rows(db,'SELECT * FROM movements WHERE inventory_id=? ORDER BY id DESC LIMIT 100',idOf(history[1])));
  const inventoryId=path.match(/^\/api\/inventory\/(\d+)$/);
  if (inventoryId && method === 'DELETE') {
    const id=idOf(inventoryId[1]);
    await db.batch([db.prepare('DELETE FROM movements WHERE inventory_id=?').bind(id),db.prepare('DELETE FROM inventory WHERE id=?').bind(id)]);
    return json({ok:true});
  }
  if (path === '/api/expenses') {
    if (method === 'GET') return json(await rows(db,'SELECT * FROM expenses ORDER BY spent_on DESC,id DESC LIMIT 300'));
    if (method === 'POST') {
      const b=await body(req), category=text(b.category,1,80,'category'), amount=num(b.amount,Number.MIN_VALUE,1e8,'amount'), description=text(b.description,1,200,'description'), spentOn=isoDate(b.spent_on ?? today());
      const r=await run(db,'INSERT INTO expenses(category,amount,description,spent_on) VALUES(?,?,?,?)',category,amount,description,spentOn);
      return json({id:r.meta.last_row_id});
    }
  }
  const expenseId=path.match(/^\/api\/expenses\/(\d+)$/);
  if (expenseId && method === 'DELETE') { await run(db,'DELETE FROM expenses WHERE id=?',idOf(expenseId[1]));return json({ok:true}); }
  if (path === '/api/budgets') {
    if (method === 'GET') return json(await rows(db,'SELECT * FROM budgets ORDER BY category'));
    if (method === 'PUT') {
      const b=await body(req), category=text(b.category,1,80,'category'), limit=num(b.monthly_limit,0,1e8,'monthly_limit');
      await run(db,'INSERT INTO budgets(category,monthly_limit) VALUES(?,?) ON CONFLICT(category) DO UPDATE SET monthly_limit=excluded.monthly_limit',category,limit);
      return json({ok:true});
    }
  }
  if (path === '/api/analytics' && method === 'GET') {
    const month=monthOf(url.searchParams.get('month'));
    const [spending,budgets,consumption]=await Promise.all([
      rows<{category:string;total:number}>(db,'SELECT category,ROUND(SUM(amount),2) AS total FROM expenses WHERE substr(spent_on,1,7)=? GROUP BY category ORDER BY total DESC',month),
      rows(db,'SELECT * FROM budgets'),
      rows(db,'SELECT i.name,i.category,i.unit,ROUND(SUM(-m.delta),2) AS used FROM movements m JOIN inventory i ON i.id=m.inventory_id WHERE m.delta<0 AND substr(m.created_at,1,7)=? GROUP BY i.id ORDER BY used DESC',month)
    ]);
    return json({month,spending,budgets,consumption,total:Math.round(spending.reduce((s,x)=>s+x.total,0)*100)/100});
  }
  if (path === '/api/pets' && method === 'GET') return json(await rows(db,'SELECT * FROM pets ORDER BY id'));
  const petId=path.match(/^\/api\/pets\/(\d+)$/);
  if (petId && method === 'PATCH') {
    const b=await body(req), notes=optionalText(b.notes,500,'notes');
    const r=await run(db,'UPDATE pets SET notes=? WHERE id=?',notes,idOf(petId[1]));
    if (!r.meta.changes) fail(404,'Не найдено');
    return json({ok:true});
  }
  if (path === '/api/care') {
    if (method === 'GET') {
      const care=await rows<Obj>(db,'SELECT c.*,p.name AS pet_name FROM care c LEFT JOIN pets p ON p.id=c.pet_id ORDER BY c.id DESC');
      return json(care.map(x=>{
        const due = x.last_done ? new Date(Date.parse(`${x.last_done}T00:00:00Z`) + (x.interval_days as number)*86400000).toISOString().slice(0,10) : today();
        return {...x,due_on:due,overdue:due<today()};
      }));
    }
    if (method === 'POST') {
      const b=await body(req), title=text(b.title,1,120,'title'), interval=integer(b.interval_days,1,3650,'interval_days');
      const petId=b.pet_id == null ? null : integer(b.pet_id,1,Number.MAX_SAFE_INTEGER,'pet_id');
      if (petId !== null) await exists(db,'pets',petId);
      const r=await run(db,'INSERT INTO care(title,pet_id,interval_days) VALUES(?,?,?)',title,petId,interval);
      return json({id:r.meta.last_row_id});
    }
  }
  const careDone=path.match(/^\/api\/care\/(\d+)\/done$/);
  if (careDone && method === 'POST') {
    const r=await run(db,'UPDATE care SET last_done=? WHERE id=?',today(),idOf(careDone[1]));
    if (!r.meta.changes) fail(404,'Не найдено');
    return json({ok:true});
  }
  const careId=path.match(/^\/api\/care\/(\d+)$/);
  if (careId && method === 'DELETE') { await run(db,'DELETE FROM care WHERE id=?',idOf(careId[1]));return json({ok:true}); }
  if (path === '/api/menu') {
    if (method === 'GET') return json(await rows(db,'SELECT * FROM menu ORDER BY day,meal'));
    if (method === 'PUT') {
      const b=await body(req), day=isoDate(b.day), meal=oneOf(b.meal,['Завтрак','Обед','Ужин','Перекус'],'meal'), title=text(b.title,1,180,'title');
      await run(db,'INSERT INTO menu(day,meal,title) VALUES(?,?,?) ON CONFLICT(day,meal) DO UPDATE SET title=excluded.title',day,meal,title);
      return json({ok:true});
    }
  }
  return fail(404,'Not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url=new URL(request.url), path=url.pathname;
    const origin=request.headers.get('origin');
    const allowedOrigin=env.FRONTEND_ORIGIN || '';
    const cors=origin && allowedOrigin && origin === allowedOrigin ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, X-Telegram-Init-Data','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'} : {};
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    try {
      if (path==='/api/health' && request.method==='GET') {
        await env.DB.prepare('SELECT 1').first();
        return json({status:'ok',service:'nash-dom-api',database:'connected'});
      }
      if (!path.startsWith('/api/')) return json({error:'Not found'},404);
      const user=await authenticateTelegram(request.headers.get('X-Telegram-Init-Data') || '',env);
      if (!user) {
        const r=json({error:'Unauthorized'},401);
        const headers=new Headers(r.headers);
        Object.entries(cors).forEach(([k,v])=>headers.set(k,v));
        headers.set('Cache-Control','no-store');
        return new Response(r.body,{status:401,headers});
      }
      const result=path==='/api/me' && request.method==='GET' ? json({id:user.id,first_name:user.first_name || '',username:user.username || ''}) : await route(request,env,path,url);
      const headers=new Headers(result.headers);
      Object.entries(cors).forEach(([k,v])=>headers.set(k,v));
      headers.set('Cache-Control','no-store');
      return new Response(result.body,{status:result.status,headers});
    } catch (e) {
      const status=e instanceof HttpError ? e.status : 500;
      if (status===500) console.error('API request failed',e instanceof Error ? e.message : 'unknown');
      const r=json({error:status===500?'Internal server error':(e as Error).message},status);
      const headers=new Headers(r.headers);
      Object.entries(cors).forEach(([k,v])=>headers.set(k,v));
      headers.set('Cache-Control','no-store');
      return new Response(r.body,{status,headers});
    }
  }
};
