// ─── CONSTANTS ─────────────────────────────────────
const SHEET_URL    = 'https://script.google.com/macros/s/AKfycbx6HeRpJgjWivNgYt_wbrzeLYK1eK2Z_F9Nt0pNVxirbdvubTFyxiZTg4UJxsaMCgRd/exec';
const SETTINGS_KEY = 'eps_cfg_v5';
const ADMIN_EMAIL  = 'amotwani@eastsideprep.org';

// ─── STATE ─────────────────────────────────────────
let items = [], settings = {};
let currentRole = null, currentEmail = null;
let browseFilter = 'all', dashFilter = 'all';
let claimingId = null, photoData = null;
let itemsLoading = false;

// ─── SETTINGS ──────────────────────────────────────
// NOTE: Access codes/passwords are the only thing still kept in
// localStorage — they're admin-configurable login gates, not
// item data, so they aren't part of the "load from the sheet"
// requirement. Everything about items now lives in the Sheet.
function loadSettings() {
  try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); } catch(e){settings={};}
  settings.pwdStudent    = settings.pwdStudent    || 'EPSeagles';
  settings.pwdFacilities = settings.pwdFacilities || 'EPSfacilities';
  settings.pwdAdmin      = settings.pwdAdmin      || 'EPSadmin2024';
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

function savePwd(role) {
  const key = 'pwd' + role[0].toUpperCase() + role.slice(1);
  const val = document.getElementById(key).value.trim();
  if (!val) { toast('Code cannot be empty','err'); return; }
  settings[key] = val; saveSettings();
  toast('Access code updated','ok');
}

// ─── DATA (Sheet-backed — no localStorage) ──────────
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// Derives a display name from a login email since the login
// screen only collects an email, never a full name.
// "k.johnson@eastsideprep.org" -> "K Johnson"
function nameFromEmail(email) {
  if (!email) return 'Unknown';
  const local = email.split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ') || local;
}

