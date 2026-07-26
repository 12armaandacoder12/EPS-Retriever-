
// ─── APPS SCRIPT ───────────────────────────────────
const SCRIPT = `// EPS Retriever — Google Apps Script
// ─────────────────────────────────────────────────────
// HOW TO DEPLOY:
//   1. Extensions → Apps Script → paste this → Save (💾)
//   2. Deploy → New Deployment
//   3. Type: Web App
//   4. Execute as: Me
//   5. Who has access: Anyone
//   6. Click Deploy → Authorize → Allow
//   7. Copy the Web App URL into EPS Retriever Settings ⚙️
//
// ⚠️  Already deployed? When you re-paste and save:
//   Deploy → Manage Deployments → pencil → New Version → Deploy
//   (The URL stays the same — no need to re-paste it in the app)
// ─────────────────────────────────────────────────────

function doGet(e) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Log") || ss.insertSheet("Log");

    // Styled header row on first run
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Event","Timestamp","Item ID","Item Name","Category",
        "Location Found","Description","Staff Name","Staff Email",
        "Status","Claimed By","Student ID","Contact","Claimed At","Returned At"
      ]);
      sheet.getRange(1,1,1,15)
           .setFontWeight("bold")
           .setBackground("#1C3461")
           .setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }

    // Read URL query parameters (sent by the app as a GET form)
    var p = e.parameter;
    if (!p || !p.event) {
      return ContentService
        .createTextOutput("ok - no event")
        .setMimeType(ContentService.MimeType.TEXT);
    }

    sheet.appendRow([
      p.event          || "",
      p.timestamp      || new Date().toISOString(),
      p.id             || "",
      p.name           || "",
      p.category       || "",
      p.location       || "",
      p.description    || "",
      p.staffName      || "",
      p.staffEmail     || "",
      p.status         || "",
      p.claimedBy      || "",
      p.claimedId      || "",
      p.claimedContact || "",
      p.claimedAt      || "",
      p.returnedAt     || ""
    ]);

    return ContentService
      .createTextOutput("ok")
      .setMimeType(ContentService.MimeType.TEXT);

  } catch(err) {
    return ContentService
      .createTextOutput("error: " + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}`;

document.getElementById('scriptBlock').textContent = SCRIPT;
function copyScript() {
  navigator.clipboard.writeText(SCRIPT)
    .then(()=>toast('Script copied!','ok'))
    .catch(()=>toast('Select and copy the code manually','err'));
}

// ─── CONSTANTS ─────────────────────────────────────
const STORE_KEY    = 'eps_items_v5';
const SETTINGS_KEY = 'eps_cfg_v5';
const ADMIN_EMAIL  = 'amotwani@eastsideprep.org';

// ─── STATE ─────────────────────────────────────────
let items = [], settings = {};
let currentRole = null, currentEmail = null;
let browseFilter = 'all', dashFilter = 'all';
let claimingId = null, photoData = null;

// ─── SETTINGS ──────────────────────────────────────
function loadSettings() {
  try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); } catch(e){settings={};}
  settings.pwdStudent    = settings.pwdStudent    || 'EPSeagles';
  settings.pwdFacilities = settings.pwdFacilities || 'EPSfacilities';
  settings.pwdAdmin      = settings.pwdAdmin      || 'EPSadmin2024';
  settings.sheetUrl      = settings.sheetUrl      || '';
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

function savePwd(role) {
  const key = 'pwd' + role[0].toUpperCase() + role.slice(1);
  const val = document.getElementById(key).value.trim();
  if (!val) { toast('Code cannot be empty','err'); return; }
  settings[key] = val; saveSettings();
  toast('Access code updated','ok');
}
function saveSheetSettings() {
  settings.sheetUrl = document.getElementById('sheetUrlInput').value.trim();
  saveSettings(); updateSheetPill();
  closeModal('settingsOverlay');
  toast('Sheet settings saved','ok');
}

// ─── DATA ───────────────────────────────────────────
function loadData() {
  try { items = JSON.parse(localStorage.getItem(STORE_KEY)||'[]'); } catch(e){items=[];}
}
function persistData() { localStorage.setItem(STORE_KEY, JSON.stringify(items)); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

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
  const name = email.split('@')[0];
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
  if(name==='browse')    renderBrowse();
  if(name==='dashboard') renderDashboard();
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
  persistData(); logToSheet('CLAIM',item);
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
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX/w, MAX/h);
        w = Math.round(w*r); h = Math.round(h*r);
      }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      photoData = cv.toDataURL('image/jpeg', 0.82);
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
    claimedBy:'', claimedId:'', claimedContact:'', claimedAt:'', returnedAt:''
  };
  items.unshift(item);
  persistData();
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
  item.status='returned'; item.returnedAt=new Date().toISOString();
  persistData(); logToSheet('RETURNED',item); renderDashboard();
  toast('Marked as returned','ok');
}

