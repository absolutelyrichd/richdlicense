import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, orderBy, setDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let licenseTypes = [];
let filteredLicenses = [];
let unsubscribe = null; 
let unsubscribeTypes = null;
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
    mobileLogoutBtn: document.getElementById('mobile-logout-btn'),
    listBody: document.getElementById('license-list-body'),
    listCards: document.getElementById('license-list-cards'),
    pagination: document.getElementById('pagination-container'),
    backdrop: document.getElementById('modal-backdrop'),
    pageTitle: document.getElementById('page-title'),
    addBtn: document.getElementById('add-license-button'),
    addBtnMobile: document.getElementById('add-license-mobile'),
    statsActive: document.getElementById('count-active'),
    statsExpired: document.getElementById('count-expired'),
    statsCostMini: document.getElementById('total-cost-mini'),
    mainScrollContainer: document.getElementById('main-scroll-container'),
    navbar: document.getElementById('main-navbar'),
    typeListContainer: document.getElementById('types-list-container'),
    addTypeForm: document.getElementById('add-type-form'),
    filterTypeSelect: document.getElementById('filter-type'),
    bulkTypeSelect: document.getElementById('bulk-type')
};

// --- SCROLL EFFECT LOGIC ---
if (ui.mainScrollContainer && ui.navbar) {
    ui.mainScrollContainer.addEventListener('scroll', () => {
        if (ui.mainScrollContainer.scrollTop > 20) {
            ui.navbar.classList.add('scrolled');
            ui.navbar.classList.remove('top-state');
        } else {
            ui.navbar.classList.remove('scrolled');
            ui.navbar.classList.add('top-state');
        }
    });
}

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

const handleLogout = () => signOut(auth);
if(ui.logoutBtn) ui.logoutBtn.addEventListener('click', handleLogout);
if(ui.mobileLogoutBtn) ui.mobileLogoutBtn.addEventListener('click', handleLogout);

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        ui.loginScreen.classList.add('hidden');
        ui.appScreen.classList.remove('hidden');
        if(ui.userPhoto) ui.userPhoto.src = user.photoURL || 'https://placehold.co/40x40';
        if(ui.userName) ui.userName.textContent = user.displayName || 'User';
        fetchData();
    } else {
        currentUser = null;
        ui.loginScreen.classList.remove('hidden');
        ui.appScreen.classList.add('hidden');
        if (unsubscribe) unsubscribe();
        if (unsubscribeTypes) unsubscribeTypes();
    }
});

// --- DATA FETCHING (Licenses & Types) ---
function fetchData() {
    // 1. Fetch Licenses
    const q = query(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses'), orderBy("software"));
    unsubscribe = onSnapshot(q, (snapshot) => {
        licenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
        updateCharts();
        updateMiniStats();
    });

    // 2. Fetch Types
    const typesQ = query(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'custom_types'), orderBy("name"));
    unsubscribeTypes = onSnapshot(typesQ, async (snapshot) => {
        licenseTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Auto-seed defaults if empty for first-time users
        if (licenseTypes.length === 0 && !snapshot.metadata.hasPendingWrites) {
            await seedDefaultTypes();
        } else {
            renderTypesSettings();
            updateAllTypeDropdowns();
            renderList(); // Re-render list to apply dynamic colors
        }
    });
}

async function seedDefaultTypes() {
    const defaults = [
        { name: 'Perpetual', color: 'teal' },
        { name: 'Subscription', color: 'blue' },
        { name: 'Trial', color: 'amber' },
        { name: 'Lifetime', color: 'purple' },
        { name: 'Giveaway', color: 'rose' }
    ];
    const batch = writeBatch(db);
    const colRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'custom_types');
    defaults.forEach(t => batch.set(doc(colRef), t));
    await batch.commit();
}

function updateMiniStats() {
    const active = licenses.filter(l => l.status === 'Active').length;
    const expired = licenses.filter(l => l.status === 'Expired').length;
    const total = licenses.reduce((acc, l) => acc + (l.cost || 0), 0);

    ui.statsActive.innerText = active;
    ui.statsExpired.innerText = expired;
    ui.statsCostMini.innerText = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', notation: "compact" }).format(total);
}

