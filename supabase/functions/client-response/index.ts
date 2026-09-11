import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const page=(title:string,body:string,status=200)=>new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head><body style="margin:0;background:#111114;color:#eee;font-family:Arial"><main style="max-width:580px;margin:30px auto;padding:24px;background:#18181b;border:1px solid #3f3f46;border-radius:14px"><h1 style="color:#39ff14">GadgetBoy</h1><h2>${esc(title)}</h2>${body}</main></body></html>`,{status,headers:{...cors,'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
const button=(token:string,action:string,label:string,color:string)=>`<a href="?token=${encodeURIComponent(token)}&amp;action=${action}" style="display:inline-block;margin:5px;padding:12px 15px;border-radius:7px;background:${color};color:white;text-decoration:none;font-weight:700">${esc(label)}</a>`;
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
 try{
  const url=new URL(req.url),token=url.searchParams.get('token')||'',requestedAction=(url.searchParams.get('action')||'view').toLowerCase();
  if(!token)return page('Invalid link','<p>This response link is incomplete.</p>',400);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:tokenRow,error:tokenLookupError}=await admin.from('client_response_tokens').select('*').eq('token_hash',await hash(token)).maybeSingle();
  if(tokenLookupError)throw new Error('This response link could not be verified. Please contact the shop.');
  if(!tokenRow||new Date(tokenRow.expires_at).getTime()<Date.now())return page('Link expired','<p>Please contact the shop for a new response link.</p>',410);
  const {data:workOrder,error:workOrderError}=await admin.from('work_orders').select('id,shop_id,legacy_id,customer_id,product_category,product_description,model,serial,problem_info,repair_status,workflow_stage,scheduled_pickup_at').eq('id',tokenRow.work_order_id).maybeSingle();
  if(workOrderError||!workOrder)throw new Error('The linked work order could not be loaded. Please contact the shop.');
  const allowedActions=Array.isArray(tokenRow.allowed_actions)?tokenRow.allowed_actions.map(String):['question','add_information'];
  const device=esc([workOrder.product_description,workOrder.model].filter(Boolean).join(' - ')||workOrder.product_category||'your device');
  const summary=`<p><strong>${device}</strong> · WO #${esc(tokenRow.legacy_record_id)}</p><p>Status: ${esc(workOrder.repair_status||workOrder.workflow_stage||'In progress')}</p>`;
  if(req.method==='GET'){
   if(requestedAction!=='view'&&!allowedActions.includes(requestedAction))return page('Unavailable response',summary+'<p>This choice is not available for this message.</p>',400);
   if(requestedAction!=='view'){
    const requiresMessage=['question','request_pickup_change','add_information'].includes(requestedAction);
    return page('Send your response',`${summary}<form method="post"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="${esc(requestedAction)}">${requiresMessage?'<textarea name="message" maxlength="5000" required style="box-sizing:border-box;width:100%;min-height:120px;padding:10px" placeholder="Enter your message"></textarea>':''}<button style="display:block;margin-top:12px;padding:12px 18px">Confirm ${esc(requestedAction.replaceAll('_',' '))}</button></form>`);
   }
   const choices=[allowedActions.includes('approve')?button(token,'approve','Approve Repair','#15803d'):'',allowedActions.includes('decline')?button(token,'decline','Decline Repair','#be123c'):'',allowedActions.includes('confirm_pickup')?button(token,'confirm_pickup','Confirm Pickup','#15803d'):'',allowedActions.includes('request_pickup_change')?button(token,'request_pickup_change','Request Another Time','#b45309'):'',allowedActions.includes('question')?button(token,'question','Ask a Question','#7e22ce'):'',allowedActions.includes('add_information')?button(token,'add_information','Add Information','#0369a1'):''].join('');
   return page('Repair update',summary+`<div>${choices}</div>`);
  }
  const form=await req.formData(),selected=String(form.get('action')||requestedAction).toLowerCase(),message=String(form.get('message')||'').trim().slice(0,5000);
  if(!allowedActions.includes(selected))return page('Invalid response',summary+'<p>Select a valid response.</p>',400);
  if(['question','request_pickup_change','add_information'].includes(selected)&&!message)return page('Message required',summary+'<p>Please enter your message.</p>',400);
  const responseTypes:Record<string,string>={approve:'approved',decline:'declined',question:'question',confirm_pickup:'confirmed_pickup',request_pickup_change:'pickup_change_requested',add_information:'information'};
  const responseType=responseTypes[selected]; if(!responseType)return page('Invalid response',summary+'<p>Select a valid response.</p>',400);
  const conversationId=tokenRow.id;
  const {data:existing}=await admin.from('client_responses').select('id').eq('work_order_id',tokenRow.work_order_id).eq('conversation_id',conversationId).eq('response_type',responseType).eq('message',message||'').maybeSingle();
  if(!existing)await admin.from('client_responses').insert({shop_id:tokenRow.shop_id,work_order_id:tokenRow.work_order_id,legacy_record_id:tokenRow.legacy_record_id,customer_id:workOrder.customer_id,response_type:responseType,message:message||null,conversation_id:conversationId});
  const now=new Date().toISOString();
  const patch=selected==='approve'?{client_decision:'approved',client_decision_at:now,status_update:'Client Approved - Staff Acknowledgment Needed',status_updated_at:now}:selected==='decline'?{client_decision:'declined',client_decision_at:now,workflow_stage:'Pickup',repair_status:'Repair Declined - Awaiting Pickup',status_update:'Client Declined Repair',pickup_ready_at:now,status_updated_at:now}:selected==='confirm_pickup'?{status_update:'Client Confirmed Scheduled Pickup',status_updated_at:now}:{status_update:selected==='request_pickup_change'?'Client Requested Pickup Change':'Client Reply - Awaiting Response',status_updated_at:now};
  await admin.from('work_orders').update(patch).eq('id',tokenRow.work_order_id);
  return page('Response received',summary+`<p>Thank you. Your ${responseType.replaceAll('_',' ')} response has been sent to GadgetBoy.</p>`);
 }catch(error){return page('Unable to save response',`<p>${esc(error instanceof Error?error.message:error)}</p>`,500)}
});
