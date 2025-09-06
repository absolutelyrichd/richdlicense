import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, orderBy, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Config and Auth ---
// The __app_id and __firebase_config variables are provided by the environment.
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let licenses = [];
let filteredLicenses = [];
let unsubscribe = null; 

// --- Pagination state ---
let currentPage = 1;
const licensesPerPage = 10;

// --- Sort state ---
let sortState = {
    column: 'software', 
    direction: 'asc'
};

// --- UI Elements ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginButton = document.getElementById('login-button');
const logoutButtonText = document.getElementById('logout-button-text');
const userPhoto = document.getElementById('user-photo');
const userName = document.getElementById('user-name');
const licenseListBody = document.getElementById('license-list-body');
const licenseListCards = document.getElementById('license-list-cards');
const addLicenseButton = document.getElementById('add-license-button');
const paginationContainer = document.getElementById('pagination-container');

// --- Statistik UI Elements ---
const totalCostElement = document.getElementById('total-cost');
const mostExpensiveLicenseElement = document.getElementById('most-expensive-license');

// --- Add/Edit Modal Elements ---
const licenseModal = document.getElementById('license-modal');
const modalContent = document.getElementById('modal-content');
const licenseForm = document.getElementById('license-form');
const cancelButton = document.getElementById('cancel-button');
const modalTitle = document.getElementById('modal-title');
const licenseRowsContainer = document.getElementById('license-rows-container');
const addRowButton = document.getElementById('add-row-button');

// --- Bulk Edit Modal Elements ---
const bulkEditModal = document.getElementById('bulk-edit-modal');
const bulkEditModalContent = document.getElementById('bulk-edit-modal-content');
const bulkEditForm = document.getElementById('bulk-edit-form');
const bulkEditCancelButton = document.getElementById('bulk-edit-cancel-button');
const bulkEditInfo = document.getElementById('bulk-edit-info');

// --- Delete Confirmation Modal Elements ---
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deleteConfirmModalContent = document.getElementById('delete-confirm-modal-content');
const deleteConfirmMessage = document.getElementById('delete-confirm-message');
const cancelDeleteButton = document.getElementById('cancel-delete-button');
const confirmDeleteButton = document.getElementById('confirm-delete-button');
let licenseIdToDelete = null; 
let currentConfirmCallback = null; 

// --- Mobile Elements ---
const sidebar = document.getElementById('sidebar');
const openSidebarButton = document.getElementById('open-sidebar-button');
const closeSidebarButton = document.getElementById('close-sidebar-button');
const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');

// --- Chart instances ---
let typeChart, statusChart, costChart;

// --- Helper for Date Formatting ---
function formatDate(timestamp) {
    if (!timestamp) return 'Tidak ada';
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

// --- Helper function to format price as currency ---
function formatCost(cost) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(cost);
}

// --- MOBILE SIDEBAR LOGIC ---
function openSidebar() {
    sidebar.classList.remove('-translate-x-full');
    mobileMenuBackdrop.classList.remove('hidden');
}

function closeSidebar() {
    sidebar.classList.add('-translate-x-full');
    mobileMenuBackdrop.classList.add('hidden');
}

openSidebarButton.addEventListener('click', openSidebar);
closeSidebarButton.addEventListener('click', closeSidebar);
mobileMenuBackdrop.addEventListener('click', closeSidebar);

// --- TOAST/ALERT FUNCTION ---
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.className = `fixed bottom-5 right-1/2 translate-x-1/2 w-11/12 max-w-sm text-white py-2 px-4 rounded-lg shadow-lg transform transition-all duration-300 z-50 ${isError ? 'bg-red-500' : 'bg-green-500'} translate-y-0 opacity-100`;
    setTimeout(() => {
        toast.className = toast.className.replace('translate-y-0 opacity-100', 'translate-y-20 opacity-0');
    }, 3000);
}

// --- AUTHENTICATION ---
async function handleSignIn() {
    if (initialAuthToken) {
        try {
            await signInWithCustomToken(auth, initialAuthToken);
        } catch (error) {
            console.error("Custom token sign in failed, falling back to anonymous: ", error);
            await signInAnonymously(auth);
        }
    } else {
        await signInAnonymously(auth);
    }
}

loginButton.addEventListener('click', handleSignIn);