async function fetchItems() {
  itemsLoading = true;
  renderBrowse();
  if (document.getElementById('view-dashboard')?.classList.contains('active')) renderDashboard();
  try {
    const res = await fetch(SHEET_URL + '?action=getItems', { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    items = Array.isArray(data) ? data : [];
    updateSheetPill(true);
  } catch (err) {
    console.warn('[EPS Retriever] Failed to load items from sheet:', err);
    items = [];
    updateSheetPill(false);
    toast('Could not load items from the Sheet. Check your connection or Sheet URL.', 'err');
  } finally {
    itemsLoading = false;
    renderBrowse();
    if (document.getElementById('view-dashboard')?.classList.contains('active')) renderDashboard();
  }
}

// ─── LOGIN ──────────────────────────────────────────
let selectedRole = 'student';

function selectRole(role, el) {
  selectedRole = role;
  document.querySelectorAll('.role-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.login-form').forEach(f=>f.classList.remove('active'));
  document.getElementById('form-'+role).classList.add('active');
  ['student','facilities','admin'].forEach(r=>{
    const e=document.getElementById('err-'+r);
    if(e){e.classList.remove('show');e.textContent='';}
  });
}

function showErr(role, msg) {
  const el = document.getElementById('err-'+role);
  el.textContent = msg; el.classList.add('show');
}

function doLogin(role) {
  document.getElementById('err-'+role).classList.remove('show');
  if (role==='student') {
    const email = document.getElementById('s-email').value.trim().toLowerCase();
    const pass  = document.getElementById('s-pass').value;
    if (!email.endsWith('@eastsideprep.org')) { showErr('student','Must use an @eastsideprep.org email.'); return; }
    if (pass !== settings.pwdStudent) { showErr('student','Incorrect access code.'); return; }
    launchApp('student', email);
  } else if (role==='facilities') {
    const email = document.getElementById('f-email').value.trim().toLowerCase();
    const pass  = document.getElementById('f-pass').value;
    if (!email.endsWith('@eastsideprep.org')) { showErr('facilities','Must use an @eastsideprep.org email.'); return; }
    if (pass !== settings.pwdFacilities) { showErr('facilities','Incorrect access code.'); return; }
    launchApp('facilities', email);
  } else if (role==='admin') {
    const email = document.getElementById('a-email').value.trim().toLowerCase();
    const pass  = document.getElementById('a-pass').value;
    if (email !== ADMIN_EMAIL) { showErr('admin','That email is not authorized for admin access.'); return; }
    if (pass !== settings.pwdAdmin) { showErr('admin','Incorrect admin password.'); return; }
    launchApp('admin', email);
  }
}

function launchApp(role, email) {
  currentRole=role; currentEmail=email;
  sessionStorage.setItem('eps_role',role);
  sessionStorage.setItem('eps_email',email);
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').style.display='block';
  applyRoleUI(); renderBrowse();
  const name = nameFromEmail(email);
  toast('Welcome, '+name+'!','ok');
}

function applyRoleUI() {
  const badge = document.getElementById('roleBadge');
  const labels = {student:'Student',facilities:'Facilities',admin:'Admin'};
  badge.textContent = labels[currentRole]||'';
  badge.className = 'role-badge '+currentRole;
  // Upload tab: facilities + admin only
  document.getElementById('navUpload').style.display =
    (currentRole==='facilities'||currentRole==='admin') ? 'flex' : 'none';
  // Settings gear: admin only
  document.getElementById('settingsBtn').style.display =
    currentRole==='admin' ? 'flex' : 'none';
}

function doLogout() {
  sessionStorage.removeItem('eps_role');
  sessionStorage.removeItem('eps_email');
  currentRole=null; currentEmail=null;
  document.getElementById('appShell').style.display='none';
  document.getElementById('loginScreen').classList.remove('hidden');
  ['s-email','s-pass','f-email','f-pass','a-email','a-pass'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  ['student','facilities','admin'].forEach(r=>{
    const e=document.getElementById('err-'+r);
    if(e){e.classList.remove('show');e.textContent='';}
  });
}

function restoreSession() {
  const role=sessionStorage.getItem('eps_role');
  const email=sessionStorage.getItem('eps_email');
  if(role&&email) launchApp(role,email);
}

// ─── VIEWS ──────────────────────────────────────────
function switchView(name) {
  if(name==='upload' && currentRole==='student') return;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  const btn=document.querySelector(`.nav-btn[data-view="${name}"]`);
  if(btn) btn.classList.add('active');
  // Always pull the latest state from the Sheet when entering
  // Browse or Dashboard, so everyone sees live data.
  if(name==='browse' || name==='dashboard') fetchItems();
}

// ─── BROWSE ─────────────────────────────────────────
function setFilter(f,el) {
  browseFilter=f;
  document.querySelectorAll('#view-browse .chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); renderBrowse();
}

function renderBrowse() {
  const q=(document.getElementById('searchInput')?.value||'').toLowerCase().trim();
  const grid=document.getElementById('itemsGrid');
  if (itemsLoading) {
    document.getElementById('browse-meta').textContent = 'Loading items from the Sheet…';
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><h3>Loading…</h3><p>Pulling the latest items from the Sheet.</p></div>`;
    return;
  }
  let list=items.filter(item=>{
    const mf=browseFilter==='all'||item.status===browseFilter||item.category===browseFilter;
    const mq=!q||[item.name,item.description,item.category,item.locationFound].join(' ').toLowerCase().includes(q);
    return mf&&mq;
  }).sort((a,b)=>{
    if(a.status==='unclaimed'&&b.status!=='unclaimed') return -1;
    if(b.status==='unclaimed'&&a.status!=='unclaimed') return 1;
    return new Date(b.createdAt)-new Date(a.createdAt);
  });
  const uncl=list.filter(i=>i.status==='unclaimed').length;
  document.getElementById('browse-meta').textContent=
    list.length===0?'No items match your filter':`${uncl} unclaimed · ${list.length} item${list.length!==1?'s':''} shown`;
  if(list.length===0){
    grid.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><h3>Nothing here yet</h3><p>Try a different filter or check back later.</p></div>`;
    return;
  }
  grid.innerHTML=list.map(item=>`
    <div class="item-card ${item.status}" onclick="openClaimModal('${item.id}')">
      <div class="card-photo">
        ${item.photo?`<img src="${item.photo}" alt="${esc(item.name)}" loading="lazy">`:`<div class="card-photo-placeholder">${catEmoji(item.category)}</div>`}
        <div class="card-photo-badge"><span class="status-badge badge-${item.status}">${statusText(item.status)}</span></div>
      </div>
      <div class="card-body">
        <div class="card-name">${esc(item.name)}</div>
        <div class="card-desc" style="flex:1">${item.description?esc(item.description):'<em style="opacity:.5">No description</em>'}</div>
        <div class="card-tags" style="margin-top:10px;margin-bottom:10px;">
          <span class="tag tag-cat" style="min-width:0;overflow:hidden;text-overflow:ellipsis;max-width:110px">${catEmoji(item.category)} ${esc(item.category)}</span>
          <span class="tag tag-loc" style="min-width:0;overflow:hidden;text-overflow:ellipsis;max-width:90px">📍 ${esc(item.locationFound)}</span>
          <span class="tag tag-date" style="flex-shrink:0">${fmtDate(item.createdAt)}</span>
        </div>
        <button class="claim-btn" ${item.status!=='unclaimed'?'disabled':''}
          onclick="event.stopPropagation();${item.status==='unclaimed'?`openClaimModal('${item.id}')`:''}"
        >${item.status==='unclaimed'?'Claim This Item →':item.status==='claimed'?'✓ Already Claimed':'✓ Returned to Owner'}</button>
      </div>
    </div>`).join('');
}

// ─── CLAIM MODAL ────────────────────────────────────
function openClaimModal(id) {
  const item=items.find(i=>i.id===id); if(!item) return;
  claimingId=id;
  document.getElementById('claimPhoto').innerHTML=item.photo?`<img src="${item.photo}" alt="${esc(item.name)}">`:catEmoji(item.category);
  document.getElementById('claimTitle').textContent=item.name;
  document.getElementById('claimBadges').innerHTML=`
    <span class="mbadge">${catEmoji(item.category)} ${esc(item.category)}</span>
    <span class="mbadge">📍 ${esc(item.locationFound)}</span>
    <span class="mbadge">🗓 ${fmtDate(item.createdAt)}</span>`;
  document.getElementById('claimDesc').textContent=item.description||'No additional description.';
  ['claimName','claimStudentId','claimContact'].forEach(id=>{document.getElementById(id).value='';});
  const btn=document.getElementById('claimConfirmBtn');
  if(item.status!=='unclaimed'){btn.textContent=item.status==='claimed'?'✓ Already Claimed':'✓ Returned';btn.disabled=true;btn.style.opacity='0.5';}
  else{btn.textContent='Confirm Claim';btn.disabled=false;btn.style.opacity='1';}
  openModal('claimOverlay');
}

function confirmClaim() {
  const name=document.getElementById('claimName').value.trim();
  if(!name){toast('Please enter your name','err');return;}
  const item=items.find(i=>i.id===claimingId); if(!item) return;
  item.status='claimed';
  item.claimedBy=name;
  item.claimedId=document.getElementById('claimStudentId').value.trim();
  item.claimedContact=document.getElementById('claimContact').value.trim();
  item.claimedAt=new Date().toISOString();
  logToSheet('CLAIM',item);
  closeModal('claimOverlay'); renderBrowse();
  toast(`Item claimed by ${name}`,'ok');
}

// ─── UPLOAD ─────────────────────────────────────────
// Single input — we set/remove 'capture' dynamically before triggering

function openCamera() {
  const inp = document.getElementById('photoInput');
  inp.setAttribute('capture', 'environment'); // rear camera
  inp.value = '';
  inp.click();
}

function openGallery() {
  const inp = document.getElementById('photoInput');
  inp.removeAttribute('capture'); // file picker / gallery
  inp.value = '';
  inp.click();
}

function handlePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // Kept intentionally small — the photo is stored as a base64
      // string directly in a Google Sheets cell, which has roughly
      // a 50,000-character limit per cell.
      const MAX = 500;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX/w, MAX/h);
        w = Math.round(w*r); h = Math.round(h*r);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      photoData = cv.toDataURL('image/jpeg', 0.6);
      document.getElementById('previewImg').src = photoData;
      document.getElementById('previewImg').style.display = 'block';
      document.getElementById('photoActions').style.display = 'none';
      document.getElementById('dropZone').style.display = 'none';
      document.getElementById('changePhotoBtn').style.display = 'inline-block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function resetPhoto() {
  photoData = null;
  const inp = document.getElementById('photoInput');
  inp.value = '';
  inp.removeAttribute('capture');
  document.getElementById('previewImg').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('photoActions').style.display = 'grid';
  document.getElementById('dropZone').style.display = 'block';
  document.getElementById('changePhotoBtn').style.display = 'none';
}

// Drag & drop wired to the single input
const dz = document.getElementById('dropZone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    const inp = document.getElementById('photoInput');
    const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files;
    handlePhoto(inp);
  }
});
// Also allow clicking the drop zone to pick a file
dz.addEventListener('click', () => openGallery());

