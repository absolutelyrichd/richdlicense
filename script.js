// === Firebase Import ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// === Firebase Config ===
const firebaseConfig = {
  apiKey: "AIzaSyBmTmNdBlPc5nroktbiGwFMAkx1Oi6zTBo",
  authDomain: "richdlicense.firebaseapp.com",
  projectId: "richdlicense",
  storageBucket: "richdlicense.firebasestorage.app",
  messagingSenderId: "150392102612",
  appId: "1:150392102612:web:3c784159c948d18e84a541",
  measurementId: "G-TC8B5GX446"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// === DOM Elements ===
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");

const licenseList = document.getElementById("license-list");
const addBtn = document.getElementById("add-license");
const modal = document.getElementById("license-modal");
const cancelModal = document.getElementById("cancel-modal");
const licenseForm = document.getElementById("license-form");

const totalPriceEl = document.getElementById("total-price");
let statusChart;

// === State ===
let currentUser = null;
let licenses = [];

// === Auth ===
loginButton.addEventListener("click", () => {
  signInWithPopup(auth, provider).catch(err => alert(err.message));
});
logoutButton.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userPhoto.src = user.photoURL;
    userName.textContent = user.displayName;
    listenLicenses();
  } else {
    currentUser = null;
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
});

// === Firestore CRUD ===
function listenLicenses() {
  const ref = collection(db, "licenses", currentUser.uid, "userLicenses");
  onSnapshot(ref, (snap) => {
    licenses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderLicenses();
    updateStats();
  });
}

function renderLicenses() {
  licenseList.innerHTML = "";
  if (licenses.length === 0) {
    licenseList.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada data</td></tr>`;
    return;
  }
  licenses.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="p-2">${l.software}</td>
      <td class="p-2">${l.licenseKey}</td>
      <td class="p-2">${l.expiry}</td>
      <td class="p-2 text-yellow-300">Rp ${l.price || 0}</td>
      <td class="p-2">${l.status}</td>
      <td class="p-2">
        <button class="edit bg-blue-500 px-2 py-1 rounded mr-2" data-id="${l.id}">Edit</button>
        <button class="del bg-red-500 px-2 py-1 rounded" data-id="${l.id}">Hapus</button>
      </td>
    `;
    licenseList.appendChild(tr);
  });

  document.querySelectorAll(".edit").forEach(btn => btn.onclick = () => openModal(btn.dataset.id));
  document.querySelectorAll(".del").forEach(btn => btn.onclick = () => deleteLicense(btn.dataset.id));
}

async function saveLicense(e) {
  e.preventDefault();
  const id = document.getElementById("license-id").value;
  const data = {
    software: document.getElementById("software").value,
    licenseKey: document.getElementById("licenseKey").value,
    expiry: document.getElementById("expiry").value,
    price: parseInt(document.getElementById("price").value) || 0,
    status: document.getElementById("status").value
  };
  const ref = collection(db, "licenses", currentUser.uid, "userLicenses");
  if (id) {
    await updateDoc(doc(ref, id), data);
  } else {
    await addDoc(ref, data);
  }
  closeModal();
}

async function deleteLicense(id) {
  if (!confirm("Hapus lisensi ini?")) return;
  const ref = collection(db, "licenses", currentUser.uid, "userLicenses");
  await deleteDoc(doc(ref, id));
}

// === Modal ===
function openModal(id = null) {
  modal.classList.remove("hidden");
  if (id) {
    const l = licenses.find(x => x.id === id);
    document.getElementById("modal-title").textContent = "Edit Lisensi";
    document.getElementById("license-id").value = l.id;
    document.getElementById("software").value = l.software;
    document.getElementById("licenseKey").value = l.licenseKey;
    document.getElementById("expiry").value = l.expiry;
    document.getElementById("price").value = l.price;
    document.getElementById("status").value = l.status;
  } else {
    document.getElementById("modal-title").textContent = "Tambah Lisensi";
    licenseForm.reset();
    document.getElementById("license-id").value = "";
  }
}
function closeModal() { modal.classList.add("hidden"); }

addBtn.addEventListener("click", () => openModal());
cancelModal.addEventListener("click", closeModal);
licenseForm.addEventListener("submit", saveLicense);

// === Statistik ===
function updateStats() {
  const total = licenses.reduce((sum, l) => sum + (l.price || 0), 0);
  totalPriceEl.textContent = "Rp " + total.toLocaleString("id-ID");

  const statusCount = licenses.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  if (!statusChart) {
    statusChart = new Chart(document.getElementById("status-chart"), {
      type: "pie",
      data: { labels: [], datasets: [{ data: [], backgroundColor: ["#22c55e", "#f87171", "#64748b"] }] }
    });
  }
  statusChart.data.labels = Object.keys(statusCount);
  statusChart.data.datasets[0].data = Object.values(statusCount);
  statusChart.update();
}

// === Import/Export ===
document.getElementById("download-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(licenses)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "licenses.json";
  a.click();
});

document.getElementById("upload-json-btn").addEventListener("click", () => document.getElementById("upload-json").click());
document.getElementById("upload-json").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  const ref = collection(db, "licenses", currentUser.uid, "userLicenses");
  for (const l of data) {
    await addDoc(ref, l);
  }
});
