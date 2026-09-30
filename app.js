const ENDPOINT="https://transcritor-aulas.lucas-luk-lima.workers.dev/";
const CHUNK=120, MIN_CHUNK=3, $=x=>document.getElementById(x);

let file=null,mediaName="transcricao",ff=null,cancelled=false,finalVtt="",activeAbort=null;
let sourceMode="file";

function refreshSource(){
 sourceMode=document.querySelector('input[name=source]:checked').value;
 $("urlBox").hidden=sourceMode!=="url";
 $("drop").style.display=sourceMode==="file"?"grid":"none";
 $("go").disabled=sourceMode==="url"?!$("mediaUrl").value.trim():!file;
}
document.querySelectorAll('input[name=source]').forEach(x=>x.onchange=refreshSource);
$("mediaUrl").addEventListener("input",refreshSource);

function setTheme(t){
 document.documentElement.dataset.theme=t;
 localStorage.setItem("transcritor-theme",t);
}
$("theme").onclick=()=>setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");

document.querySelectorAll('input[name=mode]').forEach(x=>x.onchange=()=>{
 $("times").hidden=document.querySelector('input[name=mode]:checked').value!=="part";
});

function sz(n){
 const u=["B","KB","MB","GB"];let i=0;
 while(n>=1024&&i<3){n/=1024;i++}
 return `${n.toFixed(i?1:0)} ${u[i]}`;
}

function pick(f){
 file=f;
 if(f)mediaName=f.name;
 $("go").disabled=!f;
 if(f){
  $("name").textContent=f.name;
  $("hint").textContent="Arquivo pronto";
  $("info").textContent=`${sz(f.size)} • ${f.type||"mídia"}`;
 }
 $("errorBox").hidden=true;
}
$("file").onchange=e=>pick(e.target.files[0]);

["dragenter","dragover"].forEach(n=>$("drop").addEventListener(n,e=>{
 e.preventDefault();e.stopPropagation();$("drop").classList.add("drag");
}));
["dragleave","dragend"].forEach(n=>$("drop").addEventListener(n,e=>{
 e.preventDefault();e.stopPropagation();$("drop").classList.remove("drag");
}));
$("drop").ondrop=e=>{
 e.preventDefault();e.stopPropagation();$("drop").classList.remove("drag");
 if(e.dataTransfer.files[0])pick(e.dataTransfer.files[0]);
};
window.ondragover=e=>e.preventDefault();
window.ondrop=e=>e.preventDefault();

function normalizeTimeDigits(value){
 const d=String(value||"").replace(/\D/g,"").slice(0,6);
 if(!d)return "";
 if(d.length<=2)return d;
 if(d.length<=4)return `${d.slice(0,2)}:${d.slice(2)}`;
 return `${d.slice(0,2)}:${d.slice(2,4)}:${d.slice(4,6)}`;
}

function completeTime(value){
 const d=String(value||"").replace(/\D/g,"").slice(0,6).padEnd(6,"0");
 return `${d.slice(0,2)}:${d.slice(2,4)}:${d.slice(4,6)}`;
}

["start","end"].forEach(id=>{
 const el=$(id);
 el.addEventListener("input",()=>{
  const pos=el.selectionStart;
  el.value=normalizeTimeDigits(el.value);
  try{el.setSelectionRange(el.value.length,el.value.length)}catch{}
 });
 el.addEventListener("paste",e=>{
  e.preventDefault();
  const text=(e.clipboardData||window.clipboardData).getData("text");
  el.value=normalizeTimeDigits(text);
 });
 el.addEventListener("blur",()=>{
  if(el.value.trim())el.value=completeTime(el.value);
 });
});

