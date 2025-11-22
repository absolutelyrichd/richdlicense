import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIG ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = {
    apiKey: "AIzaSyBmTmNdBlPc5nroktbiGwFMAkx1Oi6zTBo",
    authDomain: "richdlicense.firebaseapp.com",
    projectId: "richdlicense",
    storageBucket: "richdlicense.firebasestorage.app",
    messagingSenderId: "150392102612",
    appId: "1:150392102612:web:3c784159c948d18e84a541",
    measurementId: "G-TC8B5GX446"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let licenses = [];
let filteredLicenses = [];
let unsubscribe = null; 
let currentPage = 1;
const licensesPerPage = 10;
let sortState = { column: 'software', direction: 'asc' };

// --- UI REFERENCES ---
const ui = {
    loginScreen: document.getElementById('login-screen'),
    appScreen: document.getElementById('app-screen'),
    loginButton: document.getElementById('login-button'),
    userPhoto: document.getElementById('user-photo'),
    userName: document.getElementById('user-name'),
    logoutBtn: document.getElementById('logout-button-text'),
    listBody: document.getElementById('license-list-body'),
    listCards: document.getElementById('license-list-cards'),
    pagination: document.getElementById('pagination-container'),
    backdrop: document.getElementById('modal-backdrop'),
    pageTitle: document.getElementById('page-title'),
    addBtn: document.getElementById('add-license-button'),
    addBtnMobile: document.getElementById('add-license-mobile'),
    statsActive: document.getElementById('count-active'),
    statsExpired: document.getElementById('count-expired'),
    statsCostMini: document.getElementById('total-cost-mini')
};

// --- FORMATTERS ---
const formatCost = (cost) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(cost);
const formatDate = (ts) => {
    if (!ts) return '-';
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(ts.toDate());
};

// --- AUTH LOGIC ---
ui.loginButton.addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (e) { showToast('Error', e.message, true); }
});

ui.logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        ui.loginScreen.classList.add('hidden');
        ui.appScreen.classList.remove('hidden');
        ui.userPhoto.src = user.photoURL || 'https://placehold.co/40x40';
        ui.userName.textContent = user.displayName || 'User';
        fetchLicenses();
    } else {
        currentUser = null;
        ui.loginScreen.classList.remove('hidden');
        ui.appScreen.classList.add('hidden');
        if (unsubscribe) unsubscribe();
    }
});