if (logoutButtonText) {
    logoutButtonText.addEventListener('click', () => {
        signOut(auth);
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        
        userPhoto.src = user.photoURL || 'https://placehold.co/40x40/e2e8f0/e2e8f0';
        userName.textContent = user.displayName || 'Pengguna Anonim';
        
        const userProfileInfo = document.querySelector('#user-profile > div');
        if (userProfileInfo) userProfileInfo.classList.remove('hidden');
        
        fetchLicenses();
    } else {
        currentUser = null;
        loginScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
        
        const userProfileInfo = document.querySelector('#user-profile > div');
        if (userProfileInfo) userProfileInfo.classList.add('hidden');

        if (unsubscribe) unsubscribe();
        licenses = [];
        filteredLicenses = [];
        displayPage();
        updateCharts();
    }
});

// --- Helper for Badge Classes ---
function getLicenseBadgeClasses(type) {
    const colors = {
        'Perpetual': 'bg-teal-500/20 text-teal-300',
        'Subscription': 'bg-yellow-500/20 text-yellow-300',
        'Trial': 'bg-gray-500/20 text-gray-300',
        'Giveaway': 'bg-fuchsia-500/20 text-fuchsia-300', // Warna baru
        'default': 'bg-slate-500/20 text-slate-300'
    };
    return colors[type] || colors['default'];
}

function getStatusBadgeClasses(status) {
    const colors = {
        'Active': 'bg-green-500/20 text-green-300',
        'Expired': 'bg-red-500/20 text-red-300',
        'Revoked': 'bg-orange-500/20 text-orange-300',
        'Belum dipakai': 'bg-blue-500/20 text-blue-300', // Warna baru
        'default': 'bg-gray-500/20 text-gray-300'
    };
    return colors[status] || colors['default'];
}

// --- CRUD FUNCTIONS ---
function fetchLicenses() {
    if (!currentUser) return;
    const licensesCollectionRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses');

    const q = query(licensesCollectionRef, orderBy("software")); 

    unsubscribe = onSnapshot(q, (snapshot) => {
        licenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        licenses.sort((a, b) => (a.software || '').localeCompare((b.software || ''), undefined, { sensitivity: 'base' }));
        applyFiltersAndSort();
        updateCharts();
        updateBulkActionUI();
    }, (error) => {
        console.error("Error fetching licenses: ", error);
        showToast("Gagal memuat data lisensi. Periksa konfigurasi.", true);
    });
}

function renderLicenses(licensesToRender) {
    licenseListBody.innerHTML = '';
    licenseListCards.innerHTML = '';
    
    if (!licensesToRender || licensesToRender.length === 0) {
        licenseListBody.innerHTML = '<tr><td colspan="8" class="text-center p-8 text-gray-400">Tidak ada lisensi yang cocok dengan filter atau belum ada lisensi ditambahkan.</td></tr>';
        licenseListCards.innerHTML = '<div id="license-list-cards-empty" class="text-center p-8 text-gray-400">Tidak ada lisensi yang cocok dengan filter atau belum ada lisensi ditambahkan.</div>';
        return;
    }

    renderLicensesAsTable(licensesToRender);
    renderLicensesAsCards(licensesToRender);

    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', handleEdit));
    document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', handleDelete));
    document.querySelectorAll('.license-checkbox').forEach(cb => cb.addEventListener('change', updateBulkActionUI));
    updateSortIcons();
}

function renderLicensesAsTable(licensesToRender) {
    licensesToRender.forEach(license => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-700 hover:bg-gray-800/50 transition-colors';
        row.innerHTML = `
            <td class="p-4"><input type="checkbox" data-id="${license.id}" class="license-checkbox rounded bg-gray-700 border-gray-500 text-yellow-500 focus:ring-yellow-400"></td>
            <td class="p-4 font-medium">${license.software || ''}</td>
            <td class="p-4"><span class="px-2 py-1 text-xs font-semibold rounded-full ${getLicenseBadgeClasses(license.type)}">${license.type || ''}</span></td>
            <td class="p-4 text-gray-400">${license.key || ''}</td>
            <td class="p-4 text-yellow-300">${license.cost ? formatCost(license.cost) : 'Gratis'}</td>
            <td class="p-4 text-gray-400">${formatDate(license.expirationDate)}</td>
            <td class="p-4"><span class="px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClasses(license.status)}">${license.status || ''}</span></td>
            <td class="p-4 whitespace-nowrap">
                <button class="edit-btn p-1 text-gray-400 hover:text-white" data-id="${license.id}"><i class="ph ph-note-pencil"></i></button>
                <button class="delete-btn p-1 text-gray-400 hover:text-red-400" data-id="${license.id}"><i class="ph ph-trash"></i></button>
            </td>
        `;
        licenseListBody.appendChild(row);
    });
}

