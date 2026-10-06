const pendingKey='hiw-pending-online-v1';
const draftKey='hiw-vehicle-draft-v1';
const required=['front','front_left','driver_side','rear_left','rear','rear_right','passenger_side','front_right'];
const optional=['windscreen','wheels','roof','odometer'];
const heading=document.querySelector('#completion-heading');
const status=document.querySelector('#completion-status');
const actions=document.querySelector('#completion-actions');
const retry=document.querySelector('#retry-completion');
let running=false;

function progress(title,message){heading.textContent=title;status.textContent=message;}
function fail(message){progress('Your record needs attention.',message+' Your payment is not lost. Keep this browser data and retry from this device.');actions.hidden=false;}
function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('howitwas-preview-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function getPhoto(db,key){return new Promise((resolve,reject)=>{const request=db.transaction('photos','readonly').objectStore('photos').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function responseData(response){let data;try{data=await response.json();}catch{throw Error('The server returned an unexpected response.');}if(!response.ok)throw Error(data.error||'The request failed.');return data;}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function complete(){
  if(running)return;
  running=true;actions.hidden=true;
  try{
    const pending=JSON.parse(localStorage.getItem(pendingKey)||'null');
    if(!pending || !/^[0-9a-f-]{36}$/i.test(pending.id||'') || !/^[0-9a-f]{64}$/i.test(pending.token||''))throw Error('The payment details are missing from this browser. Return to the original browser and open this page again.');
    const root='/api/records/'+encodeURIComponent(pending.id);
    const headers={authorization:'Bearer '+pending.token};
    progress('Checking your payment…','Keep this tab open while we confirm the payment and upload your photos.');
    let record;
    for(let attempt=0;attempt<30;attempt++){
      record=await responseData(await fetch(root,{headers}));
      if(record.status!=='pending_payment')break;
      await pause(1000);
    }
    if(record.status==='pending_payment')throw Error('Payment confirmation is taking longer than expected.');
    if(record.status==='paid_pending_upload'){
      const draft=JSON.parse(localStorage.getItem(draftKey)||'null');
      if(!draft)throw Error('The photo draft is missing from this browser.');
      const db=await openDB();
      const keys=[...required,...optional,...(draft.damage||[]).filter(d=>d.photo).map(d=>'damage-'+d.id)];
      for(const key of required)if(!await getPhoto(db,key))throw Error('A required photo is missing from this browser.');
      let uploaded=0;
      for(const key of keys){
        const photo=await getPhoto(db,key);
        if(!photo)continue;
        progress('Uploading your photos…',`Uploading photo ${++uploaded}. Keep this tab open.`);
        await responseData(await fetch(root+'/photos/'+encodeURIComponent(key),{method:'PUT',headers:{...headers,'content-type':photo.type},body:photo}));
      }
      progress('Finishing your record…','Your photos have uploaded. Saving the final record now.');

    }else if(record.status!=='finalized')throw Error('This payment is not ready to save a record.');

    const final=await responseData(await fetch(root+'/finalize',{method:'POST',headers}));
    const email=final.creatorEmail;
    const link=new URL('/vehicle-transport/record/?id='+encodeURIComponent(pending.id),location.origin);
    link.hash=pending.token;
    const emailMessage=email?.status==='queued'?'Your creator link has been queued for email to '+email.email+'. Check your inbox and spam folder.':email?.status==='pending'?'Your record is saved, but the creator email has not been queued yet. Keep the link below and retry the email.':email?.status==='support_required'?'Your record is saved. Contact support@howitwas.co for help with the creator email.':'Keep your creator link below. You can email it to yourself from the saved record page.';
    progress('Your private record is ready.','All photos are saved. '+emailMessage+' Keep your creator link private; use the sharing options inside your record for recipients.');
    document.querySelectorAll('.completion-link,.completion-ready-actions').forEach(element=>element.remove());
    const url=document.createElement('a');url.href=link.href;url.textContent=link.href;url.className='completion-link';
    const row=document.createElement('div');row.className='step-actions completion-ready-actions';
    const open=document.createElement('a');open.href=link.href;open.className='button button-primary';open.textContent='Open, download or share record ↗';
    const copy=document.createElement('button');copy.type='button';copy.className='button button-light';copy.textContent='Copy private link';
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.href);copy.textContent='Copied';}catch{copy.textContent='Select and copy the link above';}});
    row.append(open,copy);
    if(email?.status==='pending'){const send=document.createElement('button');send.type='button';send.className='button button-light';send.textContent='Retry creator email';send.addEventListener('click',()=>{send.disabled=true;complete();});row.append(send);}status.after(url,row);
  }catch(error){fail(error.message||'The upload did not finish.');}
  finally{running=false;}
}
retry.addEventListener('click',complete);
complete();