function sec(s){
 const m=String(s||"").trim().match(/^(\d{2}):(\d{2}):(\d{2})$/);
 if(!m)return NaN;
 const h=Number(m[1]),min=Number(m[2]),seg=Number(m[3]);
 if(min>59||seg>59)return NaN;
 return h*3600+min*60+seg;
}
function clock(s){
 s=Math.max(0,Math.round(s));
 const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;
 return h
  ?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`
  :`${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`;
}
function vclock(s){
 const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${x.toFixed(3).padStart(6,"0")}`;
}
function prog(p,s,d=""){
 $("progressBox").hidden=false;
 $("fill").style.width=Math.max(0,Math.min(100,p))+"%";
 $("pct").textContent=Math.round(Math.max(0,Math.min(100,p)))+"%";
 $("status").textContent=s;
 $("detail").textContent=d;
}

async function engine(){
 if(ff)return ff;
 if(!window.crossOriginIsolated||typeof SharedArrayBuffer==="undefined"){
  throw Error("O Netlify não ativou o isolamento necessário ao FFmpeg. Confirme que o arquivo _headers foi publicado e reabra o site.");
 }
 if(!window.FFmpeg)throw Error("Não foi possível carregar o FFmpeg.");
 ff=FFmpeg.createFFmpeg({
  log:false,
  corePath:"https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js"
 });
 prog(2,"Carregando processador de mídia…","Inicializando o FFmpeg no navegador.");
 await ff.load();
 if(cancelled){
  try{ff.exit()}catch{}
  ff=null;
  throw new DOMException("Cancelado","AbortError");
 }
 return ff;
}

function mediaDuration(blob){
 return new Promise((resolve,reject)=>{
  const el=document.createElement(blob.type?.startsWith("audio/")?"audio":"video");
  const url=URL.createObjectURL(blob);
  let done=false;
  const finish=(ok,val)=>{
   if(done)return;done=true;
   clearTimeout(timer);
   try{el.removeAttribute("src");el.load()}catch{}
   URL.revokeObjectURL(url);
   ok?resolve(val):reject(val);
  };
  const timer=setTimeout(()=>finish(false,new Error("Tempo esgotado ao ler a duração da mídia.")),10000);
  el.preload="metadata";
  el.onloadedmetadata=()=>{
   const d=Number(el.duration);
   if(Number.isFinite(d)&&d>0)finish(true,d);
   else finish(false,new Error("O navegador não informou a duração da mídia."));
  };
  el.onerror=()=>finish(false,new Error("O navegador não conseguiu ler os metadados da mídia."));
  el.src=url;
 });
}

async function probeDuration(f,input){
 let found=null;
 const rx=/Duration:\s*(\d+):(\d+):([\d.]+)/;
 f.setLogger(({message})=>{
  const m=String(message||"").match(rx);
  if(m)found=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);
 });
 try{
  await f.run("-i",input,"-t","0.001","-f","null","probe.null");
 }catch{}
 finally{
  try{f.setLogger(()=>{})}catch{}
  try{f.FS("unlink","probe.null")}catch{}
 }
 return Number.isFinite(found)&&found>0?found:null;
}

function validWav(bytes){
 return bytes?.length>=44 &&
  bytes[0]===0x52&&bytes[1]===0x49&&bytes[2]===0x46&&bytes[3]===0x46 &&
  bytes[8]===0x57&&bytes[9]===0x41&&bytes[10]===0x56&&bytes[11]===0x45;
}

function wavSilenceStats(bytes){
 try{
  if(!validWav(bytes))return null;
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let p=12,dataStart=-1,dataSize=0,fmt=null;
  while(p+8<=bytes.length){
   const id=String.fromCharCode(bytes[p],bytes[p+1],bytes[p+2],bytes[p+3]);
   const size=dv.getUint32(p+4,true);
   const start=p+8;
   if(start>bytes.length)break;
   if(id==="fmt " && size>=16 && start+16<=bytes.length){
    fmt={
     format:dv.getUint16(start,true),
     channels:dv.getUint16(start+2,true),
     rate:dv.getUint32(start+4,true),
     bits:dv.getUint16(start+14,true)
    };
   }else if(id==="data"){
    dataStart=start;
    dataSize=Math.min(size,Math.max(0,bytes.length-start));
    break;
   }
   p=start+size+(size&1);
  }
  if(!fmt||fmt.format!==1||fmt.bits!==16||dataStart<0||dataSize<2)return null;

  const samples=Math.floor(dataSize/2);
  const step=Math.max(1,Math.floor(samples/120000));
  let sum=0,peak=0,n=0;
  for(let i=0;i<samples;i+=step){
   const v=Math.abs(dv.getInt16(dataStart+i*2,true))/32768;
   if(v>peak)peak=v;
   sum+=v*v;n++;
  }
  const rms=n?Math.sqrt(sum/n):0;
  return {rms,peak,silent:rms<0.0015 && peak<0.012};
 }catch{
  return null;
 }
}