function renderLicensesAsCards(licensesToRender) {
    licensesToRender.forEach(license => {
        const card = document.createElement('div');
        card.className = 'card-item bg-gray-900/50 rounded-xl shadow-lg p-4 border border-gray-700 backdrop-blur-md space-y-2 fade-in';
        card.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="flex items-center space-x-3">
                    <input type="checkbox" data-id="${license.id}" class="license-checkbox rounded bg-gray-700 border-gray-500 text-yellow-500 focus:ring-yellow-400">
                    <span class="font-bold text-lg text-white">${license.software || ''}</span>
                </div>
                <div class="flex space-x-1">
                    <button class="edit-btn p-1 text-gray-400 hover:text-white" data-id="${license.id}"><i class="ph ph-note-pencil"></i></button>
                    <button class="delete-btn p-1 text-gray-400 hover:text-red-400" data-id="${license.id}"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            <div class="flex justify-between text-sm text-gray-400">
                <span>Tipe:</span>
                <span class="font-semibold text-white"><span class="px-2 py-1 text-xs font-semibold rounded-full ${getLicenseBadgeClasses(license.type)}">${license.type || ''}</span></span>
            </div>
            <div class="flex justify-between text-sm text-gray-400">
                <span>Kunci Lisensi:</span>
                <span class="font-semibold text-white truncate max-w-[150px]">${license.key || ''}</span>
            </div>
            <div class="flex justify-between text-sm text-gray-400">
                <span>Biaya:</span>
                <span class="font-semibold text-yellow-300">${license.cost ? formatCost(license.cost) : 'Gratis'}</span>
            </div>
            <div class="flex justify-between text-sm text-gray-400">
                <span>Status:</span>
                <span class="font-semibold text-white"><span class="px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClasses(license.status)}">${license.status || ''}</span></span>
            </div>
            <div class="flex justify-between text-sm text-gray-400">
                <span>Kedaluwarsa:</span>
                <span class="font-semibold text-white">${formatDate(license.expirationDate)}</span>
            </div>
        `;
        licenseListCards.appendChild(card);
    });
}

// --- ADD/EDIT MODAL LOGIC ---
function createLicenseRowHTML(license = {}) {
    const isEdit = !!license.id;
    const isUnused = license.status === 'Belum dipakai';
    return `
        <div class="license-row p-4 border border-gray-700 rounded-lg space-y-3 relative">
            ${isEdit ? '' : '<button type="button" class="remove-row-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center">&times;</button>'}
            <div class="mb-2">
                <label class="block text-gray-400 text-sm font-bold mb-1">Nama Software</label>
                <input type="text" class="software-name w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none" value="${license.software || ''}" required>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                    <label class="block text-gray-400 text-sm font-bold mb-1">Tipe Lisensi</label>
                    <select class="license-type w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none">
                        <option ${license.type === 'Perpetual' ? 'selected' : ''}>Perpetual</option>
                        <option ${license.type === 'Subscription' ? 'selected' : ''}>Subscription</option>
                        <option ${license.type === 'Trial' ? 'selected' : ''}>Trial</option>
                        <option ${license.type === 'Giveaway' ? 'selected' : ''}>Giveaway</option>
                    </select>
                </div>
                <div>
                    <label class="block text-gray-400 text-sm font-bold mb-1">Status Lisensi</label>
                    <select class="license-status w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none">
                        <option ${license.status === 'Active' ? 'selected' : ''}>Active</option>
                        <option ${license.status === 'Expired' ? 'selected' : ''}>Expired</option>
                        <option ${license.status === 'Revoked' ? 'selected' : ''}>Revoked</option>
                        <option ${license.status === 'Belum dipakai' ? 'selected' : ''}>Belum dipakai</option>
                    </select>
                </div>
                <div>
                    <label class="block text-gray-400 text-sm font-bold mb-1">Tanggal Kedaluwarsa</label>
                    <input type="date" class="license-expiration-date w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none" value="${license.expirationDate ? new Date(license.expirationDate.seconds * 1000).toISOString().split('T')[0] : ''}" ${isUnused ? 'disabled' : ''}>
                </div>
            </div>
            <div class="mb-2">
                <label class="block text-gray-400 text-sm font-bold mb-1">Kunci Lisensi</label>
                <input type="text" class="license-key w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none" value="${license.key || ''}">
            </div>
            <div class="mb-2">
                <label class="block text-gray-400 text-sm font-bold mb-1">Biaya (IDR)</label>
                <input type="number" class="license-cost w-full bg-gray-700 border border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-yellow-500 focus:outline-none" value="${license.cost || '0'}" min="0">
            </div>
        </div>
    `;
}

function addNewLicenseRow() {
    licenseRowsContainer.insertAdjacentHTML('beforeend', createLicenseRowHTML());
}

licenseRowsContainer.addEventListener('click', (e) => {
    if (e.target.matches('.remove-row-btn')) {
        e.target.closest('.license-row').remove();
    }
});

function openModal(license = null) {
    licenseRowsContainer.innerHTML = '';
    document.getElementById('license-id').value = license ? license.id : '';
    
    if (license) { // Edit mode
        modalTitle.textContent = 'Edit Lisensi';
        licenseRowsContainer.innerHTML = createLicenseRowHTML(license);
        addRowButton.classList.add('hidden');
    } else { // Add mode
        modalTitle.textContent = 'Tambah Lisensi Baru';
        addNewLicenseRow();
        addRowButton.classList.remove('hidden');
    }
    
    // Add event listener to dynamically disable expiration date input
    const statusSelect = licenseRowsContainer.querySelector('.license-status');
    const expirationInput = licenseRowsContainer.querySelector('.license-expiration-date');
    if (statusSelect && expirationInput) {
        statusSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Belum dipakai') {
                expirationInput.disabled = true;
                expirationInput.value = ''; // Clear the value
            } else {
                expirationInput.disabled = false;
            }
        });
    }

    licenseModal.classList.remove('hidden');
    licenseModal.classList.add('flex');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeModal() {
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        licenseModal.classList.add('hidden');
        licenseModal.classList.remove('flex');
    }, 200);
}

addLicenseButton.addEventListener('click', () => openModal());
addRowButton.addEventListener('click', addNewLicenseRow);
cancelButton.addEventListener('click', closeModal);
licenseModal.addEventListener('click', (e) => {
    if (e.target === licenseModal) closeModal();
});

licenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
        showToast("Anda harus masuk untuk menyimpan data.", true);
        return;
    }
    const id = document.getElementById('license-id').value;
    
    try {
        if (id) {
            const row = licenseRowsContainer.querySelector('.license-row');
            const licenseData = {
                software: row.querySelector('.software-name').value,
                type: row.querySelector('.license-type').value,
                key: row.querySelector('.license-key').value,
                cost: parseInt(row.querySelector('.license-cost').value, 10),
                status: row.querySelector('.license-status').value,
                expirationDate: row.querySelector('.license-expiration-date').value ? new Date(row.querySelector('.license-expiration-date').value) : null,
                lastUpdated: new Date()
            };
            if (!licenseData.software) {
                showToast("Nama software tidak boleh kosong.", true);
                return;
            }
            const licenseRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id);
            await updateDoc(licenseRef, licenseData);
            showToast('Lisensi berhasil diperbarui!');
        } else {
            const rows = licenseRowsContainer.querySelectorAll('.license-row');
            if (rows.length === 0) {
                showToast("Tidak ada lisensi untuk ditambahkan.", true);
                return;
            }
            
            const batch = writeBatch(db);
            let licensesAdded = 0;
            rows.forEach(row => {
                const licenseData = {
                    software: row.querySelector('.software-name').value,
                    type: row.querySelector('.license-type').value,
                    key: row.querySelector('.license-key').value,
                    cost: parseInt(row.querySelector('.license-cost').value, 10),
                    status: row.querySelector('.license-status').value,
                    expirationDate: row.querySelector('.license-expiration-date').value ? new Date(row.querySelector('.license-expiration-date').value) : null,
                    lastUpdated: new Date()
                };
                if (licenseData.software) {
                    const newLicenseRef = doc(collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses'));
                    batch.set(newLicenseRef, licenseData);
                    licensesAdded++;
                }
            });
            
            if (licensesAdded > 0) {
                await batch.commit();
                showToast(`${licensesAdded} lisensi berhasil ditambahkan!`);
            } else {
                showToast("Tidak ada lisensi untuk ditambahkan.", true);
                return;
            }
        }
        closeModal();
    } catch (error) {
        console.error("Error saving license(s): ", error);
        showToast(`Gagal menyimpan: ${error.message}`, true);
    }
});

function handleEdit(e) {
    const id = e.currentTarget.dataset.id;
    const license = licenses.find(l => l.id === id);
    if(license) openModal(license);
}

// --- DELETE CONFIRMATION MODAL LOGIC ---
function openDeleteConfirmModal(id, message, onConfirmCallback) {
    licenseIdToDelete = id; 
    deleteConfirmMessage.textContent = message;
    currentConfirmCallback = onConfirmCallback; 
    deleteConfirmModal.classList.remove('hidden');
    deleteConfirmModal.classList.add('flex');
    setTimeout(() => {
        deleteConfirmModalContent.classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeDeleteConfirmModal() {
    deleteConfirmModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        deleteConfirmModal.classList.add('hidden');
        deleteConfirmModal.classList.remove('flex');
        licenseIdToDelete = null; 
        currentConfirmCallback = null; 
    }, 200);
}

cancelDeleteButton.addEventListener('click', closeDeleteConfirmModal);
deleteConfirmModal.addEventListener('click', (e) => {
    if (e.target === deleteConfirmModal) closeDeleteConfirmModal();
});

confirmDeleteButton.addEventListener('click', async () => {
    if (currentConfirmCallback) {
        await currentConfirmCallback();
    }
});

function handleDelete(e) {
    const id = e.currentTarget.dataset.id;
    const licenseSoftware = licenses.find(l => l.id === id)?.software || 'lisensi ini';
    openDeleteConfirmModal(id, `Apakah Anda yakin ingin menghapus lisensi ${licenseSoftware}?`, async () => {
        try {
            const licenseRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id);
            await deleteDoc(licenseRef);
            showToast('Lisensi berhasil dihapus.');
            closeDeleteConfirmModal();
        } catch (error) {
            console.error("Error deleting license: ", error);
            showToast(`Gagal menghapus: ${error.message}`, true);
        }
    });
}

// --- TAB SWITCHING ---
const tabs = document.getElementById('tabs');
const mobileTabs = document.getElementById('mobile-tabs');
const tabContents = document.querySelectorAll('.tab-content');

function handleTabClick(e) {
    const button = e.target.closest('.tab-button');
    if (!button) return;

    const allTabButtons = document.querySelectorAll('.tab-button');
    allTabButtons.forEach(btn => {
        btn.classList.remove('tab-active');
    });

    button.classList.add('tab-active'); 
    
    const tabId = button.dataset.tab;
    tabContents.forEach(content => {
        if (content.id === tabId) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
    });
    
    if (window.innerWidth < 768) {
        closeSidebar();
    }
}

tabs.addEventListener('click', handleTabClick);
mobileTabs.addEventListener('click', handleTabClick);

// --- CHART LOGIC ---
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'bottom',
                labels: { color: '#94a3b8', padding: 15, font: { size: 12 } }
            }
        },
        onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
        elements: { arc: { hoverOffset: 12, borderWidth: 0 } }
    };
    const barOptions = { 
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
        scales: {
            y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
            x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
    };
    
    const pieDoughnutOptions = {
        ...commonOptions,
        plugins: {
            ...commonOptions.plugins,
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed;
                        const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                        const percentage = ((value / total) * 100).toFixed(1) + '%';
                        return `${label}: ${value} (${percentage})`;
                    }
                }
            }
        }
    };

    typeChart = new Chart(document.getElementById('type-chart'), { type: 'doughnut', data: {}, options: pieDoughnutOptions });
    statusChart = new Chart(document.getElementById('status-chart'), { type: 'pie', data: {}, options: pieDoughnutOptions });
    costChart = new Chart(document.getElementById('cost-chart'), { type: 'bar', data: {}, options: barOptions });
}

function updateCharts() {
    if (!typeChart) initCharts();

    const totalCost = licenses.reduce((sum, license) => sum + (license.cost || 0), 0);
    let mostExpensiveLicense = "Belum ada lisensi";
    if (licenses.length > 0) {
        const mostExpensive = licenses.reduce((max, current) => (current.cost > (max.cost || 0) ? current : max), licenses[0]);
        mostExpensiveLicense = `${mostExpensive.software} (${formatCost(mostExpensive.cost || 0)})`;
    }
    totalCostElement.textContent = formatCost(totalCost);
    mostExpensiveLicenseElement.textContent = mostExpensiveLicense;

    const typeData = licenses.reduce((acc, license) => { acc[license.type] = (acc[license.type] || 0) + 1; return acc; }, {});
    typeChart.data = {
        labels: Object.keys(typeData),
        datasets: [{ data: Object.values(typeData), backgroundColor: ['#2dd4bf', '#fde047', '#94a3b8', '#a855f7'] }]
    };
    typeChart.update();

    const statusData = licenses.reduce((acc, license) => { acc[license.status] = (acc[license.status] || 0) + 1; return acc; }, {});
    statusChart.data = {
        labels: Object.keys(statusData),
        datasets: [{ data: Object.values(statusData), backgroundColor: ['#22c55e', '#ef4444', '#f97316', '#3b82f6'] }]
    };
    statusChart.update();
    
    const costData = licenses.reduce((acc, license) => { acc[license.type] = (acc[license.type] || 0) + (license.cost || 0); return acc; }, {});
    const costLabels = Object.keys(costData);
    const costValues = Object.values(costData);
    costChart.data = {
        labels: costLabels,
        datasets: [{ 
            label: 'Total Biaya', 
            data: costValues, 
            backgroundColor: ['#2dd4bf', '#fde047', '#94a3b8', '#a855f7'],
            borderRadius: 6, borderWidth: 2, borderColor: 'transparent'
        }]
    };
    costChart.update();
}

// --- FILTERING AND PAGINATION LOGIC ---
const filterSoftware = document.getElementById('filter-software');
const filterType = document.getElementById('filter-type');
const filterKey = document.getElementById('filter-key');
const filterStatus = document.getElementById('filter-status');

[filterSoftware, filterType, filterKey, filterStatus].forEach(el => {
    el.addEventListener('input', () => {
        currentPage = 1;
        applyFiltersAndSort();
    });
});

function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => icon.textContent = '');
    if (sortState.column) {
        const currentHeader = document.querySelector(`th[data-sort="${sortState.column}"] .sort-icon`);
        if (currentHeader) {
            currentHeader.textContent = sortState.direction === 'asc' ? '▲' : '▼';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            const column = e.currentTarget.dataset.sort;
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }
            currentPage = 1;
            applyFiltersAndSort();
        });
    });
    updateSortIcons();
});

function applyFiltersAndSort() {
    const software = filterSoftware.value.toLowerCase();
    const type = filterType.value;
    const key = filterKey.value.toLowerCase();
    const status = filterStatus.value;

    filteredLicenses = licenses.filter(license => {
        return (software === '' || (license.software || '').toLowerCase().includes(software)) &&
               (type === '' || license.type === type) &&
               (key === '' || (license.key || '').toLowerCase().includes(key)) &&
               (status === '' || license.status === status);
    });
    
    if (sortState.column) {
        filteredLicenses.sort((a, b) => {
            let aValue = a[sortState.column];
            let bValue = b[sortState.column];
            
            if (aValue === undefined || aValue === null) aValue = '';
            if (bValue === undefined || bValue === null) bValue = '';
            
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortState.direction === 'asc' ? aValue.localeCompare(bValue, undefined, { sensitivity: 'base' }) : bValue.localeCompare(aValue, undefined, { sensitivity: 'base' });
            } else if (sortState.column === 'expirationDate') {
                const aDate = a.expirationDate ? a.expirationDate.seconds : null;
                const bDate = b.expirationDate ? b.expirationDate.seconds : null;
                return sortState.direction === 'asc' ? (aDate - bDate) : (bDate - aDate);
            }
            else {
                return sortState.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }
        });
    }

    displayPage();
}

function displayPage() {
    const startIndex = (currentPage - 1) * licensesPerPage;
    const endIndex = startIndex + licensesPerPage;
    const paginatedLicenses = filteredLicenses.slice(startIndex, endIndex);
    
    renderLicenses(paginatedLicenses);
    setupPagination();
    updateBulkActionUI();
    document.getElementById('select-all-checkbox').checked = false;
}

function setupPagination() {
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(filteredLicenses.length / licensesPerPage);
    if (totalPages <= 1) return;

    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&laquo;';
    prevButton.className = 'px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 pagination-button text-gray-400';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => { if (currentPage > 1) { currentPage--; displayPage(); } });
    paginationContainer.appendChild(prevButton);

    const maxPageButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
    if (endPage - startPage + 1 < maxPageButtons) {
        startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    if (startPage > 1) {
        const firstButton = document.createElement('button');
        firstButton.textContent = '1';
        firstButton.className = 'px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 pagination-button text-gray-400';
        firstButton.addEventListener('click', () => { currentPage = 1; displayPage(); });
        paginationContainer.appendChild(firstButton);
        if (startPage > 2) paginationContainer.insertAdjacentHTML('beforeend', `<span class="px-2 py-1 text-gray-400">...</span>`);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.className = 'px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 pagination-button text-gray-400';
        if (i === currentPage) pageButton.classList.add('active');
        pageButton.addEventListener('click', () => { currentPage = i; displayPage(); });
        paginationContainer.appendChild(pageButton);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) paginationContainer.insertAdjacentHTML('beforeend', `<span class="px-2 py-1 text-gray-400">...</span>`);
        const lastButton = document.createElement('button');
        lastButton.textContent = totalPages;
        lastButton.className = 'px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 pagination-button text-gray-400';
        lastButton.addEventListener('click', () => { currentPage = totalPages; displayPage(); });
        paginationContainer.appendChild(lastButton);
    }

    const nextButton = document.createElement('button');
    nextButton.innerHTML = '&raquo;';
    nextButton.className = 'px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 pagination-button text-gray-400';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; displayPage(); } });
    paginationContainer.appendChild(nextButton);
}

// --- BULK ACTIONS LOGIC ---
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const bulkDeleteButton = document.getElementById('bulk-delete-button');
const bulkEditButton = document.getElementById('bulk-edit-button');
const selectionInfo = document.getElementById('selection-info');

selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.license-checkbox').forEach(cb => { cb.checked = e.target.checked; });
    updateBulkActionUI();
});

function updateBulkActionUI() {
    const selectedIds = getSelectedLicenseIds();
    const hasSelection = selectedIds.length > 0;
    
    bulkDeleteButton.disabled = !hasSelection;
    bulkEditButton.disabled = !hasSelection;
    
    if (hasSelection) {
        selectionInfo.innerHTML = `<b>${selectedIds.length} lisensi terpilih.</b> Aksi hanya berlaku untuk item yang terlihat di halaman ini.`;
    } else {
        selectionInfo.textContent = `Pilih lisensi dari 'Daftar Lisensi' untuk melakukan aksi masal.`;
    }
}

function getSelectedLicenseIds() {
    return Array.from(document.querySelectorAll('.license-checkbox:checked')).map(cb => cb.dataset.id);
}

bulkDeleteButton.addEventListener('click', async () => {
    const idsToDelete = getSelectedLicenseIds();
    if (idsToDelete.length === 0) return;
    
    openDeleteConfirmModal(null, `Apakah Anda yakin ingin menghapus ${idsToDelete.length} lisensi terpilih?`, async () => {
        try {
            const batch = writeBatch(db);
            idsToDelete.forEach(id => {
                const licenseRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id);
                batch.delete(licenseRef);
            });
            await batch.commit();
            showToast(`${idsToDelete.length} lisensi berhasil dihapus.`);
            selectAllCheckbox.checked = false;
            closeDeleteConfirmModal();
        } catch (error) {
            console.error("Error bulk deleting: ", error);
            showToast(`Gagal menghapus lisensi: ${error.message}`, true);
        }
    });
});

// --- BULK EDIT MODAL LOGIC ---
function openBulkEditModal() {
    const selectedIds = getSelectedLicenseIds();
    if (selectedIds.length === 0) return;

    bulkEditInfo.textContent = `Anda akan mengedit ${selectedIds.length} lisensi. Centang properti yang ingin Anda ubah.`;
    bulkEditForm.reset(); 
    
    bulkEditModal.classList.remove('hidden');
    bulkEditModal.classList.add('flex');
    setTimeout(() => {
        bulkEditModalContent.classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeBulkEditModal() {
    bulkEditModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        bulkEditModal.classList.add('hidden');
        bulkEditModal.classList.remove('flex');
    }, 200);
}

bulkEditButton.addEventListener('click', openBulkEditModal);
bulkEditCancelButton.addEventListener('click', closeBulkEditModal);
bulkEditModal.addEventListener('click', (e) => {
    if (e.target === bulkEditModal) closeBulkEditModal();
});

bulkEditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idsToUpdate = getSelectedLicenseIds();
    if (idsToUpdate.length === 0) return;

    const updateData = {};
    if (document.getElementById('bulk-update-type-check').checked) {
        updateData.type = document.getElementById('bulk-type').value;
    }
    if (document.getElementById('bulk-update-status-check').checked) {
        updateData.status = document.getElementById('bulk-status').value;
    }
    updateData.lastUpdated = new Date();

    if (Object.keys(updateData).length <= 1) { // Check if only lastUpdated is present
        showToast("Tidak ada perubahan yang dipilih. Centang properti yang ingin diubah.", true);
        return;
    }

    try {
        const batch = writeBatch(db);
        idsToUpdate.forEach(id => {
            const licenseRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses', id);
            batch.update(licenseRef, updateData);
        });
        await batch.commit();
        showToast(`${idsToUpdate.length} lisensi berhasil diperbarui.`);
        selectAllCheckbox.checked = false;
        closeBulkEditModal(); 
    } catch (error) {
        console.error("Error bulk updating: ", error);
        showToast(`Gagal memperbarui lisensi: ${error.message}`, true);
    }
});

// --- DATA MANAGEMENT ---
const downloadJsonButton = document.getElementById('download-json-button');
const uploadJsonButton = document.getElementById('upload-json-button');
const jsonFileInput = document.getElementById('json-file-input');

downloadJsonButton.addEventListener('click', () => {
    if (licenses.length === 0) {
        showToast("Tidak ada data untuk diunduh.", true);
        return;
    }
    const dataStr = JSON.stringify(licenses.map(({id, lastUpdated, ...rest}) => {
        // Convert Firestore Timestamp to ISO string for better JSON representation
        if (rest.expirationDate && rest.expirationDate.toDate) {
            rest.expirationDate = rest.expirationDate.toDate().toISOString().split('T')[0];
        }
        return rest;
    }), null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'data_lisensi.json');
    linkElement.click();
    showToast("Data sedang diunduh...");
});

uploadJsonButton.addEventListener('click', () => jsonFileInput.click());

jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedLicenses = JSON.parse(event.target.result);
            if (!Array.isArray(importedLicenses)) {
                throw new Error("File JSON harus berisi sebuah array.");
            }
            
            openDeleteConfirmModal(null, `Anda akan mengimpor ${importedLicenses.length} lisensi. Lanjutkan?`, async () => {
                try {
                    const batch = writeBatch(db);
                    const licensesCollection = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'licenses');
                    importedLicenses.forEach(license => {
                        if (license.software && license.type && license.status) {
                             if (license.expirationDate) {
                                license.expirationDate = new Date(license.expirationDate);
                            }
                            license.lastUpdated = new Date();
                            const newLicenseRef = doc(licensesCollection);
                            batch.set(newLicenseRef, license);
                        }
                    });
                    await batch.commit();
                    showToast(`${importedLicenses.length} lisensi berhasil diimpor.`);
                    closeDeleteConfirmModal();
                } catch (error) {
                    console.error("Error importing JSON: ", error);
                    showToast(`Gagal mengimpor: ${error.message}`, true);
                } finally {
                    jsonFileInput.value = '';
                }
            });
        } catch (error) {
            console.error("Error parsing JSON: ", error);
            showToast(`Gagal mengimpor: ${error.message}`, true);
        } finally {
            jsonFileInput.value = '';
        }
    };
    reader.readAsText(file);
});

// Call handleSignIn() on page load to handle custom token auth
handleSignIn();
