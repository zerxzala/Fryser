// app.js

// ---------- Utils ----------
function uuid(){
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(_){}
  return 'id-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> el.style.display = 'none', 2200);
}
function openModal(backdropId, focusEl){
  const bd = document.getElementById(backdropId);
  bd.style.display = 'flex'; bd.setAttribute('aria-hidden','false');
  if(focusEl) setTimeout(()=> focusEl.focus(), 20);
}
function closeModal(backdropId){
  const bd = document.getElementById(backdropId);
  bd.style.display = 'none'; bd.setAttribute('aria-hidden','true');
}

// ---------- Storage (state i localStorage, fotos i IndexedDB) ----------
const STORAGE_KEY = 'freezer-state-v2';
/**
 * state = {
 *   freezers: [{id, name, shelves:[{id,name}], items:[{id,name,quantity,shelfId,notes,photoId?}]}],
 *   selectedFreezerId: string
 * }
 */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ console.warn('loadState', e); return null; }
}
function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){ console.warn('saveState', e); }
}

// Seed 2 frysere (Bosch & Scandomestic) første gang
let state = loadState();
if(!state){
  const f1 = {
    id: uuid(),
    name: 'Bosch GSN58AWDP',
    shelves: [
      { id: uuid(), name: 'Øverste hylde' },
      { id: uuid(), name: 'Midterhylde' },
      { id: uuid(), name: 'Nederste skuffe' },
    ],
    items: []
  };
  const f2 = {
    id: uuid(),
    name: 'Scandomestic SKF 231 W',
    shelves: [
      { id: uuid(), name: 'Hylde A' },
      { id: uuid(), name: 'Hylde B' },
    ],
    items: []
  };
  state = { freezers: [f1, f2], selectedFreezerId: f1.id };
  saveState();
}

// ---------- DOM refs ----------
const freezerSelect = document.getElementById('freezer-select');
const settingsBtn = document.getElementById('settings-btn');
const addShelfBtn = document.getElementById('add-shelf-btn');
const itemListEl = document.getElementById('item-list');
const itemCountEl = document.getElementById('item-count');
const emptyItemsEl = document.getElementById('empty-items');
const shelfListEl = document.getElementById('shelf-list');
const emptyShelvesEl = document.getElementById('empty-shelves');
const fabAdd = document.getElementById('fab-add');
const filterBtn = document.getElementById('filter-btn');

// Item modal refs
const itemForm = document.getElementById('edit-item-form');
const itemIdInput = document.getElementById('item-id');
const itemNameInput = document.getElementById('item-name');
const itemQtyInput = document.getElementById('item-quantity');
const itemShelfSelect = document.getElementById('item-shelf');
const itemNotesInput = document.getElementById('item-notes');
const itemPhotoInput = document.getElementById('item-photo');
const itemPhotoIdInput = document.getElementById('item-photo-id');
const itemPhotoPreview = document.getElementById('item-photo-preview');
const removePhotoBtn = document.getElementById('remove-photo');

// Settings modal refs
const freezerAdmin = document.getElementById('freezer-admin');

// Move items modal (shelf delete)
const moveBackdrop = document.getElementById('move-backdrop');
const moveText = document.getElementById('move-text');
const moveTarget = document.getElementById('move-target');
const moveConfirm = document.getElementById('move-confirm');
const moveShelfIdInput = document.getElementById('move-shelf-id');

// Close modals by attribute
document.body.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close]');
  if(closeBtn){
    closeModal(closeBtn.getAttribute('data-close'));
  }
});

// Click backdrop to close
['item-backdrop','settings-backdrop','move-backdrop'].forEach(id=>{
  const bd = document.getElementById(id);
  bd.addEventListener('mousedown', (e)=>{ if(e.target === bd) closeModal(id); });
});
window.addEventListener('keydown', (e)=> {
  if(e.key === 'Escape'){
    ['item-backdrop','settings-backdrop','move-backdrop'].forEach(id=>{
      const bd = document.getElementById(id);
      if(bd.getAttribute('aria-hidden') === 'false') closeModal(id);
    });
  }
});

// ---------- Selectors ----------
function getCurrentFreezer(){
  return state.freezers.find(f => f.id === state.selectedFreezerId);
}

