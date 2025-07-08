const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const FormData = require("form-data");
const axios = require("axios");
// thu muc chua file txt

const baseFolder = 'D:\\SAIGONVRG\\code\\DATA\\TXT';
const API_URI = 'D:\\SAIGONVRG\\code\\DATA\\TXT_COPY';

//const API_URI = 'https://em.appcuatoi.com/api/file_post';

const activeWindow = 24*60*60*1000; // 24h kiem tra 1 ngay ko co file moi -> ko theo doi nua 24*60*60*1000
const scanInterval = 5*1000; // 10 phút ktra 1 lan xem co thu muc moi khong 10*60*1000*
// khi load thu muc thi file.txt se tu dong load muon
let processedFiles = new Set();
let watchers = new Map(); // Watcher cho thư mục lá
let leafCache = new Set(); // Cache danh sách thư mục lá
let fileQueue = [];

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Tháng từ 0-11, cộng 1 và thêm 0
    const day = String(date.getDate()).padStart(2, '0'); // Ngày, thêm 0 nếu cần
    const hours = String(date.getHours()).padStart(2, '0'); // Giờ, thêm 0 nếu cần
    const minutes = String(date.getMinutes()).padStart(2, '0'); // Phút, thêm 0 nếu cần
    const seconds = String(date.getSeconds()).padStart(2, '0'); // Giây (0-59), thêm 0 nếu cần
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}
// Tìm thư mục lá
function findLeafDirectories(dirPath, depth = 0, maxDepth = 4) {
    if (depth > maxDepth) return [];
    const leafDirs = [];
    const dirContents = fs.readdirSync(dirPath, { withFileTypes: true });
    let hasSubdirectories = false;
    for (const item of dirContents) {
        if (item.isDirectory()) {
            hasSubdirectories = true;
            const subDirs = findLeafDirectories(path.join(dirPath, item.name), depth + 1, maxDepth);
            leafDirs.push(...subDirs);
        }
    }
    if (!hasSubdirectories) leafDirs.push(dirPath);
    return leafDirs;
}

// Lấy danh sách company
function getCompanies() {
    if (!fs.existsSync(baseFolder)) {
        fs.mkdirSync(baseFolder, { recursive: true });
        return [];
    }
    return fs.readdirSync(baseFolder, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(baseFolder, dirent.name));
}



// Cập nhật danh sách thư mục lá và active thư mục -> http
function updateLeafDirs(companies) {
    const newLeafDirs = new Set();
    companies.forEach(company => {
        const leafDirs = findLeafDirectories(company);
        leafDirs.forEach(dir => newLeafDirs.add(dir));
    });

    // Phát hiện thư mục lá mới
    const addedLeafDirs = [];
    newLeafDirs.forEach(dir => {
        if (!leafCache.has(dir)) {
            addedLeafDirs.push(dir);
            leafCache.add(dir);
        }
    });

    // Tìm thư mục active
    const activeDirs = [];
    newLeafDirs.forEach(dir => {
        const stats = fs.statSync(dir);
        if (Date.now() - stats.mtimeMs <= activeWindow) {
            activeDirs.push(dir);
        }
    });

    return { addedLeafDirs, activeDirs };
}

// Thiết lập watcher cho thư mục lá
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
            // console.log(`File mới được tạo: ${filePath}`);

            // processedFiles.add(filePath);
            fileQueue.push(filePath);
            uploadFiles();
            // Thêm logic xử lý (ví dụ: upload FTP)

        }
    });

    watchers.set(dir, watcher);
}

// Lấy toàn bộ file trong thư mục
function getAllFilesInDir(dirPath) {
    const files = [];
    const dirContents = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of dirContents) {
        const fullPath = path.join(dirPath, item.name);
        if (item.isFile() && path.extname(fullPath) === '.txt') {
            files.push(fullPath);
        }
    }
    return files;
}

