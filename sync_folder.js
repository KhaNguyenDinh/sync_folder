const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const baseFolder ='C:\\FTP';
const API_URI = 'C:\\Users\\saigonvrg\\FTP\\FTP_COPY';

const scanInterval = 60* 60 * 1000; // 1 giây
let companies = [];
let watchers = new Map();
let fileQueue = [];
let processedFiles = new Set();
let lastWatchedSubdir = {}; // Ghi nhớ thư mục được theo dõi gần nhất

function formatDateTime(date) {
    return date.toLocaleString('vi-VN', { hour12: false });
}

function loadCompaniesOnce() {
    if (!fs.existsSync(baseFolder)) fs.mkdirSync(baseFolder, { recursive: true });
    companies = fs.readdirSync(baseFolder, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(baseFolder, d.name));
    console.log(`[ ${formatDateTime(new Date())} ] ✅ Đã nạp ${companies.length} thư mục cấp 1`);
}

function getAllSubDirs(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const fullPath = path.join(dir, entry.name);
            const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
            const hasSubDir = subEntries.some(e => e.isDirectory());

            if (!hasSubDir) {
                results.push(fullPath); // Thư mục lá
            } else {
                results = results.concat(getAllSubDirs(fullPath)); // Đệ quy sâu thêm
            }
        }
    }
    return results;
}


function getNewestDir(dirs) {
    return dirs.reduce((newest, current) => {
        const currentTime = fs.statSync(current).mtimeMs;
        const newestTime = newest ? fs.statSync(newest).mtimeMs : 0;
        return currentTime > newestTime ? current : newest;
    }, null);
}

function getAllTxtFiles(dirPath) {
    return fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(item => item.isFile() && path.extname(item.name) === '.txt')
        .map(item => path.join(dirPath, item.name));
}

function setupLeafWatcher(dir) {
    if (watchers.has(dir)) return;

    const watcher = chokidar.watch(dir, {
        ignored: filePath => path.extname(filePath) !== '.txt',
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 }
    });

    watcher.on('add', (filePath) => {
        fileQueue.push(filePath);
        uploadFiles();
    });

    watchers.set(dir, watcher);
}

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
            processedFiles.add(filePath);
            console.log(`[ ${formatDateTime(now)} ] ✅ Copy ${filePath}`);
        } catch (err) {
            console.warn(`❌ Lỗi copy ${filePath}: ${err.message}`);
        }
    }

    if (fileQueue.length > 0) {
        setTimeout(() => uploadFiles(batchSize), 500);
    }
}

function scanAndUpdateSubdirs() {
    const nowText = formatDateTime(new Date());
    const activeWatchDirs = new Set();

    // Nếu thư mục đang theo dõi không còn tồn tại -> reset theo dõi
    for (const company of companies) {
        const currentDir = lastWatchedSubdir[company];
        if (currentDir && !fs.existsSync(currentDir)) {
            console.warn(`⚠️ [${nowText}] Mất thư mục đang theo dõi: ${currentDir}`);
            delete lastWatchedSubdir[company]; // Xóa để quét lại từ đầu
        }
    }   
    
    companies.forEach((company, index) => {
        const allSubDirs = getAllSubDirs(company);
        const newestDir = getNewestDir(allSubDirs);
        const lastWatched = lastWatchedSubdir[company];

        if (!lastWatched) {
            // Lần đầu: chỉ theo dõi, không copy
            lastWatchedSubdir[company] = newestDir;
            if (newestDir) {
                // console.log(`📡 [${nowText}] ➕ Theo dõi thư mục đầu tiên trong ${company} (${index + 1}/${companies.length}):\n    👉 \x1b[32m${newestDir}\x1b[0m`);
                console.log(`📡 [${nowText}] (${index + 1}/${companies.length}):👉 \x1b[32m${newestDir}\x1b[0m`);
                
                activeWatchDirs.add(newestDir);
            }
            return;
        }

        const lastTime = fs.existsSync(lastWatched) ? fs.statSync(lastWatched).mtimeMs : 0;
        const newDirs = allSubDirs.filter(dir => fs.statSync(dir).mtimeMs > lastTime);

        for (const newDir of newDirs) {
            const txtFiles = getAllTxtFiles(newDir);
            fileQueue.push(...txtFiles);
        }

        if (newestDir && newestDir !== lastWatched) {
            lastWatchedSubdir[company] = newestDir;
            console.log(`📡 [${nowText}] 🆕 Đổi theo dõi mới trong ${company} (${index + 1}/${companies.length}):\n    👉 \x1b[32m${newestDir}\x1b[0m`);
            activeWatchDirs.add(newestDir);
        } else {
            activeWatchDirs.add(lastWatched);
        }
    });

    // Xóa watcher không còn cần thiết
    watchers.forEach((watcher, dir) => {
        if (!activeWatchDirs.has(dir)) {
            watcher.close();
            watchers.delete(dir);
        }
    });

    // Tạo watcher mới
    activeWatchDirs.forEach(dir => {
        if (!watchers.has(dir)) {
            setupLeafWatcher(dir);
        }
    });

    uploadFiles();
}

// ──────────────── Khởi động ────────────────
loadCompaniesOnce();
scanAndUpdateSubdirs();
setInterval(scanAndUpdateSubdirs, scanInterval);

// Quét lại mỗi ngày từ 0h đến 0h10
//setInterval(() => {
//   const now = new Date();
//    if (now.getHours() === 0 && now.getMinutes() <= 10) {
//        scanAndUpdateSubdirs();
//    }
//}, 5* 60 * 1000);

// Tự động quét lại toàn bộ thư mục mỗi 10 phút
setInterval(() => {
    const now = new Date();
    console.log(`[${formatDateTime(now)}] 🔁 reloat`);
    scanAndUpdateSubdirs();
}, 60 * 60 * 1000); // ms