// ---------- Render ----------
function renderFreezerSelect(){
  freezerSelect.innerHTML = '';
  state.freezers.forEach(f=>{
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.name;
    freezerSelect.appendChild(opt);
  });
  freezerSelect.value = state.selectedFreezerId;
}
function renderShelves(){
  const f = getCurrentFreezer();
  const shelves = f.shelves;
  shelfListEl.innerHTML = '';
  emptyShelvesEl.style.display = shelves.length ? 'none' : '';

  shelves.forEach(s=>{
    const row = document.createElement('div'); row.className = 'shelf-row';

    const left = document.createElement('div');
    left.style.display='flex'; left.style.alignItems='center'; left.style.gap='10px';

    const name = document.createElement('div'); name.className = 'shelf-name'; name.textContent = s.name;
    const count = f.items.filter(i => i.shelfId === s.id).length;
    const counts = document.createElement('div'); counts.className='muted';
    counts.textContent = `${count} vare${count===1?'':'r'}`;

    left.append(name, counts);

    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';

    const renameBtn = document.createElement('button'); renameBtn.className='btn secondary'; renameBtn.textContent='✏️ Omdøb';
    renameBtn.addEventListener('click', ()=> {
      const n = prompt('Nyt navn på hylde:', s.name);
      if(!n || n.trim() === s.name) return;
      s.name = n.trim(); saveState(); renderShelves(); renderItems(); populateShelfSelect(); showToast('Hylde omdøbt.');
    });

    const delBtn = document.createElement('button'); delBtn.className='btn danger'; delBtn.textContent='🗑️ Slet';
    delBtn.addEventListener('click', ()=> deleteShelfFlow(s.id));

    actions.append(renameBtn, delBtn);
    row.append(left, actions);
    shelfListEl.append(row);
  });
}
function renderItems(){
  const f = getCurrentFreezer();
  const items = f.items;
  itemListEl.innerHTML = '';
  itemCountEl.textContent = `${items.length} vare${items.length === 1 ? '' : 'r'}`;
  emptyItemsEl.style.display = items.length ? 'none' : '';

  items.forEach(async (it)=>{
    const li = document.createElement('li'); li.className='item';

    // Thumb
    const thumb = document.createElement('img'); thumb.className='thumb';
    let thumbURL = null;
    if(it.photoId){
      thumbURL = await PhotoStore.getPhotoURL(it.photoId);
    }
    thumb.src = thumbURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="100%" height="100%" fill="%230b1222"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="%2394a3b8">No img</text></svg>';
    li.appendChild(thumb);

    // Middle
    const mid = document.createElement('div');

    const name = document.createElement('div'); name.className='name'; name.textContent = it.name;
    const meta = document.createElement('div'); meta.className='meta';

    const qty = document.createElement('span'); qty.className='tag qty'; qty.textContent = `Mængde: ${it.quantity}`;

    const shelf = getCurrentFreezer().shelves.find(s => s.id === it.shelfId);
    const shelfTag = document.createElement('span'); shelfTag.className='tag shelf';
    shelfTag.textContent = `Hylde: ${shelf ? shelf.name : '—'}`;

    const notes = document.createElement('span'); notes.className='tag';
    notes.textContent = it.notes ? `Noter: ${it.notes}` : 'Ingen noter';

    meta.append(qty, shelfTag, notes);

    // Quick actions: - / +
    const quick = document.createElement('div'); quick.className='quick';
    const minus = document.createElement('div'); minus.className='circle'; minus.textContent = '−';
    const plus = document.createElement('div'); plus.className='circle'; plus.textContent = '+';

    minus.addEventListener('click', ()=>{
      if(it.quantity > 1){ it.quantity -= 1; saveState(); renderItems(); }
      else {
        if(confirm('Mængden bliver 0. Slet varen?')){
          removeItem(it.id);
        }
      }
    });
    plus.addEventListener('click', ()=>{
      it.quantity += 1; saveState(); renderItems();
    });

    quick.append(minus, plus);
    mid.append(name, meta, quick);
    li.appendChild(mid);

    // Right: actions
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.flexDirection='column'; actions.style.gap='6px';

    const editBtn = document.createElement('button'); editBtn.className='btn secondary small'; editBtn.textContent='✏️';
    editBtn.title = 'Redigér';
    editBtn.addEventListener('click', ()=> openItemModal(it.id));

    const photoBtn = document.createElement('button'); photoBtn.className='btn ghost small'; photoBtn.textContent='📷';
    photoBtn.title = 'Tilføj/ændr foto';
    photoBtn.addEventListener('click', ()=> openItemModal(it.id, { focusPhoto: true }));

    const delBtn = document.createElement('button'); delBtn.className='btn danger small'; delBtn.textContent='🗑️';
    delBtn.title = 'Slet';
    delBtn.addEventListener('click', ()=> {
      if(confirm('Slet denne vare?')) removeItem(it.id);
    });

    actions.append(editBtn, photoBtn, delBtn);
    li.appendChild(actions);

    itemListEl.appendChild(li);
  });
}
function populateShelfSelect(){
  const f = getCurrentFreezer();
  itemShelfSelect.innerHTML = '';
  if(!f.shelves.length){
    const opt = document.createElement('option');
    opt.value=''; opt.textContent='Ingen hylder (opret først)';
    itemShelfSelect.appendChild(opt);
    return;
  }
  f.shelves.forEach(s=>{
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    itemShelfSelect.appendChild(opt);
  });
}