function submitItem() {
  const name  = document.getElementById('itemName').value.trim();
  const cat   = document.getElementById('category').value;
  const loc   = document.getElementById('locationFound').value.trim();
  const staff = document.getElementById('staffName').value.trim();
  if (!name || !cat || !loc || !staff) { toast('Please fill in all required fields', 'err'); return; }
  const item = {
    id: uid(), name, category: cat, locationFound: loc,
    description:  document.getElementById('description').value.trim(),
    staffName:    staff,
    staffEmail:   document.getElementById('staffEmail').value.trim(),
    photo:        photoData,
    status:       'unclaimed',
    createdAt:    new Date().toISOString(),
    claimedBy:'', claimedId:'', claimedContact:'', claimedAt:'',
    returnedAt:'', returnedBy:'', returnedByEmail:''
  };
  items.unshift(item);
  logToSheet('UPLOAD', item);
  ['itemName','locationFound','description','staffName','staffEmail'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('category').value = '';
  resetPhoto();
  toast('Item added to Lost & Found!', 'ok');
  setTimeout(() => switchView('browse'), 600);
}

// ─── DASHBOARD ──────────────────────────────────────
function setDashFilter(f,el) {
  dashFilter=f;
  document.querySelectorAll('#view-dashboard .chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); renderDashboard();
}

function renderDashboard() {
  if (itemsLoading) {
    document.getElementById('statsStrip').innerHTML = '';
    document.getElementById('dashTable').innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--ink-muted)">Loading items from the Sheet…</td></tr>`;
    return;
  }
  const total=items.length;
  const unc=items.filter(i=>i.status==='unclaimed').length;
  const cl=items.filter(i=>i.status==='claimed').length;
  const ret=items.filter(i=>i.status==='returned').length;
  document.getElementById('statsStrip').innerHTML=`
    <div class="stat-card s-total"><div class="stat-n" style="color:var(--navy)">${total}</div><div class="stat-label">Total Items</div></div>
    <div class="stat-card s-unclaimed"><div class="stat-n" style="color:var(--green)">${unc}</div><div class="stat-label">Unclaimed</div></div>
    <div class="stat-card s-claimed"><div class="stat-n" style="color:var(--gold)">${cl}</div><div class="stat-label">Claimed</div></div>
    <div class="stat-card s-returned"><div class="stat-n" style="color:#888">${ret}</div><div class="stat-label">Returned</div></div>`;
  const list=(dashFilter==='all'?[...items]:items.filter(i=>i.status===dashFilter))
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const tbody=document.getElementById('dashTable');
  if(list.length===0){
    tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--ink-muted)">No items to display</td></tr>`;
    return;
  }
  const canDelete   = currentRole==='admin';
  const canReturn   = currentRole==='facilities'||currentRole==='admin';
  tbody.innerHTML=list.map(item=>`
    <tr>
      <td>${item.photo?`<img class="td-thumb" src="${item.photo}" alt="">`:`<div class="td-thumb-ph">${catEmoji(item.category)}</div>`}</td>
      <td class="td-name">${esc(item.name)}</td>
      <td class="hide-m"><span class="tag tag-cat">${esc(item.category)}</span></td>
      <td class="hide-m">${esc(item.locationFound)}</td>
      <td>${fmtDate(item.createdAt)}</td>
      <td><span class="status-badge badge-${item.status}">${statusText(item.status)}</span></td>
      <td class="hide-m">${item.claimedBy?esc(item.claimedBy):'—'}</td>
      <td><div class="act-cell">
        <button class="btn sm" onclick="openDetailModal('${item.id}')">View</button>
        ${canReturn&&item.status==='claimed'?`<button class="btn sm success" onclick="markReturned('${item.id}')">Mark Returned</button>`:''}
        ${canDelete?`<button class="btn sm danger" onclick="deleteItem('${item.id}')">Delete</button>`:''}
      </div></td>
    </tr>`).join('');
}