function processNewLeafDirsAndUpdateWatchers(addedLeafDirs, activeDirs) {
    const now = new Date();
    // Xử lý thư mục lá mới: Lấy toàn bộ file hiện có
    addedLeafDirs.forEach(dir => {
        const files = getAllFilesInDir(dir);
        if (files.length > 0) {
            // console.log(`Thư mục mới ${dir} có ${files.length} file:`);
            files.forEach(filePath => {
                fileQueue.push(filePath);
                uploadFiles();
            });
        } else {
            // console.log(`Thư mục mới ${dir} không có file nào.`);
        }
    });

    // Cập nhật danh sách watcher
    const activeSet = new Set(activeDirs);
    watchers.forEach((watcher, dir) => {
        if (!activeSet.has(dir)) {
            watcher.close();
            watchers.delete(dir);
        }
    });

    activeDirs.forEach(dir => setupLeafWatcher(dir));
    console.log(`[ ${formatDateTime(now)} ] Hiện tại theo dõi ${watchers.size} thư mục active`, watchers.keys());
}

let init = 1;
// Quét và xử lý định kỳ
function scanAndUpdate() {
    const companies = getCompanies();
    const { addedLeafDirs, activeDirs } = updateLeafDirs(companies);

    if (addedLeafDirs.length > 0) {
        // console.log(`Phát hiện ${addedLeafDirs.length} thư mục mới:`, addedLeafDirs);
    }

    if (init) {
        init = 0;
        processNewLeafDirsAndUpdateWatchers([], activeDirs);
    } else {
        processNewLeafDirsAndUpdateWatchers(addedLeafDirs, activeDirs);
    }
}

// Cập nhật danh sách thư mục lá và active thư mục -> thư mục
async function uploadFiles() {
    const now = new Date();
    const filesToUpload = [...fileQueue];
    fileQueue = []; // Reset hàng đợi

    for (const filePath of filesToUpload) {
        try {
            // Đảm bảo thư mục đích tồn tại
            const destDir = path.dirname(path.join(API_URI, path.relative(baseFolder, filePath)));
            fs.mkdirSync(destDir, { recursive: true });

            // Sao chép file sang thư mục đích
            const destPath = path.join(API_URI, path.relative(baseFolder, filePath));

            fs.copyFileSync(filePath, destPath);
            console.log(`[ ${formatDateTime(now)} ] Đã copy ${filePath} sang ${destPath}`);
        } catch (err) {
            // console.error(`Lỗi copy ${filePath}:`, err.message);
        }
    }
}


// async function uploadFiles() {
//     const filesToUpload = [...fileQueue];
//     fileQueue = []; // Reset hàng đợi

//     const uploadPromises = filesToUpload.map(async (filePath) => {
//         const form = new FormData();
//         form.append('file', fs.createReadStream(filePath));
//         form.append('name', filePath.replace(baseFolder, ''));


//         let retries = 300;
//         for (let attempt = 1; attempt <= retries; attempt++) {
//             try {
//                 const res = await axios.post(API_URI, form, {
//                     headers: form.getHeaders()
//                 });
//                 console.log(`Đã upload ${filePath}`);
//                 break;
//             } 
//             catch (err) {
//                 console.error(`Lỗi upload ${filePath} (lần ${attempt}):`, err.message);
//                 if (attempt === retries) console.error(`Bỏ qua ${filePath}`);
//                 await new Promise(resolve => setTimeout(resolve, 100000));
//             }
//         }
//     });

//     await Promise.all(uploadPromises);
// }


// Khởi động
scanAndUpdate();
setInterval(scanAndUpdate, scanInterval);

// 1p kiểm tra 1 lần khi thời gian là 00h liên tục trong 7 phút
setInterval(() => {
    // Lấy thời gian hiện tại
    const now = new Date();
    const hours = now.getHours();   // Giờ (0-23)
    const minutes = now.getMinutes(); // Phút (0-59)

    // Kiểm tra nếu thời gian hiện tại nằm trong khoảng 00:00 - 00:07
    if (hours === 0 && minutes >= 0 && minutes <= 7) {
        scanAndUpdate();
    }
}, 1000 * 60)

// console.log(`Bắt đầu theo dõi thư mục: ${baseFolder}`);
//pm2 start app.js --name your_app_name