// ---------- Freezer Admin ----------
function renderFreezerAdmin(){
  freezerAdmin.innerHTML = '';
  state.freezers.forEach(f=>{
    const row = document.createElement('div');
    row.className = 'shelf-row'; // genbrug stil

    const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='10px';
    const name = document.createElement('div'); name.className = 'shelf-name'; name.textContent = f.name;
    const count = document.createElement('div'); count.className='muted'; count.textContent = `${f.items.length} varer / ${f.shelves.length} hylder`;
    left.append(name, count);

    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px';
    const rename = document.createElement('button'); rename.className='btn secondary'; rename.textContent='✏️ Omdøb';
    rename.addEventListener('click', ()=>{
      const n = prompt('Nyt navn på fryser:', f.name);
      if(!n || n.trim() === f.name) return;
      f.name = n.trim();
      saveState(); renderFreezerSelect(); renderFreezerAdmin(); showToast('Fryser omdøbt.');
    });

    const del = document.createElement('button'); del.className='btn danger'; del.textContent='🗑️ Slet';
    del.addEventListener('click', ()=>{
      if(state.freezers.length === 1){ alert('Du kan ikke slette den sidste fryser.'); return; }
      if(!confirm('Slette denne fryser og alle dens data (varer/fotos)?')) return;
      // Slet fotos tilknyttet varerne
      f.items.forEach(it => { if(it.photoId) PhotoStore.deletePhoto(it.photoId).catch(console.warn); });
      state.freezers = state.freezers.filter(x => x.id !== f.id);
      if(state.selectedFreezerId === f.id){
        state.selectedFreezerId = state.freezers[0].id;
      }
      saveState(); renderFreezerSelect(); renderAll(); renderFreezerAdmin();
      showToast('Fryser slettet.');
    });

    actions.append(rename, del);
    row.append(left, actions);
    freezerAdmin.append(row);
  });
}
document.getElementById('add-freezer-btn')?.addEventListener('click', ()=>{
  const n = prompt('Navn på ny fryser:', 'Ny fryser');
  if(!n) return;
  const f = { id: uuid(), name: n.trim(), shelves: [], items: [] };
  state.freezers.push(f);
  state.selectedFreezerId = f.id;
  saveState();
  renderFreezerSelect(); renderAll(); renderFreezerAdmin();
  showToast('Fryser tilføjet.');
});

// ---------- Item CRUD ----------
function openItemModal(itemId, opts = {}){
  const f = getCurrentFreezer();
  itemForm.reset();
  itemIdInput.value = itemId || '';
  itemPhotoIdInput.value = '';
  itemPhotoPreview.style.display = 'none';
  itemPhotoPreview.querySelector('img').src = '';
  populateShelfSelect();

  if(itemId){
    const it = f.items.find(i => i.id === itemId);
    if(!it){ showToast('Vare ikke fundet'); return; }
    itemNameInput.value = it.name;
    itemQtyInput.value = it.quantity;
    itemNotesInput.value = it.notes || '';
    itemShelfSelect.value = it.shelfId || '';

    if(it.photoId){
      itemPhotoIdInput.value = it.photoId;
      PhotoStore.getPhotoURL(it.photoId).then(url=>{
        if(url){
          itemPhotoPreview.style.display = 'flex';
          itemPhotoPreview.querySelector('img').src = url;
        }
      });
    }
  } else {
    const f2 = getCurrentFreezer();
    if(f2.shelves[0]) itemShelfSelect.value = f2.shelves[0].id;
  }

  openModal('item-backdrop', opts.focusPhoto ? itemPhotoInput : itemNameInput);
}
itemForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const f = getCurrentFreezer();

  const id = itemIdInput.value || uuid();
  const name = itemNameInput.value.trim();
  const quantity = Number(itemQtyInput.value || 0);
  const notes = itemNotesInput.value.trim();
  const shelfId = itemShelfSelect.value;

  if(!name || !shelfId){ showToast('Udfyld navn og vælg hylde.'); return; }

  // Photo handling
  let photoId = itemPhotoIdInput.value || '';
  const file = itemPhotoInput.files && itemPhotoInput.files[0] ? itemPhotoInput.files[0] : null;
  if(file){
    if(!photoId) photoId = uuid();
    await PhotoStore.putPhoto(photoId, file);
  }

  const idx = f.items.findIndex(i => i.id === id);
  const rec = { id, name, quantity, shelfId, notes, photoId: photoId || undefined };

  if(idx >= 0){ f.items[idx] = rec; showToast('Vare opdateret.'); }
  else { f.items.push(rec); showToast('Vare tilføjet.'); }

  saveState(); renderItems(); closeModal('item-backdrop');
});