function deleteItem(id) {
  if(currentRole!=='admin'){toast('Only admins can delete items','err');return;}
  if(!confirm('Permanently delete this item?')) return;
  items=items.filter(i=>i.id!==id);
  persistData(); renderDashboard();
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
      </div>`;
  }
  document.getElementById('detailClaimSection').innerHTML=claimHtml;
  openModal('detailOverlay');
}

// ─── SHEETS ─────────────────────────────────────────
// Opens the Apps Script URL with query params in a hidden
// window — bypasses every CORS/redirect issue completely.
function buildSheetUrl(data) {
  const params = Object.entries(data)
    .map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v||'')))
    .join('&');
  return settings.sheetUrl + '?' + params;
}

function logToSheet(eventType, item) {
  if (!settings.sheetUrl) return;

  const data = {
    event:          eventType,
    timestamp:      new Date().toISOString(),
    id:             item.id             || '',
    name:           item.name           || '',
    category:       item.category       || '',
    location:       item.locationFound  || '',
    description:    item.description    || '',
    staffName:      item.staffName      || '',
    staffEmail:     item.staffEmail     || '',
    status:         item.status         || '',
    claimedBy:      item.claimedBy      || '',
    claimedId:      item.claimedId      || '',
    claimedContact: item.claimedContact || '',
    claimedAt:      item.claimedAt      || '',
    returnedAt:     item.returnedAt     || ''
  };

  // Method 1: hidden iframe form submit (silent, background)
  try {
    const iframeName = 'eps_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.cssText = 'display:none;position:fixed;width:0;height:0;border:0;top:-9999px;left:-9999px;';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'GET';
    form.action = settings.sheetUrl;
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

// Test button: opens sheet URL in a new tab so you can see if it works
function testSheetConnection() {
  const url = settings.sheetUrl;
  if (!url) { toast('Save a URL first', 'err'); return; }
  const testUrl = url + '?event=TEST&timestamp=' + encodeURIComponent(new Date().toISOString())
    + '&name=Test+Item&category=Test&location=Test&status=test'
    + '&id=test&description=Connection+test+from+EPS+Retriever'
    + '&staffName=Admin&staffEmail=amotwani%40eastsideprep.org';
  window.open(testUrl, '_blank');
  toast('Test row sent — check your sheet and the new tab for errors', 'info');
}

function updateTestBtn() {
  const val = document.getElementById('sheetUrlInput').value.trim();
  document.getElementById('testSheetBtn').disabled = !val;
}

// ─── CSV ────────────────────────────────────────────
function exportCSV() {
  const h=['ID','Item Name','Category','Location','Description','Staff Name','Staff Email','Status','Date Added','Claimed By','Student ID','Contact','Claimed At','Returned At'];
  const rows=items.map(i=>[i.id,i.name,i.category,i.locationFound,i.description,i.staffName,i.staffEmail,i.status,i.createdAt,i.claimedBy,i.claimedId,i.claimedContact,i.claimedAt,i.returnedAt||''].map(v=>`"${String(v||'').replace(/"/g,'""')}"`));
  const csv=[h,...rows].map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`eps-retriever-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  toast('CSV exported','ok');
}

// ─── SETTINGS MODAL ─────────────────────────────────
function openSettings() {
  if(currentRole!=='admin') return;
  document.getElementById('sheetUrlInput').value=settings.sheetUrl||'';
  document.getElementById('pwdStudent').value=settings.pwdStudent||'';
  document.getElementById('pwdFacilities').value=settings.pwdFacilities||'';
  document.getElementById('pwdAdmin').value=settings.pwdAdmin||'';
  document.getElementById('testSheetBtn').disabled = !settings.sheetUrl;
  openModal('settingsOverlay');
}
function updateSheetPill() {
  const pill=document.getElementById('sheetPill');
  const txt=document.getElementById('sheetPillText');
  if(settings.sheetUrl){pill.classList.add('connected');txt.textContent='Sheet Connected';}
  else{pill.classList.remove('connected');txt.textContent='No Sheet';}
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

// ─── DEMO SEED ───────────────────────────────────────
function seedDemo() {
  if(items.length>0) return;
  [{name:'Blue Hydro Flask 40 oz',category:'Water Bottle',location:'Gym',desc:'Large blue Hydro Flask with stickers, no lid.'},
   {name:'AirPods Pro Case',category:'Electronics',location:'Library',desc:'White AirPods Pro case. No earbuds inside.'},
   {name:'Black Nike Hoodie',category:'Clothing',location:'Cafeteria',desc:'Black full-zip Nike hoodie, size Large.'},
   {name:'TI-84 Plus Calculator',category:'School Supplies',location:'Room 204',desc:'Silver graphing calculator, "MS" on back.'},
   {name:'Purple Scrunchie',category:'Accessories',location:'Gym',desc:'Purple velvet scrunchie.'},
   {name:'Toyota Car Keys',category:'Keys',location:'Main Office',desc:'Toyota key fob with a small red lanyard.'}
  ].forEach((d,i)=>{
    items.push({
      id:uid(),name:d.name,category:d.category,locationFound:d.location,
      description:d.desc,staffName:i%2===0?'Ms. Johnson':'Mr. Davis',
      staffEmail:i%2===0?'kjohnson@eastsideprep.org':'tdavis@eastsideprep.org',
      photo:null,status:i===1?'claimed':'unclaimed',
      createdAt:new Date(Date.now()-i*172800000).toISOString(),
      claimedBy:i===1?'Alex Rodriguez':'',claimedId:i===1?'S-20891':'',
      claimedContact:i===1?'arodriguez@eastsideprep.org':'',
      claimedAt:i===1?new Date(Date.now()-86400000).toISOString():'',returnedAt:''
    });
  });
  persistData();
}

// ─── INIT ────────────────────────────────────────────
loadSettings();
loadData();
seedDemo();
updateSheetPill();
restoreSession();