function markReturned(id) {
  const item=items.find(i=>i.id===id); if(!item) return;
  item.status='returned';
  item.returnedAt=new Date().toISOString();
  // Pull from the logged-in account, not a manual field, so the
  // Sheet always records who actually marked it returned.
  item.returnedBy=nameFromEmail(currentEmail);
  item.returnedByEmail=currentEmail||'';
  logToSheet('RETURNED',item);
  renderDashboard();
  toast('Marked as returned','ok');
}

function deleteItem(id) {
  if(currentRole!=='admin'){toast('Only admins can delete items','err');return;}
  if(!confirm('Permanently delete this item?')) return;
  const item=items.find(i=>i.id===id);
  items=items.filter(i=>i.id!==id);
  if(item) logToSheet('DELETE', item);
  renderDashboard();
  toast('Item deleted','info');
}

function openDetailModal(id) {
  const item=items.find(i=>i.id===id); if(!item) return;
  document.getElementById('detailPhoto').innerHTML=item.photo?`<img src="${item.photo}" alt="${esc(item.name)}">`:catEmoji(item.category);
  document.getElementById('detailTitle').textContent=item.name;
  document.getElementById('detailBadges').innerHTML=`
    <span class="mbadge">${catEmoji(item.category)} ${esc(item.category)}</span>
    <span class="mbadge">📍 ${esc(item.locationFound)}</span>
    <span class="mbadge">🗓 ${fmtDate(item.createdAt)}</span>
    <span class="mbadge" style="background:rgba(255,255,255,0.18)">${statusText(item.status).toUpperCase()}</span>`;
  document.getElementById('detailDesc').textContent=item.description||'No description provided.';
  let claimHtml='';
  if(item.claimedBy) {
    claimHtml=`<div class="msec">Claim Record</div>
      <div class="claim-details">
        <div><strong>Claimed by:</strong> ${esc(item.claimedBy)}</div>
        <div><strong>Student ID:</strong> ${esc(item.claimedId||'—')}</div>
        <div><strong>Contact:</strong> ${esc(item.claimedContact||'—')}</div>
        <div><strong>Claimed at:</strong> ${fmtDateTime(item.claimedAt)}</div>
        ${item.returnedAt?`<div><strong>Returned at:</strong> ${fmtDateTime(item.returnedAt)}</div>`:''}
        ${item.returnedBy?`<div><strong>Returned by:</strong> ${esc(item.returnedBy)} (${esc(item.returnedByEmail||'—')})</div>`:''}
      </div>`;
  }
  document.getElementById('detailClaimSection').innerHTML=claimHtml;
  openModal('detailOverlay');
}