// fjern foto i modal
removePhotoBtn.addEventListener('click', async ()=>{
  const photoId = itemPhotoIdInput.value;
  if(photoId){
    await PhotoStore.deletePhoto(photoId).catch(console.warn);
    itemPhotoIdInput.value = '';
  }
  itemPhotoInput.value = '';
  itemPhotoPreview.style.display = 'none';
  itemPhotoPreview.querySelector('img').src = '';
  showToast('Foto fjernet.');
});

function removeItem(id){
  const f = getCurrentFreezer();
  const item = f.items.find(i => i.id === id);
  if(item?.photoId) PhotoStore.deletePhoto(item.photoId).catch(console.warn);
  f.items = f.items.filter(i => i.id !== id);
  saveState(); renderItems(); showToast('Vare slettet.');
}

// ---------- Shelves ----------
addShelfBtn.addEventListener('click', ()=>{
  const n = prompt('Navn på ny hylde:', `Hylde ${getCurrentFreezer().shelves.length + 1}`);
  if(!n) return;
  getCurrentFreezer().shelves.push({ id: uuid(), name: n.trim() });
  saveState(); renderShelves(); populateShelfSelect(); showToast('Hylde tilføjet.');
});

function deleteShelfFlow(shelfId){
  const f = getCurrentFreezer();
  const count = f.items.filter(i => i.shelfId === shelfId).length;
  if(!count){
    f.shelves = f.shelves.filter(s => s.id !== shelfId);
    saveState(); renderShelves(); populateShelfSelect(); showToast('Hylde slettet.');
    return;
  }
  const shelf = f.shelves.find(s => s.id === shelfId);
  moveText.textContent = `Hylden “${shelf?.name ?? ''}” indeholder ${count} vare${count===1?'':'r'}. Vælg en ny hylde at flytte dem til:`;
  moveTarget.innerHTML = '';
  f.shelves.filter(s => s.id !== shelfId).forEach(s=>{
    const opt = document.createElement('option'); opt.value=s.id; opt.textContent = s.name;
    moveTarget.appendChild(opt);
  });
  moveShelfIdInput.value = shelfId;
  openModal('move-backdrop');
}
moveConfirm.addEventListener('click', ()=>{
  const targetShelf = moveTarget.value;
  const shelfId = moveShelfIdInput.value;
  const f = getCurrentFreezer();
  f.items.forEach(i => { if(i.shelfId === shelfId) i.shelfId = targetShelf; });
  f.shelves = f.shelves.filter(s => s.id !== shelfId);
  saveState(); renderShelves(); renderItems(); closeModal('move-backdrop'); showToast('Varer flyttet og hylde slettet.');
});

// ---------- Freezer switching ----------
freezerSelect.addEventListener('change', ()=>{
  state.selectedFreezerId = freezerSelect.value;
  saveState(); renderAll(); showToast('Skiftede fryser.');
});

// ---------- Open modals ----------
document.getElementById('settings-btn').addEventListener('click', ()=>{
  renderFreezerAdmin(); openModal('settings-backdrop');
});
document.getElementById('fab-add').addEventListener('click', ()=>{
  openItemModal(null);
});

// ---------- Filter (placeholder) ----------
filterBtn.addEventListener('click', ()=>{
  showToast('Filter kommer snart – vil du filtrere pr. hylde/tekst/dato?');
});

// ---------- Init ----------
function renderAll(){
  renderFreezerSelect();
  renderShelves();
  renderItems();
  populateShelfSelect();
}
renderAll();
