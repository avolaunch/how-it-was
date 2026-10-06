const steps = [
  {key:'details', title:'Which vehicle are we documenting?', intro:'Start with the details that identify this vehicle.'},
  {key:'transport', title:'Where is it going?', intro:'Add the planned collection details. You can update these before finishing.'},
  {key:'front', title:'Photograph the front', intro:'Stand directly in front. Include the whole front of the vehicle.'},
  {key:'front_left', title:'Front-left angle', intro:'Show the front and the driver side together.'},
  {key:'driver_side', title:'Driver side', intro:'Step back so the full side is visible.'},
  {key:'rear_left', title:'Rear-left angle', intro:'Show the rear and driver side together.'},
  {key:'rear', title:'Photograph the rear', intro:'Include the entire rear of the vehicle.'},
  {key:'rear_right', title:'Rear-right angle', intro:'Show the rear and passenger side together.'},
  {key:'passenger_side', title:'Passenger side', intro:'Step back so the full side is visible.'},
  {key:'front_right', title:'Front-right angle', intro:'Show the front and passenger side together.'},
  {key:'details_photos', title:'A few useful details', intro:'These views are optional, but can help show smaller marks.'},
  {key:'damage', title:'Any existing marks?', intro:'Note the scratches, dents, chips or other details you want included.'},
  {key:'review', title:'Review your draft', intro:'Check the details and photos while the vehicle is still with you.'}
];
const photoLabels = Object.fromEntries(steps.slice(2,10).map(s=>[s.key,s.title.replace('Photograph the ','')]));
const draftKey = 'hiw-vehicle-draft-v1';
const pendingKey = 'hiw-pending-online-v1';
let onlineConfig = null, turnstileToken = '', selectedCurrency = 'gbp';
const app = document.querySelector('#capture-app');
const progressLabel = document.querySelector('#progress-label');
const progressFill = document.querySelector('#progress-fill');
const fresh = () => ({step:0, vehicle:{}, transport:{}, photos:{}, damage:[], updatedAt:null});
let draft;
try { draft = {...fresh(), ...JSON.parse(localStorage.getItem(draftKey) || '{}')}; } catch { draft = fresh(); }
draft.step = Math.max(0, Math.min(steps.length-1, Number(draft.step)||0));
let db;
const urls = [];
function escapeHTML(value=''){return String(value).replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function save(){draft.updatedAt=new Date().toISOString();localStorage.setItem(draftKey,JSON.stringify(draft));}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('howitwas-preview-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('photos');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function photoAction(mode,key,blob){return new Promise((resolve,reject)=>{const tx=db.transaction('photos',mode==='get'?'readonly':'readwrite');const req=mode==='put'?tx.objectStore('photos').put(blob,key):mode==='delete'?tx.objectStore('photos').delete(key):tx.objectStore('photos').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function previewURL(blob){const url=URL.createObjectURL(blob);urls.push(url);return url;}
function releaseURLs(){urls.splice(0).forEach(url=>URL.revokeObjectURL(url));}
function field(label,key,value='',required=false,type='text',extra=''){return `<label class="field"><span>${label}${required?' *':''}</span><input name="${key}" type="${type}" value="${escapeHTML(value)}" ${required?'required':''} ${extra}/></label>`;}
function actions(previous=true,next='Continue'){return `<div class="step-actions">${previous?'<button class="button button-light" type="button" data-action="back">← Back</button>':'<span></span>'}<button class="button button-dark" type="submit">${next} <span aria-hidden="true">→</span></button></div>`;}
function error(message=''){const el=app.querySelector('.inline-alert');if(el)el.textContent=message;}
async function render(){
  releaseURLs(); const index=draft.step, step=steps[index];
  progressLabel.textContent=`Step ${index+1} of ${steps.length} · ${step.key==='review'?'Review':index<2?'Details':index<11?'Photos':'Existing marks'}`;
  progressFill.style.width=`${Math.round((index+1)/steps.length*100)}%`;
  let body='';
  if(step.key==='details') body=`<div class="field-grid">${field('Registration','registration',draft.vehicle.registration,true)}${field('Make','make',draft.vehicle.make,true)}${field('Model','model',draft.vehicle.model,true)}${field('Year','year',draft.vehicle.year,false,'number','min="1900" max="2100"')}${field('Colour','colour',draft.vehicle.colour)}${field('VIN (optional)','vin',draft.vehicle.vin)}</div>${actions(false)}`;
  else if(step.key==='transport') body=`<div class="field-grid">${field('Collection date','collectionDate',draft.transport.collectionDate,false,'date')}${field('Transporter','carrier',draft.transport.carrier)}${field('From','origin',draft.transport.origin)}${field('To','destination',draft.transport.destination)}</div>${actions()}`;
  else if(index>=2&&index<=9){const blob=await photoAction('get',step.key);body=`<div class="photo-drop">${blob?`<div><img src="${previewURL(blob)}" alt="Your ${escapeHTML(step.title.toLowerCase())} photo"/><label for="step-photo">Replace photo</label></div>`:`<div><div class="step-icon" aria-hidden="true">◎</div><label for="step-photo">Take or choose a photo</label><p class="photo-hint">One photo for this view · JPEG, PNG or HEIC where supported</p></div>`}<input id="step-photo" type="file" accept="image/*" capture="environment"/></div><div class="inline-alert" role="alert"></div>${actions(true,blob?'Next view':'Save and continue')}`;}
  else if(step.key==='details_photos'){let cards='';for(const [key,label] of [['windscreen','Windscreen'],['wheels','Wheels and tyres'],['roof','Roof'],['odometer','Odometer']]){const blob=await photoAction('get',key);cards+=`<div class="review-card">${blob?`<img src="${previewURL(blob)}" alt="${label}"/>`:`<div class="empty-photo">No photo added</div>`}<strong>${label}</strong><label class="subtle-button" for="detail-${key}">${blob?'Replace':'Add photo'}</label><input id="detail-${key}" type="file" accept="image/*" capture="environment" data-photo-key="${key}" hidden/></div>`;}body=`<div class="review-grid">${cards}</div><div class="field-grid">${field('Odometer reading (km)','odometerKm',draft.vehicle.odometerKm,false,'number','min="0"')}</div><div class="inline-alert" role="alert"></div>${actions()}`;}
  else if(step.key==='damage'){const list=draft.damage.map((d,i)=>`<div class="damage-item"><div><strong>${escapeHTML(d.area)}</strong> · ${escapeHTML(d.kind||'Mark')}<br/><small>${escapeHTML(d.description)}</small>${d.photo?'<br/><small>Photo included</small>':''}</div><button type="button" data-action="remove-damage" data-index="${i}">Remove</button></div>`).join('');body=`<div class="damage-list">${list||'<p>No existing marks added. This does not assert that the vehicle has no damage.</p>'}</div><div class="field-grid">${field('Where is it?','area','',false,'text','placeholder="e.g. Driver door"')}${field('Type of mark','kind','',false,'text','placeholder="e.g. Scratch"')}<label class="field full">Description<textarea name="description" placeholder="Describe its location and appearance"></textarea></label><label class="field full">Close-up photo (optional)<input name="damagePhoto" type="file" accept="image/*" capture="environment"/></label></div><button class="button button-light" type="button" data-action="add-damage">+ Add this mark</button><div class="inline-alert" role="alert"></div>${actions(true,'Review draft')}`;}
  else {
    const photos=[];
    for(const [key,label] of Object.entries(photoLabels)){
      const blob=await photoAction('get',key);
      photos.push(`<div class="review-card">${blob?`<img src="${previewURL(blob)}" alt="${escapeHTML(label)}"/>`:'<div class="empty-photo">Missing photo</div>'}<strong>${escapeHTML(label)}</strong><span>${blob?'Captured in this draft':'Not captured'}</span></div>`);
    }
    const details=[];
    for(const [key,label] of [['windscreen','Windscreen'],['wheels','Wheels and tyres'],['roof','Roof'],['odometer','Odometer']]){
      const blob=await photoAction('get',key);
      if(blob) details.push(`<div class="review-card"><img src="${previewURL(blob)}" alt="${label}"/><strong>${label}</strong></div>`);
    }
    const marks=[];
    for(const d of draft.damage){
      const blob=d.photo?await photoAction('get',`damage-${d.id}`):null;
      marks.push(`<div class="mark-review"><div><strong>${escapeHTML(d.area)} · ${escapeHTML(d.kind||'Mark')}</strong><p>${escapeHTML(d.description)}</p></div>${blob?`<img src="${previewURL(blob)}" alt="Existing mark at ${escapeHTML(d.area)}"/>`:''}</div>`);
    }
    const info=[['Registration',draft.vehicle.registration],['Make and model',[draft.vehicle.make,draft.vehicle.model].filter(Boolean).join(' ')],['Year',draft.vehicle.year],['Colour',draft.vehicle.colour],['VIN',draft.vehicle.vin],['Odometer',draft.vehicle.odometerKm?draft.vehicle.odometerKm+' km':''],['Collection date',draft.transport.collectionDate],['Transporter',draft.transport.carrier],['From',draft.transport.origin],['To',draft.transport.destination]];
    let pending=null;
    try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{localStorage.removeItem(pendingKey);}
    const prices=onlineConfig?.prices || [];
    const selectedPrice=prices.find(p=>p.currency===selectedCurrency) || prices[0];
    const selector=!pending && prices.length>1 ? `<label class="field currency-choice"><span>Payment currency</span><select id="payment-currency">${prices.map(p=>`<option value="${escapeHTML(p.currency)}" ${p.currency===selectedCurrency?'selected':''}>${escapeHTML(p.currency.toUpperCase()+' · '+p.label)}</option>`).join('')}</select></label>` : '';
    const online=onlineConfig?.onlineRecords && (pending || prices.length) ? `<div class="online-panel"><strong>${pending?'Your online record':onlineConfig.paymentMode==='test'?'Test an online record':'Save an online record'}</strong>${selector}<p>${pending?'Your payment has started. Open the completion page in this browser to finish or resume the photo upload.':onlineConfig.paymentMode==='test'?'This test checkout stores the photos privately online. Your draft must stay on this device through checkout. No real charge is made with Stripe test cards.':`<strong id="record-price">${escapeHTML(selectedPrice?.label||'')}</strong> one-time payment for one private record with 12 months of online access. After payment, your photos upload from this browser; keep it open until your access link appears. Keep the link private and save it somewhere safe.`}</p>${pending?'<a class="button button-primary" href="/vehicle-transport/complete/">Finish or resume your record ↗</a>':`${onlineConfig.paymentMode==='live'?'<label class="checkout-consent"><input type="checkbox" id="purchase-terms"/> I have read the <a href="/terms/" target="_blank" rel="noopener">purchase terms</a> and <a href="/privacy/" target="_blank" rel="noopener">privacy notice</a>.</label>':''}<label class="field"><span>Your creator email</span><input id="creator-email" type="email" autocomplete="email" maxlength="254" value="${escapeHTML(draft.creatorEmail||'')}" required/><small>Your creator link will be emailed here after saving. This can differ from your Stripe payment email. Check the address carefully and use your own email.</small></label><div id="turnstile-box"></div><button class="button button-primary" type="button" data-action="checkout" disabled>${onlineConfig.paymentMode==='test'?'Continue to test checkout':'Continue to payment'} ↗</button>`}<p class="online-status" role="status"></p></div>` : onlineConfig?.pricingUnavailable ? '<div class="honesty-box">Online checkout is temporarily unavailable. Your local draft is saved; reload this page to try again.</div>' : '';
    body=`<div class="review-head"><strong>${escapeHTML([draft.vehicle.make,draft.vehicle.model].filter(Boolean).join(' ')||'Vehicle')} · ${escapeHTML(draft.vehicle.registration||'No registration')}</strong><p>${escapeHTML(draft.transport.origin||'Origin not entered')} → ${escapeHTML(draft.transport.destination||'Destination not entered')} · ${escapeHTML(draft.transport.collectionDate||'Date not entered')}</p></div><div class="summary-details">${info.filter(([,v])=>v).map(([label,value])=>`<div><span>${label}</span><strong>${escapeHTML(value)}</strong></div>`).join('')}</div><h3 class="review-section-title">Exterior views</h3><div class="review-grid">${photos.join('')}</div>${details.length?`<h3 class="review-section-title">Additional views</h3><div class="review-grid">${details.join('')}</div>`:''}<h3 class="review-section-title">Existing marks · ${draft.damage.length}</h3>${marks.join('')||'<p class="no-marks">No existing marks were noted. This does not assert that the vehicle is damage-free.</p>'}<div class="notice"><strong>This is a local draft.</strong> It has no verified server timestamp, permanent backup or tamper-evident seal. Keep your original photos separately.</div><div class="step-actions"><button type="button" class="button button-light" data-action="back">← Edit marks</button><button type="button" class="button button-dark" data-action="print">Download draft PDF <span aria-hidden="true">↗</span></button></div>${online}<p class="delete-draft"><button class="subtle-button" type="button" data-action="restart">Delete this draft and start again</button></p>`;
  }
  app.innerHTML=`<form class="capture-panel" id="capture-form"><span class="section-index">${index<2?'GETTING READY':index<11?'WALK AROUND':index===11?'CONDITION NOTES':'YOUR LOCAL DRAFT'}</span><h2>${step.title}</h2><p>${step.intro}</p>${body}</form>`;
  if(step.key==='review' && onlineConfig?.onlineRecords && onlineConfig?.prices?.length && !localStorage.getItem(pendingKey)) mountTurnstile();
}
function onlineStatus(message){
  const el=app.querySelector('.online-status');
  if(el) el.textContent=message;
}
async function mountTurnstile(){
  try{
    if(!window.turnstile){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);
      });
    }
    const target=app.querySelector('#turnstile-box');
    if(!target) return;
    turnstileToken='';
    window.turnstile.render(target,{sitekey:onlineConfig.turnstileSiteKey,
      callback:token=>{turnstileToken=token;const button=app.querySelector('[data-action="checkout"]');if(button)button.disabled=false;},
      'expired-callback':()=>{turnstileToken='';const button=app.querySelector('[data-action="checkout"]');if(button)button.disabled=true;}
    });
  }catch{onlineStatus('Verification could not load. Please try again later.');}
}
async function startCheckout(){
  if(onlineConfig?.paymentMode==='live' && !app.querySelector('#purchase-terms')?.checked) return onlineStatus('Read and accept the purchase terms before payment.');
  const emailInput=app.querySelector('#creator-email');
  if(!emailInput?.reportValidity())return;
  draft.creatorEmail=emailInput.value.trim();save();
  if(!turnstileToken) return onlineStatus('Complete the verification first.');
  const button=app.querySelector('[data-action="checkout"]');
  button.disabled=true;onlineStatus('Preparing checkout…');
  try{
    for(const key of steps.slice(2,10).map(x=>x.key)) if(!await photoAction('get',key)) throw Error('A required photo is missing from this device.');
    const response=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({vehicle:draft.vehicle,transport:draft.transport,damage:draft.damage,turnstileToken,currency:selectedCurrency,creatorEmail:draft.creatorEmail})});
    const data=await response.json();
    if(!response.ok) throw Error(data.error||'Checkout unavailable');
    localStorage.setItem(pendingKey,JSON.stringify({id:data.id,token:data.token}));
    location.assign(data.url);
  }catch(e){onlineStatus(e.message);button.disabled=false;if(window.turnstile)window.turnstile.reset();}
}
async function setPhoto(key,file){if(!file)return;if(!file.type.startsWith('image/')){error('Please select an image file.');return;}if(file.size>12*1024*1024){error('Choose a photo smaller than 12 MB for this preview.');return;}try{await photoAction('put',key,file);draft.photos[key]={name:file.name,size:file.size,type:file.type};save();await render();}catch{error('This device could not save the photo. Check available storage.');}}
app.addEventListener('input',event=>{if(event.target.matches('#creator-email')){draft.creatorEmail=event.target.value;save();}});
app.addEventListener('change',async event=>{const input=event.target;if(input.matches('#payment-currency')){const price=onlineConfig?.prices?.find(p=>p.currency===input.value);if(price){selectedCurrency=price.currency;localStorage.setItem('hiw-payment-currency',selectedCurrency);const label=app.querySelector('#record-price');if(label)label.textContent=price.label;}}else if(input.matches('#step-photo'))await setPhoto(steps[draft.step].key,input.files[0]);else if(input.matches('[data-photo-key]'))await setPhoto(input.dataset.photoKey,input.files[0]);});
app.addEventListener('submit',async event=>{event.preventDefault();const form=event.target;if(!form.reportValidity())return;const key=steps[draft.step].key;if(key==='details'){draft.vehicle={...draft.vehicle,...Object.fromEntries(new FormData(form).entries())};}else if(key==='transport'){draft.transport=Object.fromEntries(new FormData(form).entries());}else if(key==='details_photos'){draft.vehicle.odometerKm=new FormData(form).get('odometerKm')||'';}else if(draft.step>=2&&draft.step<=9){if(!draft.photos[key]){error('Add a photo for this view to continue.');return;}}draft.step=Math.min(steps.length-1,draft.step+1);save();await render();window.scrollTo({top:0,behavior:'smooth'});});
app.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(action==='back'){draft.step=Math.max(0,draft.step-1);save();await render();}else if(action==='add-damage'){if(draft.damage.length>=20){error('This preview allows up to 20 marks.');return;}const form=app.querySelector('form'),data=new FormData(form);const area=String(data.get('area')||'').trim(),description=String(data.get('description')||'').trim();if(!area||!description){error('Add the area and a description first.');return;}const id=crypto.randomUUID(),file=data.get('damagePhoto');if(file instanceof File&&file.size){if(!file.type.startsWith('image/')||file.size>12*1024*1024){error('Choose an image smaller than 12 MB.');return;}await photoAction('put',`damage-${id}`,file);}draft.damage.push({id,area,kind:String(data.get('kind')||'').trim(),description,photo:!!(file instanceof File&&file.size)});save();await render();}else if(action==='remove-damage'){const [removed]=draft.damage.splice(Number(button.dataset.index),1);if(removed?.photo)await photoAction('delete',`damage-${removed.id}`);save();await render();}else if(action==='checkout'){await startCheckout();}else if(action==='restart'){if(localStorage.getItem(pendingKey)){onlineStatus('Finish the online record before deleting these local photos.');return;}if(!confirm('Delete this draft and all its photos from this browser?'))return;const tx=db.transaction('photos','readwrite');tx.objectStore('photos').clear();await new Promise(resolve=>tx.oncomplete=resolve);draft=fresh();save();await render();}else if(action==='print'){button.disabled=true;try{const {downloadRecordPDF}=await import('./pdf.js');const blobs={};for(const key of Object.keys(draft.photos)){const blob=await photoAction('get',key);if(blob)blobs[key]=blob;}for(const mark of draft.damage){if(mark.photo){const key='damage-'+mark.id,blob=await photoAction('get',key);if(blob)blobs[key]=blob;}}await downloadRecordPDF({...draft,photos:Object.keys(blobs).map(key=>({key}))},blobs);}catch(e){error(e.message||'PDF download failed. Please retry.');}finally{button.disabled=false;}}window.scrollTo({top:0,behavior:'smooth'});});
try{if(new URLSearchParams(location.search).get('checkout')==='success' && localStorage.getItem(pendingKey)){location.replace('/vehicle-transport/complete/');}else{db=await openDB();try{onlineConfig=await (await fetch('/api/config')).json();const preferred=new URLSearchParams(location.search).get('currency') || localStorage.getItem('hiw-payment-currency') || onlineConfig.defaultCurrency;selectedCurrency=onlineConfig.prices?.some(p=>p.currency===preferred)?preferred:(onlineConfig.prices?.[0]?.currency || 'gbp');}catch{}if(new URLSearchParams(location.search).get('checkout')==='cancelled')localStorage.removeItem(pendingKey);await render();}}catch{app.innerHTML='<div class="honesty-box">This browser cannot save a local draft. Try a regular browser window with device storage enabled.</div>';}
