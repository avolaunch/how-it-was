const target=document.querySelector('#saved-record');
const id=new URLSearchParams(location.search).get('id'),token=location.hash.slice(1);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={front:'Front',front_left:'Front-left',driver_side:'Driver side',rear_left:'Rear-left',rear:'Rear',rear_right:'Rear-right',passenger_side:'Passenger side',front_right:'Front-right',windscreen:'Windscreen',wheels:'Wheels and tyres',roof:'Roof',odometer:'Odometer'};
const urls=[];
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
    '<div class="step-actions"><button type="button" class="button button-primary" id="save-pdf">Print or save PDF ↗</button></div>'+
    '<p class="record-link-note">Anyone with the complete private link can access this record. Keep it somewhere safe. The link is not recoverable by email in this test version.</p>';
  const grid=document.querySelector('#saved-photos');
  const marks=[...document.querySelectorAll('.mark-review')];
  for(const photo of m.photos){
    const r=await fetch(root+'/photos/'+encodeURIComponent(photo.key),{headers});
    if(!r.ok)throw Error('A saved photo could not be loaded');
    const url=URL.createObjectURL(await r.blob());urls.push(url);
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
  document.querySelector('#save-pdf').addEventListener('click',()=>window.print());
}
load().catch(e=>{target.innerHTML='<div class="notice">'+escapeHTML(e.message)+'</div>';});
window.addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
