const SPREADSHEET_ID = '1atuDQUwMD7lud9omrIBCUjPx6fb0TEj0XfwBKqaRllM';
const API_KEY = 'AIzaSyBuqQ8CXTAcEvMvZpoqzz8f62zUWPCOb4M';
const RANGE_PART_NUMBER = 'TR 2000t!A:C'; // Kolom A (Part Number), B (ID Drive), C (Keterangan)
const RANGE_LIVE_DATA = 'TR 2000t!E1:F7'; // E1 (Part/Aktivitas Aktif) + E2:F7 (Label & Angka Performance)

// Cadangan daftar aktivitas non-produksi jika kolom C kebetulan kosong
const NON_PRODUCTION_ACTIVITIES = ['WATARI', 'DANDORI', 'TRIAL', 'TPM', 'KS1', 'KS2', '5S'];

// Label bawaan jika sel E2:E7 kosong
const DEFAULT_KPI_LABELS = ['WH', 'DANDORI', 'DIES/FINGER', 'MACHINE', 'OTHER', 'AVAILABILITY'];

let previousFileID = null;

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

// Konversi angka dari Google Sheets (mendukung angka mentah UNFORMATTED_VALUE maupun teks format ID/US)
function parseSheetNumber(raw) {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

    const str = String(raw).trim();
    if (!str || str === '-') return null;

    // Bersihkan karakter selain angka, koma, titik, dan minus
    let cleaned = str.replace(/[^0-9,.-]/g, '');
    if (!cleaned) return null;

    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');

    if (hasComma && hasDot) {
        // Pemisah yang paling kanan dianggap sebagai desimal
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (hasDot && !str.includes('%')) {
        // Tangani format pemisah ribuan Indonesia (contoh: 4.161 atau 12.500)
        if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
            cleaned = cleaned.replace(/\./g, '');
        }
    } else if (hasComma) {
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length === 3 && !str.includes('%') && parts[0].length <= 3 && parts[0] !== '0') {
            cleaned = cleaned.replace(',', '');
        } else {
            cleaned = cleaned.replace(',', '.');
        }
    }

    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
}

// Format angka menit (pakai pemisah ribuan koma agar tidak tertukar dengan desimal)
function formatMinutes(num) {
    if (num === null || !Number.isFinite(num)) return '-';
    const rounded = Math.round(num * 10) / 10;
    return rounded.toLocaleString('en-US', {
        minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
        maximumFractionDigits: 1
    });
}

// Format angka persentase dengan 1 angka di belakang koma
function formatPercent(num) {
    if (num === null || !Number.isFinite(num)) return '0.0%';
    return `${num.toFixed(1)}%`;
}

