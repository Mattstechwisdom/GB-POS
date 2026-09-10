import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const page=(title:string,body:string,status=200)=>new Response(`<!doctype html><html><meta name="viewport" content="width=device-width"><body style="margin:0;background:#111114;color:#eee;font-family:Arial"><main style="max-width:560px;margin:30px auto;padding:24px;background:#18181b;border:1px solid #3f3f46;border-radius:12px"><h1 style="color:#39ff14">GadgetBoy</h1><h2>${esc(title)}</h2>${body}</main></body></html>`,{status,headers:{...cors,'content-type':'text/html;charset=utf-8'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
 try{
  const url=new URL(req.url), token=url.searchParams.get('token')||'', action=(url.searchParams.get('action')||'view').toLowerCase();
  if(!token) return page('Invalid link','<p>This response link is incomplete.</p>',400);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:t}=await admin.from('client_response_tokens').select('*,work_orders(* )').eq('token_hash',await hash(token)).maybeSingle();
  if(!t || new Date(t.expires_at).getTime()<Date.now()) return page('Link expired','<p>Please contact the shop for a new approval request.</p>',410);
  const wo=t.work_orders||{}, label=esc([wo.product_description,wo.model].filter(Boolean).join(' - ')||'your device');
  if(req.method==='GET') return page('Repair approval',`<p>${label} · WO #${esc(t.legacy_record_id)}</p>${action==='approve'||action==='decline'?`<form method="post"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="${esc(action)}"><p>Confirm that you want to ${esc(action)} this repair.</p><button>Confirm ${esc(action)}</button></form>`:`<p><a href="?token=${encodeURIComponent(token)}&action=approve" style="color:#39ff14">Approve Repair</a></p><p><a href="?token=${encodeURIComponent(token)}&action=decline" style="color:#ff6b81">Decline Repair</a></p><form method="post"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="question"><textarea name="message" maxlength="5000" required style="width:100%;min-height:110px" placeholder="Type your question"></textarea><button>Ask a Question</button></form>`}`);
  let message=''; let selected=action;
  if(req.method==='POST'){const form=await req.formData(); selected=String(form.get('action')||action); message=String(form.get('message')||'').trim().slice(0,5000);}
  if(!['approve','decline','question'].includes(selected)) return page('Invalid response','<p>Select a valid response.</p>',400);
  if(selected==='question'&&!message) return page('Question required','<p>Please enter your question.</p>',400);
  const responseType=selected==='approve'?'approved':selected==='decline'?'declined':'question';
  const {data:existing}=await admin.from('client_responses').select('id').eq('work_order_id',t.work_order_id).eq('response_type',responseType).eq('message',message||'').maybeSingle();
  if(!existing) await admin.from('client_responses').insert({shop_id:t.shop_id,work_order_id:t.work_order_id,legacy_record_id:t.legacy_record_id,customer_id:wo.customer_id,response_type:responseType,message:message||null});
  const patch=selected==='approve'?{repair_status:wo.parts_ordered?'Waiting on Part Delivery':'Repair In Progress',status_update:'Client Approved Repair',status_updated_at:new Date().toISOString()}:selected==='decline'?{repair_status:'Repair Declined - Awaiting Pickup',status_update:'Client Declined Repair',pickup_ready_at:new Date().toISOString(),status_updated_at:new Date().toISOString()}:{status_update:'Client Question - Awaiting Response',status_updated_at:new Date().toISOString()};
  await admin.from('work_orders').update(patch).eq('id',t.work_order_id);
  return page('Response received',`<p>Thank you. Your ${responseType==='question'?'question':'response'} has been sent to GadgetBoy.</p>`);
 }catch(e){return page('Unable to save response',`<p>${esc(e instanceof Error?e.message:e)}</p>`,500)}
});
