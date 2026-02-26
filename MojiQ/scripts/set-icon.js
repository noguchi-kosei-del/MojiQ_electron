const { rcedit } = require('rcedit');
const path = require('path');
const fs = require('fs');

const icoPath = path.join(__dirname, '..', 'logo', 'MojiQ_icon.ico');
const unpackedExePath = path.join(__dirname, '..', 'dist', 'win-unpacked', 'MojiQ.exe');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setIcon(retries = 5) {
    console.log('Setting icons...');

    if (!fs.existsSync(icoPath)) {
        console.error('Icon file not found:', icoPath);
        process.exit(1);
    }

    if (!fs.existsSync(unpackedExePath)) {
        console.error('MojiQ.exe not found:', unpackedExePath);
        process.exit(1);
    }

    const options = {
        icon: icoPath,
        'version-string': {
            'ProductName': 'MojiQ',
            'FileDescription': 'MojiQ',
            'CompanyName': 'MojiQ Team',
            'LegalCopyright': 'Copyright (c) 2024 MojiQ Team'
        }
    };

    for (let i = 0; i < retries; i++) {
        try {
            await rcedit(unpackedExePath, options);
            console.log('Icon set successfully for MojiQ.exe');
            return;
        } catch (err) {
            console.log(`Attempt ${i + 1} failed, retrying in 2 seconds...`);
            await sleep(2000);
        }
    }

    console.error('Failed to set icon after', retries, 'attempts');
    process.exit(1);
}

setIcon();