function makeErr(msg,kind=""){
 const e=new Error(msg);
 e.kind=kind;
 return e;
}

async function extractWav(f,input,start,duration,tag){
 if(cancelled)throw new DOMException("Cancelado","AbortError");
 const out=`work_${tag}.wav`;
 try{f.FS("unlink",out)}catch{}

 try{
  await f.run(
   "-ss",String(Math.max(0,start)),
   "-fflags","+discardcorrupt",
   "-err_detect","ignore_err",
   "-i",input,
   "-t",String(Math.max(.1,duration)),
   "-vn",
   "-ac","1",
   "-ar","16000",
   "-c:a","pcm_s16le",
   "-f","wav",
   out
  );
 }catch(e){
  try{f.FS("unlink",out)}catch{}
  throw makeErr(`O FFmpeg não conseguiu extrair o áudio em ${clock(start)}.`,"local_audio");
 }

 let raw;
 try{raw=f.FS("readFile",out)}catch{
  throw makeErr(`O FFmpeg não gerou áudio em ${clock(start)}.`,"local_audio");
 }finally{
  try{f.FS("unlink",out)}catch{}
 }
 const copy=new Uint8Array(raw.length);
 copy.set(raw);

 if(!validWav(copy)||copy.byteLength<1000){
  throw makeErr(`O WAV gerado em ${clock(start)} ficou vazio ou inválido.`,"local_audio");
 }
 return copy;
}

async function post(bytes){
 let last="",lastKind="";
 const waits=[0,1200,2800,5500];

 for(let attempt=1;attempt<=waits.length;attempt++){
  if(cancelled)throw new DOMException("Cancelado","AbortError");

  if(waits[attempt-1]){
   prog(
    Number($("pct").textContent.replace("%",""))||0,
    "Tentando novamente…",
    `Tentativa ${attempt} de ${waits.length} para o mesmo trecho.`
   );
   await new Promise(res=>setTimeout(res,waits[attempt-1]));
   if(cancelled)throw new DOMException("Cancelado","AbortError");
  }

  let r,raw,d;
  try{
   r=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"audio/wav","Accept":"application/json"},
    body:bytes,
    signal:activeAbort?.signal,
    cache:"no-store"
   });
  }catch(e){
   if(cancelled || e?.name==="AbortError"){
    throw new DOMException("Cancelado","AbortError");
   }
   last="Falha de rede ao enviar o áudio para o Worker.";
   lastKind="network";
   if(attempt<waits.length)continue;
   throw makeErr(last,lastKind);
  }

  raw=await r.text();
  try{d=JSON.parse(raw)}catch{}

  if(r.ok&&d?.ok)return d;

  last=d?.erro||raw||`HTTP ${r.status}`;
  lastKind=d?.tipo||(
    /3030|decode audio|valid audio format/i.test(last) ? "decode_audio" :
    (r.status===408 || r.status===429 || r.status>=500 ? "transient" : "")
  );

  const retryable=
   lastKind==="transient" ||
   /timeout|tempor|capacity|try again|out of capacity|aborted/i.test(last);

  if(retryable && attempt<waits.length)continue;
  throw makeErr(last,lastKind);
 }

 throw makeErr(last||"Falha ao transcrever o bloco.",lastKind);
}

function segmentsOf(d,offset){
 const a=Array.isArray(d.segmentos)?d.segmentos:(Array.isArray(d.segments)?d.segments:[]);
 return a.map(s=>({
  start:offset+Number(s.start||0),
  end:offset+Number(s.end??s.start??0),
  text:String(s.text||"").trim()
 })).filter(s=>s.text);
}

$("cancel").onclick=()=>{
 if(cancelled)return;
 cancelled=true;
 $("cancel").disabled=true;
 $("status").textContent="Cancelando…";
 $("detail").textContent="Interrompendo rede e processador de mídia.";

 try{activeAbort?.abort()}catch{}
 activeAbort=null;

 if(ff){
  try{ff.exit()}catch{}
  ff=null;
 }
};

