const DB_NAME = 'nex_library_safe';
const DB_VERSION = 1;
let db;

const $ = (id) => document.getElementById(id);
const countEl = $('count');
const listEl = $('list');
const fileInput = $('fileInput');
const dropZone = $('dropZone');
const removedModal = $('removedModal');
const removedList = $('removedList');

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if(!database.objectStoreNames.contains('passports')) database.createObjectStore('passports',{keyPath:'id'});
      if(!database.objectStoreNames.contains('removed')) database.createObjectStore('removed',{keyPath:'id'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function all(store){return new Promise((resolve,reject)=>{const r=tx(store).getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.addedAt-a.addedAt));r.onerror=()=>reject(r.error)})}
function put(store,obj){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').put(obj);r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}
function del(store,id){return new Promise((resolve,reject)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}
function get(store,id){return new Promise((resolve,reject)=>{const r=tx(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function uid(){return Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function formatSize(bytes){if(bytes<1024)return bytes+' байт'; if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' КБ'; return (bytes/1024/1024).toFixed(1)+' МБ'}
function dateStr(n){return new Date(n).toLocaleString('ru-RU')}

async function addFiles(files){
  for(const file of files){
    await put('passports',{id:uid(),name:file.name,size:file.size,type:file.type||'application/octet-stream',addedAt:Date.now(),blob:file});
  }
  render();
}
function downloadBlob(item){
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url; a.download = item.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function openItem(id,store='passports'){
  const item = await get(store,id); if(!item) return;
  const url = URL.createObjectURL(item.blob);
  window.open(url,'_blank');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function downloadItem(id,store='passports'){const item=await get(store,id); if(item) downloadBlob(item)}
async function removeItem(id){
  const item = await get('passports',id); if(!item) return;
  await put('removed',{...item,removedAt:Date.now()});
  await del('passports',id);
  render();
}
async function restoreItem(id){
  const item = await get('removed',id); if(!item) return;
  await put('passports',{...item,addedAt:Date.now()});
  await del('removed',id);
  renderRemoved(); render();
}
async function deleteRemoved(id){await del('removed',id); renderRemoved()}
async function exportAll(){
  const items = await all('passports');
  if(!items.length){alert('Сейф пуст.');return}
  for(const item of items) downloadBlob(item);
}

async function render(){
  const items = await all('passports');
  countEl.textContent = items.length;
  if(!items.length){listEl.innerHTML='<div class="empty">Сейф пуст. Нажмите «Положить паспорта в сейф» или перетащите файлы сюда.</div>';return}
  listEl.innerHTML = items.map((it,i)=>`<div class="item"><div><div class="name">${i+1}. ${esc(it.name)}</div><div class="meta">${formatSize(it.size)} · добавлен: ${dateStr(it.addedAt)}</div></div><div class="item-actions"><button class="smallBtn" onclick="openItem('${it.id}')">Открыть</button><button class="smallBtn" onclick="downloadItem('${it.id}')">Скачать</button><button class="smallBtn danger" onclick="removeItem('${it.id}')">Вынуть</button></div></div>`).join('');
}
async function renderRemoved(){
  const items = await all('removed');
  if(!items.length){removedList.innerHTML='<div class="empty">Здесь пока пусто.</div>';return}
  removedList.innerHTML = items.map((it,i)=>`<div class="item"><div><div class="name">${i+1}. ${esc(it.name)}</div><div class="meta">${formatSize(it.size)} · вынут: ${dateStr(it.removedAt||it.addedAt)}</div></div><div class="item-actions"><button class="smallBtn" onclick="openItem('${it.id}','removed')">Открыть</button><button class="smallBtn" onclick="downloadItem('${it.id}','removed')">Скачать</button><button class="smallBtn" onclick="restoreItem('${it.id}')">Вернуть</button><button class="smallBtn danger" onclick="deleteRemoved('${it.id}')">Удалить запись</button></div></div>`).join('');
}

fileInput.addEventListener('change',()=>addFiles(fileInput.files));
$('refreshBtn').addEventListener('click',render);
$('exportBtn').addEventListener('click',exportAll);
$('removedBtn').addEventListener('click',async()=>{await renderRemoved(); removedModal.classList.add('show'); removedModal.setAttribute('aria-hidden','false')});
$('closeRemoved').addEventListener('click',()=>{removedModal.classList.remove('show'); removedModal.setAttribute('aria-hidden','true')});
removedModal.addEventListener('click',(e)=>{if(e.target===removedModal)$('closeRemoved').click()});
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('drag')}));
dropZone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));

openDB().then(database=>{db=database;render()}).catch(err=>alert('Браузер не открыл хранилище сейфа: '+err.message));
window.openItem=openItem; window.downloadItem=downloadItem; window.removeItem=removeItem; window.restoreItem=restoreItem; window.deleteRemoved=deleteRemoved;