// Ambil database (A:C) dan data live (E1:F7) sekaligus dalam 1 request
// valueRenderOption=UNFORMATTED_VALUE memastikan angka seperti 4.161 terbaca murni sebagai 4161
async function fetchSheetData() {
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet` +
        `?ranges=${encodeURIComponent(RANGE_PART_NUMBER)}` +
        `&ranges=${encodeURIComponent(RANGE_LIVE_DATA)}` +
        `&valueRenderOption=UNFORMATTED_VALUE` +
        `&key=${API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Gagal mengambil data dari Google Sheets');

    const data = await response.json();
    const valueRanges = data.valueRanges || [];

    return {
        database: valueRanges[0] && valueRanges[0].values ? valueRanges[0].values : [],
        liveRows: valueRanges[1] && valueRanges[1].values ? valueRanges[1].values : []
    };
}

// Perbarui seluruh panel performance dari range E2:F7
function renderPerformance(liveRows) {
    const rawValues = [];

    for (let i = 0; i < 6; i++) {
        const row = liveRows[i + 1] || []; // Index 1..6 = Baris 2..7 di Sheet
        const labelText = row[0] !== undefined && String(row[0]).trim() ? String(row[0]).trim() : DEFAULT_KPI_LABELS[i];
        const rawVal = row[1] !== undefined ? row[1] : '';
        rawValues.push(rawVal);

        const labelEl = document.getElementById(`label-${i}`);
        if (labelEl) labelEl.textContent = labelText;
    }

    // Parsing angka menit: F2=WH, F3=DANDORI, F4=DIES/FINGER, F5=MACHINE, F6=OTHER
    const wh = parseSheetNumber(rawValues[0]);
    const losses = [
        parseSheetNumber(rawValues[1]) ?? 0,
        parseSheetNumber(rawValues[2]) ?? 0,
        parseSheetNumber(rawValues[3]) ?? 0,
        parseSheetNumber(rawValues[4]) ?? 0
    ];

    const hasWh = wh !== null && wh > 0;
    const totalLossMin = losses.reduce((sum, v) => sum + Math.max(0, v), 0);

    // Tampilkan nilai WH
    document.getElementById('value-0').textContent = wh !== null ? formatMinutes(wh) : '-';

    // Hitung & tampilkan 4 kategori Loss Time beserta % terhadap WH
    const lossPcts = [];
    for (let i = 0; i < 4; i++) {
        const val = parseSheetNumber(rawValues[i + 1]);
        const safeVal = val !== null ? Math.max(0, val) : 0;
        const pct = hasWh ? (safeVal / wh) * 100 : 0;
        lossPcts.push(pct);

        document.getElementById(`value-${i + 1}`).textContent = val !== null ? formatMinutes(val) : '-';
        document.getElementById(`pct-${i + 1}`).textContent = formatPercent(pct);

        const barEl = document.getElementById(`bar-${i + 1}`);
        if (barEl) {
            barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        }
    }

    const totalLossPct = hasWh ? (totalLossMin / wh) * 100 : 0;

    // Parsing AVAILABILITY dari F7 (fallback otomatis dari 100% - Total Loss% jika F7 kosong)
    const rawAvail = rawValues[5];
    const rawAvailStr = String(rawAvail ?? '').trim();
    let availPct = parseSheetNumber(rawAvail);

    if (availPct !== null) {
        // Pada UNFORMATTED_VALUE, persentase Sheets (mis. 93,17% atau 100%) dikirim sebagai 0.9317 atau 1
        if (!rawAvailStr.includes('%') && availPct >= 0 && availPct <= 1) {
            availPct = availPct * 100;
        }
    } else if (hasWh) {
        availPct = Math.max(0, 100 - totalLossPct);
    }

    // Update tampilan nilai & warna status AVAILABILITY
    const availCard = document.getElementById('availability-card');
    const availValEl = document.getElementById('value-5');
    const availBadgeEl = document.getElementById('avail-badge');

    availCard.classList.remove('status-good', 'status-warn', 'status-bad');

    if (availPct !== null) {
        const clampedAvail = Math.max(0, Math.min(100, availPct));
        availValEl.textContent = formatPercent(clampedAvail);

        if (clampedAvail >= 85) {
            availCard.classList.add('status-good');
            availBadgeEl.textContent = 'ON TARGET';
        } else if (clampedAvail >= 75) {
            availCard.classList.add('status-warn');
            availBadgeEl.textContent = 'PERHATIAN';
        } else {
            availCard.classList.add('status-bad');
            availBadgeEl.textContent = 'DI BAWAH TARGET';
        }

        // Hitung menit running berdasarkan WH - Total Loss
        const runningMin = hasWh ? Math.max(0, wh - totalLossMin) : null;
        document.getElementById('running-minutes').textContent =
            runningMin !== null ? `${formatMinutes(runningMin)} minutes` : '- minutes';
        document.getElementById('total-loss-summary').textContent =
            `${formatMinutes(totalLossMin)} minutes (${formatPercent(totalLossPct)})`;

        // Update bar komposisi 100% WH (Avail + Dandori + Dies + Machine + Other = 100%)
        const rawSegments = [clampedAvail, ...lossPcts];
        const sumSegments = rawSegments.reduce((a, b) => a + b, 0);
        const normSegments = sumSegments > 0
            ? rawSegments.map(v => (v / sumSegments) * 100)
            : [0, 0, 0, 0, 0];

        document.getElementById('seg-avail').style.width = `${normSegments[0]}%`;
        document.getElementById('seg-dandori').style.width = `${normSegments[1]}%`;
        document.getElementById('seg-dies').style.width = `${normSegments[2]}%`;
        document.getElementById('seg-machine').style.width = `${normSegments[3]}%`;
        document.getElementById('seg-other').style.width = `${normSegments[4]}%`;

        document.getElementById('comp-avail-text').textContent = `Avail: ${formatPercent(clampedAvail)}`;
        document.getElementById('comp-loss-text').textContent = `Loss: ${formatPercent(totalLossPct)}`;
    } else {
        availCard.classList.add('status-good');
        availValEl.textContent = '-';
        availBadgeEl.textContent = 'MENUNGGU DATA';
        document.getElementById('running-minutes').textContent = '- minutes';
        document.getElementById('total-loss-summary').textContent = '- minutes (0.0%)';
        document.getElementById('seg-avail').style.width = '0%';
        document.getElementById('seg-dandori').style.width = '0%';
        document.getElementById('seg-dies').style.width = '0%';
        document.getElementById('seg-machine').style.width = '0%';
        document.getElementById('seg-other').style.width = '0%';
        document.getElementById('comp-avail-text').textContent = 'Avail: -';
        document.getElementById('comp-loss-text').textContent = 'Loss: -';
    }
}

function showError(message) {
    const errorToast = document.getElementById('error-toast');
    if (message) {
        errorToast.textContent = message;
        errorToast.classList.remove('hidden');
    } else {
        errorToast.classList.add('hidden');
    }
}

async function updateDisplay() {
    try {
        const { database, liveRows } = await fetchSheetData();

        // 1. Selalu perbarui panel performance (E2:F7) setiap 5 detik
        renderPerformance(liveRows);

        // 2. Baca Part Number / aktivitas aktif dari E1
        const currentPartNumber =
            liveRows[0] && liveRows[0][0] !== undefined && String(liveRows[0][0]).trim()
                ? String(liveRows[0][0]).trim()
                : null;

        if (!currentPartNumber) {
            showError('Menunggu input Part Number di E1...');
            return;
        }

        const match = database.find(
            row => row[0] !== undefined && String(row[0]).trim().toUpperCase() === currentPartNumber.toUpperCase()
        );

        if (!match) {
            showError(`Data "${currentPartNumber}" tidak ditemukan di database.`);
            return;
        }

        const fileID = match[1] !== undefined ? String(match[1]).trim() : '';
        const keterangan = match[2] !== undefined ? String(match[2]).trim() : '';
        const normalizedKeterangan = keterangan.toUpperCase();

        // 3. Muat ulang iframe HANYA jika ID file Google Drive berubah
        if (fileID !== previousFileID) {
            const fileDisplay = document.getElementById('file-display');
            fileDisplay.innerHTML = '';
            if (fileID) {
                const iframe = document.createElement('iframe');
                iframe.src = `https://drive.google.com/file/d/${fileID}/preview`;
                iframe.allow = 'autoplay; fullscreen';
                fileDisplay.appendChild(iframe);
            }
            previousFileID = fileID;
        }

        // 4. Sembunyikan bar atas "SEDANG PRODUKSI" jika Kolom C = NON PRODUKSI (atau masuk daftar cadangan)
        const productionBanner = document.getElementById('production-banner');
        const productionText = document.getElementById('production-text');
        const isNonProduction =
            normalizedKeterangan.includes('NON PRODUKSI') ||
            NON_PRODUCTION_ACTIVITIES.includes(currentPartNumber.toUpperCase());

        if (isNonProduction) {
            productionBanner.classList.add('hidden');
        } else {
            productionText.textContent = `SEDANG PRODUKSI : ${currentPartNumber}`;
            productionBanner.classList.remove('hidden');
        }

        // 5. Tampilkan keterangan Kolom C di bawah visualisasi
        const instructionDisplay = document.getElementById('instruction');
        instructionDisplay.classList.remove('status-non-produksi', 'status-produksi');

        if (keterangan) {
            instructionDisplay.textContent = keterangan;
            if (normalizedKeterangan.includes('NON PRODUKSI')) {
                instructionDisplay.classList.add('status-non-produksi');
            } else if (normalizedKeterangan.includes('PRODUKSI')) {
                instructionDisplay.classList.add('status-produksi');
            }
            instructionDisplay.classList.remove('hidden');
        } else {
            instructionDisplay.classList.add('hidden');
        }

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
