// png2ico.js — 将 icon.png 转换为 icon.ico（ICO 可直接内嵌 PNG 数据）
const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, 'icon.png');
const icoPath = path.join(__dirname, 'icon.ico');

const png = fs.readFileSync(pngPath);

// ICO 文件格式：
//   6 字节  ICONDIR 头
//  16 字节  ICONDIRENTRY（每张图一条）
//   N 字节  图片数据（直接嵌入 PNG）
const HEADER_SIZE   = 6;
const DIR_ENTRY_SIZE = 16;
const DATA_OFFSET   = HEADER_SIZE + DIR_ENTRY_SIZE; // 22

// ICONDIR
const header = Buffer.alloc(HEADER_SIZE);
header.writeUInt16LE(0, 0); // Reserved = 0
header.writeUInt16LE(1, 2); // Type = 1（ICO）
header.writeUInt16LE(1, 4); // ImageCount = 1

// ICONDIRENTRY
const dir = Buffer.alloc(DIR_ENTRY_SIZE);
dir.writeUInt8(0, 0);           // Width  0 → 256px
dir.writeUInt8(0, 1);           // Height 0 → 256px
dir.writeUInt8(0, 2);           // ColorCount = 0（真彩）
dir.writeUInt8(0, 3);           // Reserved = 0
dir.writeUInt16LE(1,  4);       // Planes = 1
dir.writeUInt16LE(32, 6);       // BitCount = 32（RGBA）
dir.writeUInt32LE(png.length, 8);  // BytesInRes
dir.writeUInt32LE(DATA_OFFSET,  12); // ImageOffset

const ico = Buffer.concat([header, dir, png]);
fs.writeFileSync(icoPath, ico);
console.log(`✅ icon.ico 创建成功 (${ico.length} bytes)`);
