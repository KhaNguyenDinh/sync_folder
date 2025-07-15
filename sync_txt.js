const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const baseFolder ='C:\\FTP';
const API_URI = 'C:\\Users\\saigonvrg\\FTP\\FTP_COPY';

const scanInterval = 60 * 60 * 1000; // Mỗi 1 giờ quét thư mục con
let companies = []; // Danh sách thư mục cấp 1
let watchers = new Map();
let fileQueue = [];
let processedFiles = new Set();

function formatDateTime(date) {
    return date.toLocaleString('vi-VN', { hour12: false });
}

// ✅ Nạp thư mục cấp 1 duy nhất lúc khởi động
function loadCompaniesOnce() {
    if (!fs.existsSync(baseFolder)) fs.mkdirSync(baseFolder, { recursive: true });
    companies = fs.readdirSync(baseFolder, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(baseFolder, d.name));
    console.log(`[ ${formatDateTime(new Date())} ] ✅ Đã nạp ${companies.length} thư mục cấp 1 cố định`);
}

// ✅ Tìm thư mục con sâu nhất và mới nhất trong 1 thư mục
function findNewestDeepSubDir(base) {
    let newestDir = null;
    let newestTime = 0;

    function traverse(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(dir, entry.name);
                const stats = fs.statSync(fullPath);

                if (stats.mtimeMs > newestTime) {
                    newestTime = stats.mtimeMs;
                    newestDir = fullPath;
                }

                traverse(fullPath);
            }
        }
    }

    traverse(base);
    return newestDir;
}

// ✅ Theo dõi thư mục con mới nhất
function setupLeafWatcher(dir) {
    if (watchers.has(dir)) return;

    const watcher = chokidar.watch(dir, {
        ignored: [/^.*\.(?!txt$)[^.]+$/, /(^|[\/\\])\../],
        persistent: true,
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 }
    });

    watcher.on('add', (filePath) => {
        if (path.extname(filePath) === '.txt') {
            fileQueue.push(filePath);
            uploadFiles();
        }
    });

    watchers.set(dir, watcher);
}

// ✅ Copy file sang API_URI
function uploadFiles(batchSize = 100) {
    if (fileQueue.length === 0) return;
    const now = new Date();
    const batch = fileQueue.splice(0, batchSize);

    for (const filePath of batch) {
        if (processedFiles.has(filePath)) continue;

        try {
            const destPath = path.join(API_URI, path.relative(baseFolder, filePath));
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.copyFileSync(filePath, destPath);
            console.log(`[ ${formatDateTime(now)} ] ✅ Copy ${filePath}`);
            processedFiles.add(filePath);
        } catch (err) {
            console.warn(`❌ Copy lỗi ${filePath}: ${err.message}`);
        }
    }

    if (fileQueue.length > 0) {
        setTimeout(() => uploadFiles(batchSize), 500);
    }
}


// ✅ Quét và theo dõi thư mục con mới nhất
function scanAndUpdateSubdirs() {
    const now = new Date();
    const newestDirs = [];

    companies.forEach((company, index) => {
        const newest = findNewestDeepSubDir(company);
        const currentIndex = index + 1;
        const total = companies.length;

        if (newest) {
            newestDirs.push(newest);
            console.log(`📡 [${formatDateTime(now)}] ➕ [${currentIndex}/${total}]👉 \x1b[32m${newest}\x1b[0m`);
        } else {
            console.log(`⚠️ [${formatDateTime(now)}] ⚠️ [${currentIndex}/${total}] Không tìm thấy thư mục con trong: ${company}`);
        }
    });

    const activeSet = new Set(newestDirs);

    watchers.forEach((watcher, dir) => {
        if (!activeSet.has(dir)) {
            watcher.close();
            watchers.delete(dir);
        }
    });

    newestDirs.forEach(dir => {
        if (!watchers.has(dir)) {
            setupLeafWatcher(dir);
        }
    });
}

// 🟢 Bắt đầu
loadCompaniesOnce();               // Chỉ 1 lần khi khởi động
scanAndUpdateSubdirs();           // Lần đầu quét thư mục con
setInterval(scanAndUpdateSubdirs, scanInterval); // Quét mỗi giờ

// ⏰ Khung giờ 00h–00h30: cập nhật thư mục con
setInterval(() => {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    if (h === 0 && m >= 0 && m <= 30) {
        scanAndUpdateSubdirs();
    }
}, 5 * 60 * 1000);