// ─── SHEETS ─────────────────────────────────────────
// Submits via a hidden iframe + POST form — sidesteps CORS entirely
// and (since it's a POST body, not a query string) has no practical
// length limit, which is what lets the base64 photo ride along.

function logToSheet(eventType, item) {

  const data = {
    event:            eventType,
    timestamp:        new Date().toISOString(),
    id:               item.id             || '',
    name:             item.name           || '',
    category:         item.category       || '',
    location:         item.locationFound  || '',
    description:      item.description    || '',
    staffName:        item.staffName      || '',
    staffEmail:       item.staffEmail     || '',
    status:           item.status         || '',
    claimedBy:        item.claimedBy      || '',
    claimedId:        item.claimedId      || '',
    claimedContact:   item.claimedContact || '',
    claimedAt:        item.claimedAt      || '',
    returnedAt:       item.returnedAt     || '',
    returnedBy:       item.returnedBy       || '',
    returnedByEmail:  item.returnedByEmail  || '',
    photo:            item.photo            || ''
  };

  try {
    const iframeName = 'eps_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:0;top:-9999px;left:-9999px;';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = SHEET_URL;
    form.target = iframeName;
    form.style.display = 'none';

    Object.entries(data).forEach(([k, v]) => {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = k; inp.value = String(v);
      form.appendChild(inp);
    });

    document.body.appendChild(form);
    form.submit();

    setTimeout(() => {
      try { document.body.removeChild(form); } catch(e) {}
      try { document.body.removeChild(iframe); } catch(e) {}
    }, 10000);
  } catch(e) {
    console.warn('[EPS Retriever] Sheet log failed:', e);
  }
}



