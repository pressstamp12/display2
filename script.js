const SPREADSHEET_ID = '1atuDQUwMD7lud9omrIBCUjPx6fb0TEj0XfwBKqaRllM';
const API_KEY = 'AIzaSyBuqQ8CXTAcEvMvZpoqzz8f62zUWPCOb4M';
const RANGE_PART_NUMBER = 'TR 2000t!A:C'; // Ambil kolom A (Part Number), B (ID File), dan C (Instruksi)
const RANGE_E1 = 'TR 2000t!E1'; // Ambil Part Number di E1

// Daftar aktivitas yang TIDAK menampilkan tulisan "SEDANG PRODUKSI"
const NON_PRODUCTION_ACTIVITIES = ['WATARI', 'DANDORI', 'TRIAL', 'TPM', 'KS1', 'KS2'];

let previousPartNumber = null;

// Fungsi untuk memaksa masuk ke Full Screen
function enterFullScreen() {
    const elem = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(() => {});
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    }
}

// Pantau perubahan status Full Screen untuk menyembunyikan/menampilkan pelapis klik
function checkFullScreenState() {
    const catcher = document.getElementById('fullscreen-catcher');
    const isFull = document.fullscreenElement || document.webkitFullscreenElement || (window.innerHeight === screen.height);
    if (isFull) {
        catcher.classList.add('hidden');
    } else {
        catcher.classList.remove('hidden');
    }
}

document.addEventListener('fullscreenchange', checkFullScreenState);
document.addEventListener('webkitfullscreenchange', checkFullScreenState);
window.addEventListener('resize', checkFullScreenState);

// Saat pelapis diklik/disentuh di mana saja, langsung masuk Full Screen
document.getElementById('fullscreen-catcher').addEventListener('click', enterFullScreen);
document.getElementById('fullscreen-catcher').addEventListener('touchstart', enterFullScreen);

async function fetchPartNumber() {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(RANGE_E1)}?key=${API_KEY}`);
    if (!response.ok) throw new Error('Gagal mengambil data E1 dari Google Sheets');
    const data = await response.json();
    return data.values && data.values[0] ? data.values[0][0].trim() : null;
}

async function fetchDatabase() {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(RANGE_PART_NUMBER)}?key=${API_KEY}`);
    if (!response.ok) throw new Error('Gagal mengambil database dari Google Sheets');
    const data = await response.json();
    return data.values || [];
}

function showError(message) {
    const errorToast = document.getElementById("error-toast");
    if (message) {
        errorToast.textContent = message;
        errorToast.classList.remove("hidden");
    } else {
        errorToast.classList.add("hidden");
    }
}

async function updateDisplay() {
    try {
        const currentPartNumber = await fetchPartNumber();

        if (!currentPartNumber) {
            showError("Menunggu input Part Number di E1...");
            return;
        }

        if (currentPartNumber === previousPartNumber) {
            showError(null);
            return;
        }

        const database = await fetchDatabase();
        const match = database.find(row => row[0] && row[0].trim().toUpperCase() === currentPartNumber.toUpperCase());

        if (!match) {
            showError(`Data "${currentPartNumber}" tidak ditemukan di database.`);
            return;
        }

        const fileID = match[1] ? match[1].trim() : "";
        const instruction = match[2] ? match[2].trim() : "";

        // 1. Tampilkan file Google Drive di iframe
        const fileDisplay = document.getElementById("file-display");
        fileDisplay.innerHTML = "";
        if (fileID) {
            const iframe = document.createElement("iframe");
            iframe.src = `https://drive.google.com/file/d/${fileID}/preview`;
            iframe.allow = "autoplay; fullscreen";
            fileDisplay.appendChild(iframe);
        }

        // 2. Atur kemunculan bar atas "SEDANG PRODUKSI"
        const productionBanner = document.getElementById("production-banner");
        const productionText = document.getElementById("production-text");
        const isNonProduction = NON_PRODUCTION_ACTIVITIES.includes(currentPartNumber.toUpperCase());

        if (isNonProduction) {
            productionBanner.classList.add("hidden");
        } else {
            productionText.textContent = `SEDANG PRODUKSI : ${currentPartNumber}`;
            productionBanner.classList.remove("hidden");
        }

        // 3. Tampilkan instruksi tambahan jika ada di Kolom C
        const instructionDisplay = document.getElementById("instruction");
        if (instruction) {
            instructionDisplay.textContent = instruction;
            instructionDisplay.classList.remove("hidden");
        } else {
            instructionDisplay.classList.add("hidden");
        }

        previousPartNumber = currentPartNumber;
        showError(null);

    } catch (error) {
        console.error(error.message);
        showError(`Koneksi / Sistem: ${error.message}`);
    }
}

// Periksa perubahan setiap 5 detik
setInterval(updateDisplay, 5000);

// Panggil fungsi sekali saat halaman dimuat
window.onload = () => {
    checkFullScreenState();
    updateDisplay();
};
