// create_ico_multi.js — 生成多尺寸 ICO（16/32/48/256px）
// 使用 Node.js 内置能力，不依赖第三方包
// 通过 PowerShell System.Drawing 处理图像缩放

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const srcPng = path.join(__dirname, 'icon.png').replace(/\\/g, '\\\\');
const dstIco = path.join(__dirname, 'icon.ico').replace(/\\/g, '\\\\');

// 用 PowerShell 生成各尺寸 PNG，然后我们打包成 ICO
const ps = `
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile("${srcPng}")
$sizes = @(16, 32, 48, 256)
$pngFiles = @()

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $sz, $sz)
    $g.Dispose()
    $tmpFile = [System.IO.Path]::Combine($env:TEMP, "gf_icon_$sz.png")
    $bmp.Save($tmpFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngFiles += $tmpFile
    Write-Host "Saved $sz x $sz => $tmpFile"
}

$src.Dispose()

# 输出文件路径供 Node.js 读取
$pngFiles -join "|"
`;

const tempPs1 = path.join(require('os').tmpdir(), 'create_ico.ps1');
fs.writeFileSync(tempPs1, ps, 'utf8');

const result = execSync(`powershell -ExecutionPolicy Bypass -File "${tempPs1}"`, { encoding: 'utf8' });
const lines = result.trim().split('\n').map(l => l.trim()).filter(l => l.endsWith('.png'));
const lastLine = lines[lines.length - 1];
const pngPaths = lastLine.split('|');

console.log('PNG paths:', pngPaths);

// 读取各尺寸 PNG 数据
const pngDatas = pngPaths.map(p => fs.readFileSync(p.trim()));

// 构建 ICO 文件
const N = pngDatas.length;
const HEADER_SIZE = 6;
const DIR_ENTRY_SIZE = 16;
const dataOffset0 = HEADER_SIZE + DIR_ENTRY_SIZE * N;

// ICONDIR header
const header = Buffer.alloc(HEADER_SIZE);
header.writeUInt16LE(0, 0);  // Reserved
header.writeUInt16LE(1, 2);  // Type = ICO
header.writeUInt16LE(N, 4);  // Image count

// Directory entries
const sizes = [16, 32, 48, 256];
const dirEntries = [];
let offset = dataOffset0;
for (let i = 0; i < N; i++) {
  const entry = Buffer.alloc(DIR_ENTRY_SIZE);
  const sz = sizes[i];
  entry.writeUInt8(sz >= 256 ? 0 : sz, 0);  // Width (0 = 256)
  entry.writeUInt8(sz >= 256 ? 0 : sz, 1);  // Height
  entry.writeUInt8(0, 2);                    // Color count
  entry.writeUInt8(0, 3);                    // Reserved
  entry.writeUInt16LE(1, 4);                 // Planes
  entry.writeUInt16LE(32, 6);                // Bit depth
  entry.writeUInt32LE(pngDatas[i].length, 8); // Data size
  entry.writeUInt32LE(offset, 12);           // Data offset
  offset += pngDatas[i].length;
  dirEntries.push(entry);
}

const ico = Buffer.concat([header, ...dirEntries, ...pngDatas]);
fs.writeFileSync(dstIco, ico);

// 清理临时文件
pngPaths.forEach(p => { try { fs.unlinkSync(p.trim()); } catch (_) {} });
fs.unlinkSync(tempPs1);

console.log(`✅ 多尺寸 ICO 创建成功: icon.ico (${ico.length} bytes, ${N} sizes: 16/32/48/256)`);
