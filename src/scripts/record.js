const target=document.querySelector('#saved-record');
const id=new URLSearchParams(location.search).get('id'),token=location.hash.slice(1);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={front:'Front',front_left:'Front-left',driver_side:'Driver side',rear_left:'Rear-left',rear:'Rear',rear_right:'Rear-right',passenger_side:'Passenger side',front_right:'Front-right',windscreen:'Windscreen',wheels:'Wheels and tyres',roof:'Roof',odometer:'Odometer'};
const urls=[],photoBlobs={};
async function load(){
  if(!/^[0-9a-f-]{36}$/i.test(id||'')||!/^[0-9a-f]{64}$/i.test(token))throw Error('This link is incomplete. Open the full private link saved after checkout.');
  const root='/api/records/'+encodeURIComponent(id),headers={authorization:'Bearer '+token};
  const response=await fetch(root,{headers}),data=await response.json();
  if(!response.ok)throw Error(data.error||'Unable to open record');
  if(data.status!=='finalized')throw Error('This record is still waiting for the original device to finish uploading.');
  const m=data.manifest,details=[
    ['Registration',m.vehicle.registration],['Make and model',[m.vehicle.make,m.vehicle.model].filter(Boolean).join(' ')],
    ['Year',m.vehicle.year],['Colour',m.vehicle.colour],['VIN',m.vehicle.vin],['Odometer',m.vehicle.odometerKm?m.vehicle.odometerKm+' km':''],
    ['Collection date',m.transport.collectionDate],['Transporter',m.transport.carrier],['From',m.transport.origin],['To',m.transport.destination]
  ].filter(([,v])=>v);
  target.innerHTML='<span class="section-index">SAVED RECORD</span><h2>'+escapeHTML(m.vehicle.make+' '+m.vehicle.model)+'</h2>'+
    '<p>Server receipt: '+escapeHTML(new Date(m.finalizedAt).toLocaleString())+' · Record ID: '+escapeHTML(id)+'</p>'+
    '<div class="summary-details">'+details.map(([label,v])=>'<div><span>'+label+'</span><strong>'+escapeHTML(v)+'</strong></div>').join('')+'</div>'+
    '<h3 class="review-section-title">Photos</h3><div class="review-grid" id="saved-photos"></div>'+
    '<h3 class="review-section-title">Existing marks · '+m.damage.length+'</h3>'+
    (m.damage.map(d=>'<div class="mark-review"><div><strong>'+escapeHTML(d.area+' · '+(d.kind||'Mark'))+'</strong><p>'+escapeHTML(d.description)+'</p></div></div>').join('')||'<p>No existing marks were noted. This does not assert that the vehicle is damage-free.</p>')+
    '<div class="notice">SHA-256 manifest digest: <code>'+escapeHTML(data.manifestSha256)+'</code><br/>This is a server-received record, not independent verification of when or where the photos were taken or who caused any change.</div>'+
    '<div class="step-actions"><button type="button" class="button button-primary" id="save-pdf">Download PDF ↓</button></div>'+
    (data.canManage?'<section class="share-panel"><h3>Keep your creator link</h3><p>This link gives you access to your paid record and allows deletion. Save the confirmation email and keep the link private.</p><form id="creator-email-form"><label class="field"><span>Your creator email</span><input type="email" id="creator-email-address" autocomplete="email" maxlength="254" value="'+escapeHTML(data.creatorEmail?.email||'')+'" '+(data.creatorEmail?.email?'readonly':'')+' required/></label><p class="record-link-note">This can differ from the email used for your Stripe payment.</p><button class="button button-light" type="submit">'+(data.creatorEmail?.status==='queued'?'Creator email already queued':'Email my creator link')+'</button></form><p id="creator-email-status" role="status">'+(data.creatorEmail?.status==='queued'?'Your creator email has been queued. Check your inbox and spam folder.':'')+'</p></section>':'')+
    '<section class="share-panel"><h3>Share this condition record</h3><p>Send the same record to the person receiving the vehicle, the transporter or anyone else involved.</p><div class="step-actions"><button type="button" class="button button-light" id="copy-record">Copy private link</button><button type="button" class="button button-light" id="share-record" hidden>Share from this device</button></div>'+
    (data.emailSharingEnabled?'<form id="share-email-form"><label class="field"><span>Recipient email addresses</span><textarea id="share-emails" rows="3" maxlength="2600" placeholder="recipient@example.com" required></textarea></label><p class="record-link-note">Separate addresses with commas or new lines. Up to 10 recipients; each receives a separate email.</p><label class="checkout-consent"><input type="checkbox" required/> I intend to give these recipients access to this private record.</label><button class="button button-primary" type="submit">Email private link ↗</button></form>':data.canManage?'<p>Email sharing will be available once sending is enabled. You can copy or share the link now.</p>':'<p>You can copy this view-only link or share it from your device.</p>')+'<p id="share-status" role="status"></p><p class="record-link-note">Recipients receive a view-only link. Keep your creator link private; it also allows deletion. Sharing does not confirm that the recipient accepts its condition.</p></section>'+
    '<p class="record-link-note">Anyone with the complete private link can access this record. For help, email <a href="mailto:support@howitwas.co">support@howitwas.co</a>.</p>'+
    (data.canManage?'<button type="button" class="subtle-button delete-draft" id="delete-record">Permanently delete this record</button>':'<p class="record-link-note">This is a view-only recipient link.</p>');
  const grid=document.querySelector('#saved-photos');
  const marks=[...document.querySelectorAll('.mark-review')];
  for(const photo of m.photos){
    const r=await fetch(root+'/photos/'+encodeURIComponent(photo.key),{headers});
    if(!r.ok)throw Error('A saved photo could not be loaded');
    const blob=await r.blob();photoBlobs[photo.key]=blob;const url=URL.createObjectURL(blob);urls.push(url);
    const markIndex=m.damage.findIndex(d=>photo.key==='damage-'+d.id);
    if(markIndex!==-1){
      const img=document.createElement('img');img.src=url;img.alt='Existing mark close-up: '+m.damage[markIndex].area;
      marks[markIndex].append(img);
      continue;
    }
    const card=document.createElement('div');card.className='review-card';
    const img=document.createElement('img');img.src=url;img.alt=labels[photo.key]||'Close-up';
    const name=document.createElement('strong');name.textContent=labels[photo.key]||'Existing mark close-up';
    const hash=document.createElement('span');hash.textContent='SHA-256: '+photo.sha256;
    card.append(img,name,hash);grid.append(card);
  }
  document.querySelector('#save-pdf').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='Preparing PDF…';
    try{const {downloadRecordPDF}=await import('./pdf.js');await downloadRecordPDF(data,photoBlobs);}
    catch(error){document.querySelector('#share-status').textContent=error.message||'PDF download failed. Please retry.';}
    finally{button.disabled=false;button.textContent='Download PDF ↓';}
  });
  const privateLink=data.shareLink;
  const shareStatus=document.querySelector('#share-status');
  document.querySelector('#copy-record').addEventListener('click',async()=>{
    try{if(!privateLink)throw Error('Sharing unavailable');await navigator.clipboard.writeText(privateLink);shareStatus.textContent='Private link copied.';}
    catch{shareStatus.textContent='Could not copy the recipient link. Reload and try again.';}
  });
  const shareButton=document.querySelector('#share-record');
  if(navigator.share && privateLink){shareButton.hidden=false;shareButton.addEventListener('click',async()=>{
    try{await navigator.share({title:'How It Was vehicle condition record',url:privateLink});}
    catch(error){if(error.name!=='AbortError')shareStatus.textContent='Device sharing is unavailable. Copy the link instead.';}
  });}
  document.querySelector('#creator-email-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
    const button=form.querySelector('button'),status=document.querySelector('#creator-email-status');button.disabled=true;status.textContent='Sending your creator link…';
    try{
      const response=await fetch(root+'/creator-email',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({email:document.querySelector('#creator-email-address').value})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to email creator link');
      const delivery=result.creatorEmail;
      if(delivery.status==='queued'){status.textContent='Creator email queued for '+delivery.email+'. Check your inbox and spam folder.';document.querySelector('#creator-email-address').readOnly=true;button.textContent='Creator email already queued';}
      else if(delivery.status==='support_required')status.textContent='Your record is saved. Contact support@howitwas.co for help with the creator email.';
      else status.textContent='Your record is saved, but email has not been queued. Retry or keep your creator link from the browser address bar.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=false;}
  });
  let requestId=null,requestEmails='';
  document.querySelector('#share-email-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
    const emails=document.querySelector('#share-emails').value.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
    const key=JSON.stringify(emails);if(key!==requestEmails || !requestId){requestId=crypto.randomUUID();requestEmails=key;}
    const button=form.querySelector('button');button.disabled=true;shareStatus.textContent='Sending private links…';
    try{
      const response=await fetch(root+'/share',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({emails,requestId})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Email sharing failed.');
      shareStatus.textContent='Email queued for '+result.count+' recipient'+(result.count===1?'':'s')+'. Check inboxes and spam folders; delivery can take a moment.';
      form.reset();requestId=null;requestEmails='';
    }catch(error){shareStatus.textContent=error.message;}
    finally{button.disabled=false;}
  });
  document.querySelector('#delete-record')?.addEventListener('click',async()=>{
    if(!confirm('Permanently delete this record and all its photos? This cannot be undone.'))return;
    const button=document.querySelector('#delete-record');button.disabled=true;
    try{
      const response=await fetch(root,{method:'DELETE',headers});
      if(!response.ok)throw Error((await response.json()).error||'Deletion failed');
      target.innerHTML='<div class="notice">This record and its photos have been deleted. Its private link no longer works.</div>';
    }catch(e){button.disabled=false;alert(e.message);}
  });
}
load().catch(e=>{target.innerHTML='<div class="notice">'+escapeHTML(e.message)+'</div>';});
window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