// ─── SETTINGS MODAL ─────────────────────────────────
function openSettings() {
  if(currentRole!=='admin') return;
  document.getElementById('pwdStudent').value=settings.pwdStudent||'';
  document.getElementById('pwdFacilities').value=settings.pwdFacilities||'';
  document.getElementById('pwdAdmin').value=settings.pwdAdmin||'';
  openModal('settingsOverlay');
}
function updateSheetPill(connected) {
  const pill=document.getElementById('sheetPill');
  const txt=document.getElementById('sheetPillText');
  if (connected === false) {
    pill.classList.remove('connected');
    txt.textContent = 'Sheet Error';
    return;
  }
  pill.classList.add('connected');
  txt.textContent='Sheet Connected';
}

// ─── MODALS ─────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.overlay.open').forEach(o=>o.classList.remove('open'));});

// ─── TOAST ──────────────────────────────────────────
function toast(msg,type=''){
  const c=document.getElementById('toasts');
  const t=document.createElement('div');
  t.className=`toast ${type}`;t.innerHTML=msg;
  t.style.animation='toastIn 0.3s cubic-bezier(0.34,1.3,0.64,1) forwards';
  c.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut 0.3s forwards';setTimeout(()=>t.remove(),300);},3200);
}

// ─── HELPERS ────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtDate(iso){if(!iso)return'';return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDateTime(iso){if(!iso)return'—';return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}
function statusText(s){return{unclaimed:'Unclaimed',claimed:'Claimed',returned:'Returned'}[s]||s;}
function catEmoji(c){const m={Electronics:'📱',Clothing:'👕',Accessories:'👜','School Supplies':'📚','Water Bottle':'🍶',Keys:'🔑','Sports Equipment':'⚽',Books:'📖',Instrument:'🎸',Other:'📦'};return m[c]||'📦';}

// ─── INIT ────────────────────────────────────────────
(async function init() {
  loadSettings();
  await fetchItems();
  restoreSession();
})();