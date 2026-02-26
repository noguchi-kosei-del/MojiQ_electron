/**
 * PNGをICO形式に変換するスクリプト
 * 使用法: node scripts/convert-png-to-ico.js
 */
const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '..', 'logo', 'MojiQ_icon.png');
const icoPath = path.join(__dirname, '..', 'logo', 'MojiQ_icon.ico');

function pngToIco(pngBuffer) {
    // ICOファイル構造:
    // - ICO Header (6 bytes)
    // - ICO Directory Entry (16 bytes per image)
    // - Image Data (PNG data)

    const imageCount = 1;
    const headerSize = 6;
    const directoryEntrySize = 16;
    const dataOffset = headerSize + (directoryEntrySize * imageCount);

    // PNGのサイズを取得（IHDRチャンクから）
    let width = 0;
    let height = 0;

    // PNGシグネチャをスキップして IHDRチャンクを読む
    if (pngBuffer[0] === 0x89 && pngBuffer[1] === 0x50) {
        // PNG signature verified
        width = pngBuffer.readUInt32BE(16);
        height = pngBuffer.readUInt32BE(20);
    }

    // 256x256以上の場合は0として格納（ICO仕様）
    const icoWidth = width >= 256 ? 0 : width;
    const icoHeight = height >= 256 ? 0 : height;

    // ICO Header
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0);        // Reserved (must be 0)
    header.writeUInt16LE(1, 2);        // Image type: 1 = ICO
    header.writeUInt16LE(imageCount, 4); // Number of images

    // ICO Directory Entry
    const directoryEntry = Buffer.alloc(directoryEntrySize);
    directoryEntry.writeUInt8(icoWidth, 0);     // Width (0 = 256)
    directoryEntry.writeUInt8(icoHeight, 1);    // Height (0 = 256)
    directoryEntry.writeUInt8(0, 2);            // Color palette (0 = no palette)
    directoryEntry.writeUInt8(0, 3);            // Reserved
    directoryEntry.writeUInt16LE(1, 4);         // Color planes
    directoryEntry.writeUInt16LE(32, 6);        // Bits per pixel
    directoryEntry.writeUInt32LE(pngBuffer.length, 8);  // Image size
    directoryEntry.writeUInt32LE(dataOffset, 12);       // Offset to image data

    // Combine all parts
    return Buffer.concat([header, directoryEntry, pngBuffer]);
}

// メイン処理
console.log('Converting PNG to ICO...');
console.log('Source:', pngPath);
console.log('Destination:', icoPath);

if (!fs.existsSync(pngPath)) {
    console.error('Error: PNG file not found:', pngPath);
    process.exit(1);
}

const pngBuffer = fs.readFileSync(pngPath);

// PNGファイルかどうか確認
if (pngBuffer[0] !== 0x89 || pngBuffer[1] !== 0x50 || pngBuffer[2] !== 0x4E || pngBuffer[3] !== 0x47) {
    console.error('Error: Input file is not a valid PNG');
    process.exit(1);
}

const width = pngBuffer.readUInt32BE(16);
const height = pngBuffer.readUInt32BE(20);
console.log(`PNG size: ${width}x${height}`);

const icoBuffer = pngToIco(pngBuffer);
fs.writeFileSync(icoPath, icoBuffer);

console.log('ICO file created successfully!');
console.log('File size:', icoBuffer.length, 'bytes');