$("go").onclick=async()=>{
 sourceMode=document.querySelector('input[name=source]:checked').value;
 if(sourceMode==="file"&&!file)return;

 cancelled=false;
 finalVtt="";
 const runAbort=new AbortController();
 activeAbort=runAbort;
 let input=null;
 let completedMain=0;
 let totalMain=1;
 $("go").disabled=true;
 $("cancel").hidden=false;
 $("cancel").disabled=false;
 $("result").hidden=true;
 $("errorBox").hidden=true;
 $("text").value="";

 const lines=[],vtts=["WEBVTT\n"];
 let cue=1;

 function publish(){
  $("text").value=lines.join("\n");
  finalVtt=vtts.join("\n");
  $("result").hidden=false;
 }

 function appendResult(d,offset){
  const segs=segmentsOf(d,offset);
  if(segs.length){
   for(const s of segs){
    lines.push(`${clock(s.start)} ${s.text}`);
    vtts.push(`${cue++}\n${vclock(s.start)} --> ${vclock(Math.max(s.end,s.start+.1))}\n${s.text}\n`);
   }
  }else if(String(d.texto||"").trim()){
   lines.push(`${clock(offset)} ${String(d.texto).trim()}`);
  }
  publish();
 }

 try{
  if(sourceMode==="url"){
   const url=$("mediaUrl").value.trim();
   if(!/^https?:\/\//i.test(url))throw Error("Cole um link direto válido começando com http:// ou https://.");
   prog(1,"Baixando mídia pelo link…","O Worker está buscando o vídeo para contornar o bloqueio CORS.");

   let resp;
   try{
    resp=await fetch(`${ENDPOINT}proxy?url=${encodeURIComponent(url)}`,{signal:runAbort.signal});
   }catch(e){
    if(cancelled || e?.name==="AbortError")throw new DOMException("Cancelado","AbortError");
    throw Error("Não foi possível acessar o proxy do Worker.");
   }
   if(!resp.ok){
    let detail="";try{detail=await resp.text()}catch{}
    throw Error(detail||`Não foi possível baixar o vídeo pelo link (HTTP ${resp.status}).`);
   }

   const blob=await resp.blob();
   const ct=resp.headers.get("content-type")||blob.type||"video/mp4";
   const path=new URL(url).pathname;
   const rawName=decodeURIComponent(path.split("/").pop()||"video.mp4");
   file=new File([blob],rawName,{type:ct});
   mediaName=rawName;
   $("name").textContent=rawName;
   $("info").textContent=`${sz(file.size)} • ${ct}`;
  }

  const mode=document.querySelector('input[name=mode]:checked').value;
  let from=0,to=null,duration=null;

  if(mode==="part"){
   from=sec($("start").value);
   to=sec($("end").value);
   if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from){
    throw Error("Intervalo inválido. Use exatamente HH:MM:SS (ex.: 01:07:50), com minutos e segundos entre 00 e 59, e deixe o fim maior que o início.");
   }
  }else{
   prog(2,"Lendo duração da aula…","Obtendo os metadados do arquivo.");
   try{duration=await mediaDuration(file)}catch{}
  }

  const f=await engine();
  prog(4,"Lendo arquivo…",file.name);
  input="input"+(file.name.match(/\.[^.]+$/)?.[0]||".bin");

  let mediaBytes=new Uint8Array(await file.arrayBuffer());
  if(cancelled)throw new DOMException("Cancelado","AbortError");
  f.FS("writeFile",input,mediaBytes);
  mediaBytes=null;
  if(cancelled)throw new DOMException("Cancelado","AbortError");

  if(sourceMode==="url")file=null;

  if(mode==="all"){
   if(!Number.isFinite(duration)||duration<=0){
    prog(5,"Lendo duração da aula…","Usando o FFmpeg para identificar a duração.");
    duration=await probeDuration(f,input);
   }
   if(!Number.isFinite(duration)||duration<=0){
    throw Error("Não foi possível identificar a duração da aula.");
   }
   to=duration;
  }

  if(to<=from)throw Error("O intervalo selecionado está fora da duração da mídia.");

  totalMain=Math.max(1,Math.ceil((to-from)/CHUNK));
  prog(7,"Preparando transcrição…",`${totalMain} bloco(s) principal(is) de até 2 minutos.`);

  let recoverySerial=0;

  async function processInterval(start,dur,depth=0){
   if(cancelled)throw new DOMException("Cancelado","AbortError");

   const tag=`${Date.now()}_${recoverySerial++}`;
   let bytes;
   try{
    bytes=await extractWav(f,input,start,dur,tag);
    const d=await post(bytes);
    appendResult(d,start);
    return;
   }catch(err){
    if(cancelled || err?.name==="AbortError"){
     throw new DOMException("Cancelado","AbortError");
    }
    const recoverable=
     err?.kind==="decode_audio"||
     err?.kind==="local_audio"||
     err?.kind==="network"||
     err?.kind==="transient"||
     /3030|decode audio|valid audio format|wav.*inválido|áudio.*inválido|falha de rede|timeout|tempor|capacity/i.test(err?.message||"");

    if(recoverable && dur<=MIN_CHUNK+.25 && bytes){
     const st=wavSilenceStats(bytes);
     if(st?.silent){
      const pct=10+(completedMain/totalMain)*88;
      prog(
       pct,
       "Trecho silencioso ignorado.",
       `${clock(start)}–${clock(start+dur)} não contém fala detectável.`
      );
      return;
     }
    }

    if(recoverable && dur>MIN_CHUNK+.25){
     const left=Math.floor((dur/2)*1000)/1000;
     const right=dur-left;
     const pct=10+(completedMain/totalMain)*88;
     prog(
      pct,
      "Recuperando trecho automaticamente…",
      `${clock(start)}–${clock(start+dur)} falhou; tentando partes menores.`
     );
     await processInterval(start,left,depth+1);
     if(right>.25)await processInterval(start+left,right,depth+1);
     return;
    }
    throw err;
   }finally{
    bytes=null;
   }
  }

  for(let i=0;i<totalMain;i++){
   if(cancelled)throw new DOMException("Cancelado","AbortError");
   const start=from+i*CHUNK;
   const dur=Math.min(CHUNK,to-start);
   if(dur<=.05)break;

   const pct=10+(i/totalMain)*88;
   prog(
    pct,
    `Transcrevendo parte ${i+1} de ${totalMain}…`,
    `${clock(start)} até ${clock(start+dur)}`
   );

   try{
    await processInterval(start,dur);
   }catch(err){
    publish();
    throw Error(`Falha no trecho ${clock(start)}–${clock(start+dur)}: ${err?.message||String(err)}`);
   }

   completedMain=i+1;
   prog(
    10+(completedMain/totalMain)*88,
    `Parte ${completedMain} de ${totalMain} concluída.`,
    `Último trecho: ${clock(start)}–${clock(start+dur)}`
   );
  }

  publish();
  prog(100,"Concluído.",`${completedMain} parte(s) principal(is) processada(s).`);

 }catch(e){
  if(e?.name==="AbortError" || cancelled){
   $("errorBox").hidden=true;
   $("status").textContent="Cancelado.";
   $("detail").textContent="Você pode iniciar outra transcrição sem recarregar a página.";
  }else{
   $("error").textContent=e.message||String(e);
   $("errorBox").hidden=false;
  }
 }finally{
  if(ff){
   if(input){try{ff.FS("unlink",input)}catch{}}
   try{
    for(const n of ff.FS("readdir","/")){
     if(/^work_.*\.wav$/.test(n)){try{ff.FS("unlink",n)}catch{}}
    }
   }catch{}
  }
  if(activeAbort===runAbort)activeAbort=null;
  $("cancel").hidden=true;
  $("cancel").disabled=false;
  refreshSource();
 }
};

$("copy").onclick=async()=>{
 await navigator.clipboard.writeText($("text").value);
 $("copy").textContent="Copiado";
 setTimeout(()=>$("copy").textContent="Copiar",900);
};

function dl(data,ext,type){
 const u=URL.createObjectURL(new Blob([data],{type}));
 const a=document.createElement("a");
 a.href=u;
 a.download=(mediaName||"transcricao").replace(/\.[^.]+$/,"")+"."+ext;
 a.click();
 setTimeout(()=>URL.revokeObjectURL(u),1000);
}
$("txt").onclick=()=>dl($("text").value,"txt","text/plain;charset=utf-8");
$("vtt").onclick=()=>dl(finalVtt,"vtt","text/vtt;charset=utf-8");
