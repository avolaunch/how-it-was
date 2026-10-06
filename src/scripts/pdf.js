import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const navy=rgb(.07,.13,.21),blue=rgb(.16,.36,.82),ink=rgb(.15,.20,.27),muted=rgb(.40,.46,.53),pale=rgb(.95,.96,.98);
const W=595.28,H=841.89,M=38;
const labels={front:'Front',front_left:'Front left',driver_side:'Driver side',rear_left:'Rear left',rear:'Rear',rear_right:'Rear right',passenger_side:'Passenger side',front_right:'Front right',windscreen:'Windscreen',wheels:'Wheels and tyres',roof:'Roof',odometer:'Odometer'};

export async function createRecordPDF(record,photoBytes,fontBytes) {
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(fontBytes,{subset:true});
  const supported=new Set(font.getCharacterSet());
  const safe=value=>[...String(value??'')].map(c=>supported.has(c.codePointAt(0))?c:'?').join('');
  const m=record.manifest || record;
  const saved=Boolean(m.finalizedAt);
  pdf.setTitle('How It Was - '+(m.vehicle.registration || 'Vehicle record'));
  pdf.setAuthor('How It Was');pdf.setSubject('Vehicle condition record');
  let page,y;
  function text(value,x,top,size=10,color=ink){page.drawText(safe(value),{x,y:H-top-size,size,font,color});}
  function wrap(value,width,size=10) {
    const out=[];
    for(const para of safe(value).split('\n')) {
      let line='';
      for(const word of para.split(/\s+/)) {
        if(!word)continue;
        if(font.widthOfTextAtSize((line?line+' ':'')+word,size)<=width) {line+=(line?' ':'')+word;continue;}
        if(line){out.push(line);line='';}
        for(const c of word){if(font.widthOfTextAtSize(line+c,size)>width){out.push(line);line='';}line+=c;}
      }
      out.push(line);
    }
    return out;
  }
  function newPage(title){
    page=pdf.addPage([W,H]);
    page.drawRectangle({x:0,y:H-86,width:W,height:86,color:navy});
    text('How It Was',M,22,22,rgb(1,1,1));text(title,M,57,10,rgb(.76,.82,.92));
    y=110;
  }
  function ensure(height,title){if(y+height>H-65)newPage(title);}
  function paragraph(value,size=10,color=ink,title='Vehicle condition record'){
    for(const line of wrap(value,W-2*M,size)){ensure(size+6,title);text(line,M,y,size,color);y+=size+5;}y+=8;
  }
  function section(title){ensure(44,title);text(title,M,y,15,blue);y+=28;}
  async function image(bytes,x,top,width,height){
    const img=bytes[0]===137?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
    const scale=Math.min(width/img.width,height/img.height);
    page.drawRectangle({x,y:H-top-height,width,height,color:pale});
    page.drawImage(img,{x:x+(width-img.width*scale)/2,y:H-top-height+(height-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
  }
  newPage(saved?'SAVED VEHICLE CONDITION RECORD':'LOCAL DRAFT / NOT SAVED ONLINE');
  paragraph([m.vehicle.make,m.vehicle.model].filter(Boolean).join(' ')||'Vehicle',24,navy);
  paragraph(m.vehicle.registration||'Registration not entered',18,blue);
  section('Vehicle and handover');
  const fields=[['Registration',m.vehicle.registration],['Make / model',[m.vehicle.make,m.vehicle.model].filter(Boolean).join(' ')],['Year',m.vehicle.year],['Colour',m.vehicle.colour],['VIN',m.vehicle.vin],['Odometer',m.vehicle.odometerKm?m.vehicle.odometerKm+' km':''],['Collection date',m.transport.collectionDate],['Transporter',m.transport.carrier],['From',m.transport.origin],['To',m.transport.destination]].filter(([,v])=>v);
  for(let i=0;i<fields.length;i+=2){
    const pair=fields.slice(i,i+2),width=(W-2*M-22)/2;
    const lines=pair.map(([,value])=>wrap(value,width,11));
    const height=24+Math.max(...lines.map(l=>l.length))*16;
    ensure(height+12,'Vehicle and handover');
    pair.forEach(([label],j)=>{const x=M+j*(width+22);text(label.toUpperCase(),x,y,8,muted);lines[j].forEach((line,k)=>text(line,x,y+18+k*16,11));});
    y+=height+12;
  }
  section(saved?'Record receipt':'About this draft');
  if(saved){
    paragraph('Received by the server: '+new Date(m.finalizedAt).toISOString(),10);
    paragraph('Record ID: '+(record.id||m.recordId||''),9,muted);
    paragraph('Server receipt time shows when this record was saved. It does not independently verify when or where the photos were taken, or who caused any change.',10,muted);
  }else paragraph('This PDF is a local draft. It has no verified server receipt time or permanent online backup. Keep your original photos separately.',10,muted);
  const photos=m.photos||[];
  const views=photos.filter(p=>!p.key.startsWith('damage-'));
  for(let start=0;start<views.length;start+=4){
    newPage('PHOTO RECORD / '+(m.vehicle.registration||'Vehicle'));
    for(let n=0;n<Math.min(4,views.length-start);n++){
      const p=views[start+n],x=M+(n%2)*270,top=112+Math.floor(n/2)*314;
      text(labels[p.key]||p.key,x,top,12,navy);
      if(!photoBytes[p.key])throw Error('A photo is missing from the PDF. Reload and try again.');
      await image(photoBytes[p.key],x,top+26,249,244);
      text('VIEW '+String(start+n+1).padStart(2,'0'),x,top+282,8,muted);
    }
  }
  newPage('EXISTING MARKS / '+(m.vehicle.registration||'Vehicle'));
  section('Existing marks - '+m.damage.length);
  if(!m.damage.length)paragraph('No existing marks were noted. This does not assert that the vehicle is damage-free.');
  for(const [i,d] of m.damage.entries()){
    ensure(96,'Existing marks (continued)');
    paragraph((i+1)+'. '+d.area+' / '+(d.kind||'Mark'),14,navy,'Existing marks (continued)');
    paragraph(d.description,11,ink,'Existing marks (continued)');
    const key='damage-'+d.id;
    if(photoBytes[key]){ensure(266,'Existing mark close-up');await image(photoBytes[key],M,y,W-2*M,240);y+=258;}
    else if(d.photo)throw Error('An existing mark photo is missing from the PDF.');
    y+=12;
  }
  if(saved){
    newPage('RECORD INTEGRITY');
    section('Manifest fingerprint');
    paragraph('SHA-256: '+record.manifestSha256,9,muted);
    paragraph('These fingerprints identify the saved manifest and original image files. The PDF contains resized copies of the photos for practical sharing. A fingerprint is not independent verification of the event.',10,muted);
    section('Original photo fingerprints');
    for(const p of photos){ensure(60,'Photo fingerprints (continued)');paragraph((labels[p.key]||'Existing mark '+(m.damage.find(d=>p.key==='damage-'+d.id)?.area||'')),10,ink,'Photo fingerprints (continued)');paragraph(p.sha256,8,muted,'Photo fingerprints (continued)');}
  }
  for(const [i,p] of pdf.getPages().entries()){
    p.drawLine({start:{x:M,y:43},end:{x:W-M,y:43},thickness:.5,color:rgb(.83,.86,.90)});
    p.drawText('howitwas.co  /  '+(saved?'Saved condition record':'Local draft'),{x:M,y:27,font,size:8,color:muted});
    p.drawText((i+1)+' / '+pdf.getPageCount(),{x:W-M-35,y:27,font,size:8,color:muted});
  }
  return pdf.save();
}

export async function pdfPhoto(blob) {
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
    if(!jpeg)throw Error('Photo conversion failed');return new Uint8Array(await jpeg.arrayBuffer());
  }finally{URL.revokeObjectURL(url);}
}
export async function downloadRecordPDF(record,blobs){
  const font=await fetch('/fonts/DejaVuSans.ttf');if(!font.ok)throw Error('PDF font could not load. Please retry.');
  const photos={};for(const [key,blob] of Object.entries(blobs))photos[key]=await pdfPhoto(blob);
  const bytes=await createRecordPDF(record,photos,await font.arrayBuffer());
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const link=document.createElement('a');link.href=url;link.download='how-it-was-'+String((record.manifest||record).vehicle.registration||'vehicle').replace(/[^a-z0-9_-]/gi,'-')+'.pdf';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