// --- TYPE MANAGEMENT ---
function renderTypesSettings() {
    if (!ui.typeListContainer) return;
    ui.typeListContainer.innerHTML = '';
    
    if (licenseTypes.length === 0) {
        document.getElementById('empty-types-msg').classList.remove('hidden');
        return;
    }
    document.getElementById('empty-types-msg').classList.add('hidden');

    const colorClasses = {
        teal: 'bg-teal-100 text-teal-700 border-teal-200',
        blue: 'bg-blue-100 text-blue-700 border-blue-200',
        purple: 'bg-purple-100 text-purple-700 border-purple-200',
        amber: 'bg-amber-100 text-amber-700 border-amber-200',
        rose: 'bg-rose-100 text-rose-700 border-rose-200',
        slate: 'bg-slate-100 text-slate-700 border-slate-200',
    };

    licenseTypes.forEach(t => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white transition-all';
        const colorClass = colorClasses[t.color] || colorClasses.slate;
        
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-3 h-3 rounded-full bg-${t.color}-500"></span>
                <span class="font-bold text-slate-700">${t.name}</span>
                <span class="text-xs px-2 py-0.5 rounded ${colorClass} font-medium border">Preview</span>
            </div>
            <div class="flex gap-1">
                <button class="edit-type-btn p-2 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors" data-id="${t.id}" data-name="${t.name}" data-color="${t.color}">
                    <i class="ph-bold ph-pencil-simple"></i>
                </button>
                <button class="delete-type-btn p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors" data-id="${t.id}">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>
        `;
        ui.typeListContainer.appendChild(div);
    });

    document.querySelectorAll('.delete-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => confirmDelete(e.currentTarget.dataset.id, 'type'));
    });

    // Add Edit Listener
    document.querySelectorAll('.edit-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const { id, name, color } = e.currentTarget.dataset;
            document.getElementById('edit-type-id').value = id;
            document.getElementById('edit-type-name').value = name;
            document.getElementById('edit-type-name').dataset.oldName = name; // Store old name for cascading update
            document.getElementById('edit-type-color').value = color;
            showModal('edit-type-modal');
        });
    });
}

// Add New Type
ui.addTypeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('new-type-name');
    const colorInput = document.getElementById('new-type-color');
    const name = nameInput.value.trim();
    
    if (!name) return;

    if (licenseTypes.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        showToast('Info', 'Tipe ini sudah ada.', true);
        return;
    }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'custom_types'), {
            name: name,
            color: colorInput.value || 'slate'
        });
        showToast('Sukses', 'Tipe baru ditambahkan');
        nameInput.value = '';
    } catch (err) {
        showToast('Error', err.message, true);
    }
});

// Edit Type Submit
document.getElementById('edit-type-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-type-id').value;
    const name = document.getElementById('edit-type-name').value.trim();
    const color = document.getElementById('edit-type-color').value;
    const oldName = document.getElementById('edit-type-name').dataset.oldName;

    if (!name) return;

    try {
        const batch = writeBatch(db);
        const typeRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'custom_types', id);
        
        // 1. Update Definition
        batch.update(typeRef, { name, color });

        // 2. Cascading Update (if name changed)
        if (name !== oldName) {
            const q = query(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses'), where('type', '==', oldName));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { type: name });
            });
        }

        await batch.commit();
        showToast('Sukses', 'Tipe berhasil diperbarui');
        hideAllModals();
    } catch (err) {
        showToast('Error', err.message, true);
    }
});

document.getElementById('cancel-edit-type').addEventListener('click', hideAllModals);

// Update Dropdowns dynamically
function updateAllTypeDropdowns() {
    const fillSelect = (selectEl, includeAllOption = false) => {
        if (!selectEl) return;
        const currentVal = selectEl.value; 
        selectEl.innerHTML = includeAllOption ? '<option value="">Semua Tipe</option>' : '';
        
        licenseTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.innerText = t.name;
            selectEl.appendChild(opt);
        });
        if (currentVal && Array.from(selectEl.options).some(o => o.value === currentVal)) {
            selectEl.value = currentVal;
        }
    };

    fillSelect(ui.filterTypeSelect, true);
    fillSelect(ui.bulkTypeSelect);
    document.querySelectorAll('.field-type').forEach(select => {
        fillSelect(select);
    });
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

    const getTypeColor = (typeName) => {
        const typeObj = licenseTypes.find(t => t.name === typeName);
        const color = typeObj ? typeObj.color : 'slate';
        return `text-${color}-700 bg-${color}-50 border-${color}-200`;
    };

    pageItems.forEach(l => {
        const row = document.createElement('tr');
        row.className = 'floating-row border-b border-slate-100 hover:bg-slate-50 transition-colors group';
        
        let statusClass = '';
        if(l.status === 'Active') statusClass = 'text-emerald-700 bg-emerald-100 border-emerald-200';
        else if(l.status === 'Expired') statusClass = 'text-rose-700 bg-rose-100 border-rose-200';
        else statusClass = 'text-slate-600 bg-slate-100 border-slate-200';

        const typeClass = getTypeColor(l.type);

        row.innerHTML = `
            <td class="p-4 pl-6"><input type="checkbox" data-id="${l.id}" class="license-checkbox w-4 h-4 rounded border-slate-300 bg-white checked:bg-teal-600 focus:ring-teal-500 text-teal-600"></td>
            <td class="p-4 font-bold text-slate-800">${l.software}</td>
            <td class="p-4"><span class="text-xs px-2 py-1 rounded-md border font-bold ${typeClass}">${l.type}</span></td>
            <td class="p-4 font-mono text-xs text-slate-600 bg-slate-50/50 rounded inline-block mt-2 px-2">${l.key || '-'}</td>
            <td class="p-4 text-teal-700 font-bold">${l.cost ? formatCost(l.cost) : 'Free'}</td>
            <td class="p-4 text-slate-600 text-xs">${l.type === 'Lifetime' ? '∞' : formatDate(l.expirationDate)}</td>
            <td class="p-4 text-center"><span class="text-xs px-2 py-1 rounded-full border ${statusClass} font-bold">${l.status}</span></td>
            <td class="p-4 pr-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="edit-btn text-slate-400 hover:text-teal-700 mx-1 p-2 rounded-lg hover:bg-teal-50 transition-colors" data-id="${l.id}"><i class="ph-bold ph-pencil-simple text-lg"></i></button>
                <button class="delete-btn text-slate-400 hover:text-rose-600 mx-1 p-2 rounded-lg hover:bg-rose-50 transition-colors" data-id="${l.id}"><i class="ph-bold ph-trash text-lg"></i></button>
            </td>
        `;
        ui.listBody.appendChild(row);
    });

    pageItems.forEach(l => {
        const card = document.createElement('div');
        card.className = 'glass-panel p-5 rounded-2xl space-y-3 border-l-4 border-teal-500 bg-white/60 shadow-sm';
        
        let statusClassMobile = '';
        if(l.status === 'Active') statusClassMobile = 'text-emerald-700 font-bold';
        else if(l.status === 'Expired') statusClassMobile = 'text-rose-700 font-bold';
        else statusClassMobile = 'text-slate-600 font-medium';
        
        const typeObj = licenseTypes.find(t => t.name === l.type);
        const colorName = typeObj ? typeObj.color : 'slate';
        const typeClassMobile = `text-${colorName}-800 bg-${colorName}-100 border-${colorName}-200`;

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-slate-900 text-lg">${l.software}</h4>
                    <span class="text-xs px-2 py-0.5 rounded mt-1 inline-block border font-medium ${typeClassMobile}">${l.type}</span>
                </div>
                <button class="edit-btn w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 hover:text-teal-700 transition-colors" data-id="${l.id}"><i class="ph-bold ph-pencil-simple text-lg"></i></button>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm mt-2 bg-white/50 p-3 rounded-xl border border-slate-100">
                <div class="text-slate-500">Biaya</div>
                <div class="text-right font-bold text-slate-800">${l.cost ? formatCost(l.cost) : 'Free'}</div>
                <div class="text-slate-500">Status</div>
                <div class="text-right"><span class="${statusClassMobile}">${l.status}</span></div>
            </div>
            <div class="pt-2 mt-2">
                 <button class="delete-btn w-full py-2.5 text-xs font-bold text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 flex items-center justify-center gap-2 transition-colors" data-id="${l.id}">
                    <i class="ph-bold ph-trash"></i> Hapus Lisensi
                </button>
            </div>
        `;
        
        ui.listCards.appendChild(card);
    });

    attachEventListeners();
    renderPagination();
}