// --- DATA FETCHING ---
function fetchLicenses() {
    const q = query(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses'), orderBy("software"));
    unsubscribe = onSnapshot(q, (snapshot) => {
        licenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
        updateCharts();
        updateMiniStats();
    });
}

function updateMiniStats() {
    const active = licenses.filter(l => l.status === 'Active').length;
    const expired = licenses.filter(l => l.status === 'Expired').length;
    const total = licenses.reduce((acc, l) => acc + (l.cost || 0), 0);

    ui.statsActive.innerText = active;
    ui.statsExpired.innerText = expired;
    ui.statsCostMini.innerText = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', notation: "compact" }).format(total);
}

// --- RENDERING ---
function renderList() {
    ui.listBody.innerHTML = '';
    ui.listCards.innerHTML = '';

    const start = (currentPage - 1) * licensesPerPage;
    const pageItems = filteredLicenses.slice(start, start + licensesPerPage);

    if (pageItems.length === 0) {
        ui.listBody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-slate-500 italic">Tidak ada data ditemukan.</td></tr>`;
        ui.listCards.innerHTML = `<div class="text-center p-8 text-slate-500 italic">Tidak ada data.</div>`;
        return;
    }

    // Desktop Table
    pageItems.forEach(l => {
        const row = document.createElement('tr');
        row.className = 'floating-row border-b border-white/5 hover:bg-white/5 transition-colors group';
        
        let statusClass = '';
        if(l.status === 'Active') statusClass = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        else if(l.status === 'Expired') statusClass = 'text-rose-400 bg-rose-400/10 border-rose-400/20';
        else statusClass = 'text-slate-400 bg-slate-400/10 border-slate-400/20';

        row.innerHTML = `
            <td class="p-4 pl-6"><input type="checkbox" data-id="${l.id}" class="license-checkbox w-4 h-4 rounded border-slate-600 bg-slate-700 checked:bg-indigo-500"></td>
            <td class="p-4 font-medium text-white">${l.software}</td>
            <td class="p-4"><span class="text-xs px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">${l.type}</span></td>
            <td class="p-4 font-mono text-xs text-slate-400">${l.key || '-'}</td>
            <td class="p-4 text-indigo-300 font-medium">${l.cost ? formatCost(l.cost) : 'Free'}</td>
            <td class="p-4 text-slate-400 text-xs">${l.type === 'Lifetime' ? '∞' : formatDate(l.expirationDate)}</td>
            <td class="p-4 text-center"><span class="text-xs px-2 py-1 rounded-full border ${statusClass}">${l.status}</span></td>
            <td class="p-4 pr-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="edit-btn text-slate-400 hover:text-indigo-400 mx-1" data-id="${l.id}"><i class="ph-bold ph-pencil-simple"></i></button>
                <button class="delete-btn text-slate-400 hover:text-rose-400 mx-1" data-id="${l.id}"><i class="ph-bold ph-trash"></i></button>
            </td>
        `;
        ui.listBody.appendChild(row);
    });

    // Mobile Cards (Glass Look)
    pageItems.forEach(l => {
        const card = document.createElement('div');
        card.className = 'glass-panel p-5 rounded-2xl space-y-3 border-l-4 border-indigo-500/50';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-white text-lg">${l.software}</h4>
                    <span class="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded mt-1 inline-block">${l.type}</span>
                </div>
                <button class="edit-btn w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white" data-id="${l.id}"><i class="ph-bold ph-pencil-simple"></i></button>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm mt-2">
                <div class="text-slate-400">Biaya</div>
                <div class="text-right font-medium text-white">${l.cost ? formatCost(l.cost) : 'Free'}</div>
                <div class="text-slate-400">Status</div>
                <div class="text-right"><span class="${l.status === 'Active' ? 'text-emerald-400' : 'text-rose-400'}">${l.status}</span></div>
            </div>
        `;
        // Add delete functionality for mobile
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn w-full py-2 mt-2 text-xs text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/10';
        delBtn.innerText = 'Hapus Lisensi';
        delBtn.dataset.id = l.id;
        card.appendChild(delBtn);
        
        ui.listCards.appendChild(card);
    });

    attachEventListeners();
    renderPagination();
}

function attachEventListeners() {
    document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', (e) => openModal(e.currentTarget.dataset.id)));
    document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', (e) => confirmDelete(e.currentTarget.dataset.id)));
    document.querySelectorAll('.license-checkbox').forEach(c => c.addEventListener('change', updateBulkUI));
}

// --- MODAL SYSTEM ---
const modals = {
    form: document.getElementById('license-modal'),
    bulk: document.getElementById('bulk-edit-modal'),
    delete: document.getElementById('delete-confirm-modal')
};

function showModal(modalId) {
    ui.backdrop.classList.remove('hidden');
    Object.values(modals).forEach(m => m.classList.add('hidden'));
    document.getElementById(modalId).classList.remove('hidden');
    
    // Animation
    setTimeout(() => {
        ui.backdrop.classList.remove('opacity-0');
        document.getElementById(modalId).firstElementChild.classList.remove('scale-95');
    }, 10);
}

function hideAllModals() {
    ui.backdrop.classList.add('opacity-0');
    document.querySelectorAll('#modal-backdrop > div > div').forEach(el => el.classList.add('scale-95'));
    setTimeout(() => {
        ui.backdrop.classList.add('hidden');
        Object.values(modals).forEach(m => m.classList.add('hidden'));
    }, 300);
}

ui.backdrop.addEventListener('click', (e) => {
    if (e.target === ui.backdrop) hideAllModals();
});
document.getElementById('cancel-button').addEventListener('click', hideAllModals);
document.getElementById('cancel-button-x').addEventListener('click', hideAllModals);
document.getElementById('cancel-delete-button').addEventListener('click', hideAllModals);
document.getElementById('bulk-edit-cancel-button').addEventListener('click', hideAllModals);

// --- FORM HANDLING ---
const rowContainer = document.getElementById('license-rows-container');

function createRow(data = {}) {
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'license-row glass-panel p-4 rounded-xl relative animate-fade-in';
    div.innerHTML = `
        ${data.software ? '' : '<button type="button" class="remove-row absolute -top-2 -right-2 w-6 h-6 bg-rose-500 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform">&times;</button>'}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
                <label class="block text-xs text-slate-400 mb-1 ml-1">Software</label>
                <input type="text" class="field-software w-full glass-input rounded-lg p-2.5 text-sm" value="${data.software || ''}" placeholder="Nama Software">
            </div>
            <div>
                <label class="block text-xs text-slate-400 mb-1 ml-1">Key / Serial</label>
                <input type="text" class="field-key w-full glass-input rounded-lg p-2.5 text-sm font-mono" value="${data.key || ''}" placeholder="XXXX-XXXX-XXXX">
            </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
                <label class="block text-xs text-slate-400 mb-1 ml-1">Tipe</label>
                <select class="field-type w-full glass-input rounded-lg p-2.5 text-sm">
                    <option ${data.type==='Perpetual'?'selected':''}>Perpetual</option>
                    <option ${data.type==='Subscription'?'selected':''}>Subscription</option>
                    <option ${data.type==='Trial'?'selected':''}>Trial</option>
                    <option ${data.type==='Lifetime'?'selected':''}>Lifetime</option>
                </select>
            </div>
            <div>
                <label class="block text-xs text-slate-400 mb-1 ml-1">Status</label>
                <select class="field-status w-full glass-input rounded-lg p-2.5 text-sm">
                    <option ${data.status==='Active'?'selected':''}>Active</option>
                    <option ${data.status==='Expired'?'selected':''}>Expired</option>
                    <option ${data.status==='Belum dipakai'?'selected':''}>Belum dipakai</option>
                </select>
            </div>
            <div>
                <label class="block text-xs text-slate-400 mb-1 ml-1">Harga</label>
                <input type="number" class="field-cost w-full glass-input rounded-lg p-2.5 text-sm" value="${data.cost || 0}">
            </div>
            <div>
                <label class="block text-xs text-slate-400 mb-1 ml-1">Valid Hingga</label>
                <input type="date" class="field-date w-full glass-input rounded-lg p-2.5 text-sm" value="${data.expirationDate ? new Date(data.expirationDate.seconds * 1000).toISOString().split('T')[0] : ''}">
            </div>
        </div>
    `;
    return div;
}

function openModal(id = null) {
    rowContainer.innerHTML = '';
    document.getElementById('license-id').value = id || '';
    
    if (id) {
        const l = licenses.find(x => x.id === id);
        rowContainer.appendChild(createRow(l));
        document.getElementById('modal-title').innerText = 'Edit Lisensi';
        document.getElementById('add-row-button').classList.add('hidden');
    } else {
        rowContainer.appendChild(createRow());
        document.getElementById('modal-title').innerText = 'Tambah Lisensi Baru';
        document.getElementById('add-row-button').classList.remove('hidden');
    }
    showModal('license-modal');
}

document.getElementById('add-row-button').addEventListener('click', () => {
    rowContainer.appendChild(createRow());
});

rowContainer.addEventListener('click', e => {
    if(e.target.classList.contains('remove-row')) e.target.parentElement.remove();
});

ui.addBtn.addEventListener('click', () => openModal());
ui.addBtnMobile.addEventListener('click', () => openModal());

document.getElementById('license-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('license-id').value;
    const rows = rowContainer.querySelectorAll('.license-row');
    
    try {
        const batch = writeBatch(db);
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses');
        let count = 0;

        rows.forEach(row => {
            const data = {
                software: row.querySelector('.field-software').value,
                key: row.querySelector('.field-key').value,
                type: row.querySelector('.field-type').value,
                status: row.querySelector('.field-status').value,
                cost: parseInt(row.querySelector('.field-cost').value) || 0,
                lastUpdated: new Date()
            };
            
            const dateVal = row.querySelector('.field-date').value;
            if(dateVal && data.type !== 'Lifetime') data.expirationDate = new Date(dateVal);
            else data.expirationDate = null;

            if(data.software) {
                const ref = id ? doc(colRef, id) : doc(colRef);
                id ? batch.update(ref, data) : batch.set(ref, data);
                count++;
            }
        });

        if(count > 0) {
            await batch.commit();
            showToast('Sukses', 'Data berhasil disimpan');
            hideAllModals();
        }
    } catch (err) {
        showToast('Error', err.message, true);
    }
});

// --- DELETION ---
let deleteCallback = null;
function confirmDelete(id) {
    showModal('delete-confirm-modal');
    deleteCallback = async () => {
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id));
            showToast('Dihapus', 'Item telah dihapus permanen');
            hideAllModals();
        } catch (e) { showToast('Error', e.message, true); }
    };
}

document.getElementById('confirm-delete-button').addEventListener('click', () => {
    if(deleteCallback) deleteCallback();
});

// --- BULK ACTIONS ---
document.getElementById('select-all-checkbox').addEventListener('change', e => {
    document.querySelectorAll('.license-checkbox').forEach(c => c.checked = e.target.checked);
    updateBulkUI();
});

function updateBulkUI() {
    const selected = document.querySelectorAll('.license-checkbox:checked');
    const count = selected.length;
    document.getElementById('bulk-edit-button').disabled = count === 0;
    document.getElementById('bulk-delete-button').disabled = count === 0;
    document.getElementById('selection-info').innerText = count > 0 
        ? `${count} item dipilih.` 
        : "Pilih item dari 'Daftar Lisensi'.";
}

document.getElementById('bulk-delete-button').addEventListener('click', () => {
    const ids = Array.from(document.querySelectorAll('.license-checkbox:checked')).map(c => c.dataset.id);
    showModal('delete-confirm-modal');
    deleteCallback = async () => {
        const batch = writeBatch(db);
        ids.forEach(id => batch.delete(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id)));
        await batch.commit();
        showToast('Sukses', `${ids.length} item dihapus.`);
        hideAllModals();
        document.getElementById('select-all-checkbox').checked = false;
    }
});

document.getElementById('bulk-edit-button').addEventListener('click', () => {
    const count = document.querySelectorAll('.license-checkbox:checked').length;
    document.getElementById('bulk-edit-info').innerText = `Mengedit ${count} item.`;
    showModal('bulk-edit-modal');
});

document.getElementById('bulk-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = Array.from(document.querySelectorAll('.license-checkbox:checked')).map(c => c.dataset.id);
    const batch = writeBatch(db);
    
    const type = document.getElementById('bulk-type').value;
    const status = document.getElementById('bulk-status').value;
    const updateType = document.getElementById('bulk-update-type-check').checked;
    const updateStatus = document.getElementById('bulk-update-status-check').checked;

    ids.forEach(id => {
        const ref = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id);
        const data = { lastUpdated: new Date() };
        if(updateType) data.type = type;
        if(updateStatus) data.status = status;
        batch.update(ref, data);
    });

    await batch.commit();
    showToast('Sukses', 'Update masal berhasil.');
    hideAllModals();
});

// --- FILTERS & PAGINATION ---
function applyFilters() {
    const search = document.getElementById('filter-software').value.toLowerCase();
    const type = document.getElementById('filter-type').value;
    const status = document.getElementById('filter-status').value;

    filteredLicenses = licenses.filter(l => {
        return (l.software.toLowerCase().includes(search) || (l.key && l.key.toLowerCase().includes(search))) &&
               (type === '' || l.type === type) &&
               (status === '' || l.status === status);
    });

    // Sorting
    const { column, direction } = sortState;
    filteredLicenses.sort((a, b) => {
        let va = a[column], vb = b[column];
        if(column === 'expirationDate') {
            va = va ? va.seconds : 0;
            vb = vb ? vb.seconds : 0;
        }
        if (typeof va === 'string') return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return direction === 'asc' ? va - vb : vb - va;
    });

    renderList();
}

['filter-software', 'filter-type', 'filter-status'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => { currentPage = 1; applyFilters(); });
});

document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if(sortState.column === col) sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        else { sortState.column = col; sortState.direction = 'asc'; }
        
        document.querySelectorAll('.sort-icon').forEach(i => i.innerText = '');
        th.querySelector('.sort-icon').innerText = sortState.direction === 'asc' ? '↑' : '↓';
        applyFilters();
    });
});

function renderPagination() {
    ui.pagination.innerHTML = '';
    const pages = Math.ceil(filteredLicenses.length / licensesPerPage);
    if(pages <= 1) return;

    for(let i=1; i<=pages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = `w-8 h-8 rounded-lg text-sm font-medium transition-colors ${i===currentPage ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`;
        btn.addEventListener('click', () => { currentPage = i; renderList(); });
        ui.pagination.appendChild(btn);
    }
}

// --- CHARTS ---
let chartInstances = {};
function updateCharts() {
    const ctxType = document.getElementById('type-chart');
    const ctxStatus = document.getElementById('status-chart');
    const ctxCost = document.getElementById('cost-chart');
    
    if(!ctxType || !ctxStatus || !ctxCost) return;

    // Theme Colors (Neon Palette)
    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#8b5cf6', '#10b981'];
    
    // Data Prep
    const typeCounts = {};
    const statusCounts = {};
    const costByType = {};

    licenses.forEach(l => {
        typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
        statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
        costByType[l.type] = (costByType[l.type] || 0) + (l.cost || 0);
    });

    const config = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: {family: 'Plus Jakarta Sans'} } } }
    };

    // Destroy old charts
    if(chartInstances.type) chartInstances.type.destroy();
    if(chartInstances.status) chartInstances.status.destroy();
    if(chartInstances.cost) chartInstances.cost.destroy();

    chartInstances.type = new Chart(ctxType, {
        type: 'doughnut',
        data: { labels: Object.keys(typeCounts), datasets: [{ data: Object.values(typeCounts), backgroundColor: colors, borderWidth: 0 }] },
        options: config
    });

    chartInstances.status = new Chart(ctxStatus, {
        type: 'pie',
        data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#10b981', '#f43f5e', '#f59e0b', '#64748b'], borderWidth: 0 }] },
        options: config
    });

    chartInstances.cost = new Chart(ctxCost, {
        type: 'bar',
        data: { 
            labels: Object.keys(costByType), 
            datasets: [{ 
                label: 'Total Biaya', 
                data: Object.values(costByType), 
                backgroundColor: '#6366f1', 
                borderRadius: 8 
            }] 
        },
        options: {
            ...config,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
    
    // Cost Text
    const total = Object.values(costByType).reduce((a,b)=>a+b,0);
    document.getElementById('total-cost').innerText = formatCost(total);
    
    if(licenses.length) {
        const max = licenses.reduce((p, c) => (p.cost > c.cost) ? p : c);
        document.getElementById('most-expensive-license').innerText = `${max.software} (${formatCost(max.cost)})`;
    }
}

// --- UTILS ---
function showToast(title, msg, isError=false) {
    const t = document.getElementById('toast');
    document.getElementById('toast-title').innerText = title;
    document.getElementById('toast-message').innerText = msg;
    document.getElementById('toast-icon').className = isError ? 'ph-fill ph-warning-circle text-rose-400 text-xl' : 'ph-fill ph-check-circle text-emerald-400 text-xl';
    t.className = `fixed top-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl glass-panel border-l-4 transform transition-all duration-300 shadow-2xl translate-x-0 ${isError ? 'border-rose-500' : 'border-emerald-500'}`;
    
    setTimeout(() => t.classList.add('translate-x-full'), 3000);
}

// Tab Logic
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active', 'text-white', 'bg-white/5'));
        document.querySelectorAll('.nav-item').forEach(b => b.classList.add('text-slate-300'));
        btn.classList.add('active', 'text-white');
        btn.classList.remove('text-slate-300');

        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(target).classList.remove('hidden');
        
        // Close mobile sidebar if open
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('mobile-menu-backdrop').classList.add('hidden');
    });
});

document.getElementById('open-sidebar-button').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('-translate-x-full');
    document.getElementById('mobile-menu-backdrop').classList.remove('hidden');
});
document.getElementById('close-sidebar-button').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('mobile-menu-backdrop').classList.add('hidden');
});

// JSON Export/Import
document.getElementById('download-json-button').addEventListener('click', () => {
        const dataStr = JSON.stringify(licenses.map(({id, lastUpdated, expirationDate, ...rest}) => {
        if (expirationDate && expirationDate.toDate) rest.expirationDate = expirationDate.toDate().toISOString().split('T')[0];
        return rest;
    }), null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    a.download = 'nexus_backup.json';
    a.click();
});

document.getElementById('upload-json-button').addEventListener('click', () => document.getElementById('json-file-input').click());
document.getElementById('json-file-input').addEventListener('change', e => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            const batch = writeBatch(db);
            const col = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses');
            data.forEach(item => {
                if(item.expirationDate) item.expirationDate = new Date(item.expirationDate);
                item.lastUpdated = new Date();
                batch.set(doc(col), item);
            });
            await batch.commit();
            showToast('Import', `${data.length} item berhasil diimpor.`);
        } catch(err) { showToast('Error', 'Format file salah', true); }
    };
    reader.readAsText(e.target.files[0]);
});