function attachEventListeners() {
    document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', (e) => openModal(e.currentTarget.dataset.id)));
    document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', (e) => confirmDelete(e.currentTarget.dataset.id, 'license')));
    document.querySelectorAll('.license-checkbox').forEach(c => c.addEventListener('change', updateBulkUI));
}

// --- MODAL SYSTEM ---
const modals = {
    form: document.getElementById('license-modal'),
    bulk: document.getElementById('bulk-edit-modal'),
    delete: document.getElementById('delete-confirm-modal'),
    editType: document.getElementById('edit-type-modal')
};

function showModal(modalId) {
    ui.backdrop.classList.remove('hidden');
    Object.values(modals).forEach(m => m.classList.add('hidden'));
    document.getElementById(modalId).classList.remove('hidden');
    
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
    div.className = 'license-row glass-panel p-5 rounded-2xl relative animate-fade-in bg-slate-50/50 border border-slate-200';
    
    const typeOptions = licenseTypes.map(t => 
        `<option value="${t.name}" ${data.type === t.name ? 'selected' : ''}>${t.name}</option>`
    ).join('');

    div.innerHTML = `
        ${data.software ? '' : '<button type="button" class="remove-row absolute -top-2 -right-2 w-7 h-7 bg-rose-500 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"><i class="ph-bold ph-x"></i></button>'}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Software</label>
                <input type="text" class="field-software w-full glass-input rounded-xl p-3 text-sm text-slate-900 font-bold" value="${data.software || ''}" placeholder="Nama Software">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Key / Serial</label>
                <input type="text" class="field-key w-full glass-input rounded-xl p-3 text-sm font-mono text-slate-700" value="${data.key || ''}" placeholder="XXXX-XXXX-XXXX">
            </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Tipe</label>
                <select class="field-type w-full glass-input rounded-xl p-3 text-sm text-slate-700 cursor-pointer font-medium">
                    ${typeOptions}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Status</label>
                <select class="field-status w-full glass-input rounded-xl p-3 text-sm text-slate-700 cursor-pointer font-medium">
                    <option ${data.status==='Active'?'selected':''}>Active</option>
                    <option ${data.status==='Expired'?'selected':''}>Expired</option>
                    <option ${data.status==='Belum dipakai'?'selected':''}>Belum dipakai</option>
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Harga</label>
                <input type="number" class="field-cost w-full glass-input rounded-xl p-3 text-sm text-slate-700 font-medium" value="${data.cost || 0}">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Valid Hingga</label>
                <input type="date" class="field-date w-full glass-input rounded-xl p-3 text-sm text-slate-700 cursor-pointer font-medium" value="${data.expirationDate ? new Date(data.expirationDate.seconds * 1000).toISOString().split('T')[0] : ''}">
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
    if(e.target.closest('.remove-row')) e.target.closest('.remove-row').parentElement.remove();
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
function confirmDelete(id, context = 'license') {
    const msg = document.getElementById('delete-confirm-message');
    
    if (context === 'type') {
        msg.innerText = 'Menghapus Tipe Lisensi tidak akan menghapus lisensi yang sudah ada, tetapi mungkin mempengaruhi tampilan.';
    } else {
        msg.innerText = 'Item yang dihapus tidak dapat dikembalikan lagi. Anda yakin?';
    }

    showModal('delete-confirm-modal');
    deleteCallback = async () => {
        try {
            if (context === 'license') {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id));
                showToast('Dihapus', 'Lisensi telah dihapus');
            } else if (context === 'type') {
                await deleteDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'custom_types', id));
                showToast('Dihapus', 'Tipe Lisensi telah dihapus');
            }
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
        ? `${count} item dipilih untuk diproses.` 
        : "Pilih item dari 'Daftar Lisensi' terlebih dahulu untuk mengaktifkan panel kontrol ini.";
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
    document.getElementById('bulk-edit-info').innerText = `Anda sedang mengedit ${count} item sekaligus.`;
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
            // Treats 'null' (Lifetime) as Infinity so it stays last/first correctly
            va = va ? va.seconds : Infinity;
            vb = vb ? vb.seconds : Infinity;
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
        
        document.querySelectorAll('.sort-icon').forEach(i => i.innerHTML = '<i class="ph-bold ph-caret-up-down"></i>');
        const icon = sortState.direction === 'asc' ? '<i class="ph-bold ph-caret-up"></i>' : '<i class="ph-bold ph-caret-down"></i>';
        th.querySelector('.sort-icon').innerHTML = icon;
        th.querySelector('.sort-icon').classList.remove('opacity-0');
        
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
        btn.className = `w-10 h-10 rounded-xl text-sm font-bold transition-all transform hover:scale-105 ${i===currentPage ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/30' : 'bg-white text-slate-500 hover:bg-slate-100'}`;
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

    // Theme Colors
    const colors = ['#0d9488', '#14b8a6', '#f59e0b', '#3b82f6', '#6366f1'];
    
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
        plugins: { 
            legend: { 
                position: 'bottom',
                labels: { 
                    usePointStyle: true,
                    padding: 20,
                    color: '#475569', 
                    font: {family: 'Plus Jakarta Sans', weight: 600} 
                } 
            } 
        },
        layout: { padding: 10 }
    };

    if(chartInstances.type) chartInstances.type.destroy();
    if(chartInstances.status) chartInstances.status.destroy();
    if(chartInstances.cost) chartInstances.cost.destroy();

    chartInstances.type = new Chart(ctxType, {
        type: 'doughnut',
        data: { labels: Object.keys(typeCounts), datasets: [{ data: Object.values(typeCounts), backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }] },
        options: { ...config, cutout: '70%' }
    });

    chartInstances.status = new Chart(ctxStatus, {
        type: 'pie',
        data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#10b981', '#f43f5e', '#f59e0b', '#64748b'], borderWidth: 0, hoverOffset: 10 }] },
        options: config
    });

    chartInstances.cost = new Chart(ctxCost, {
        type: 'bar',
        data: { 
            labels: Object.keys(costByType), 
            datasets: [{ 
                label: 'Total Biaya', 
                data: Object.values(costByType), 
                backgroundColor: '#0d9488', 
                borderRadius: 8,
                barThickness: 40
            }] 
        },
        options: {
            ...config,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#475569', font: {family: 'Plus Jakarta Sans'} } },
                x: { grid: { display: false }, ticks: { color: '#475569', font: {family: 'Plus Jakarta Sans', weight: 600} } }
            }
        }
    });
    
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
    document.getElementById('toast-icon').className = isError ? 'ph-fill ph-warning-circle text-rose-500 text-2xl' : 'ph-fill ph-check-circle text-emerald-600 text-2xl';
    
    t.className = `fixed top-24 right-6 z-[110] flex items-center gap-4 px-5 py-4 rounded-2xl glass-panel border-l-4 transition-all duration-300 transform translate-x-0 opacity-100 bg-white/90 backdrop-blur-md min-w-[300px] shadow-2xl ${isError ? 'border-rose-500' : 'border-emerald-500'}`;
    
    setTimeout(() => {
        t.className = `fixed top-24 right-6 z-[110] flex items-center gap-4 px-5 py-4 rounded-2xl glass-panel border-l-4 transition-all duration-300 transform translate-x-full opacity-0 pointer-events-none shadow-2xl bg-white/90 backdrop-blur-md min-w-[300px] ${isError ? 'border-rose-500' : 'border-emerald-500'}`;
    }, 3000);
}

// Tab Logic
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
        if(btn.classList.contains('nav-link')) btn.classList.add('active');

        const target = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(target).classList.remove('hidden');
        
        document.getElementById('sidebar').classList.add('translate-x-full');
        document.getElementById('mobile-menu-backdrop').classList.add('hidden');
    });
});

document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('translate-x-full');
    document.getElementById('mobile-menu-backdrop').classList.remove('hidden');
});
document.getElementById('close-sidebar-button').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('translate-x-full');
    document.getElementById('mobile-menu-backdrop').classList.add('hidden');
});
document.getElementById('mobile-menu-backdrop').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('translate-x-full');
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
    a.download = 'backup.json';
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