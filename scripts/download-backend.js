const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

// Environment variables provided by GitHub Actions
const TOKEN = process.env.TARGET_REPO_TOKEN;
const REPO = process.env.BACKEND_REPO;

if (!TOKEN || !REPO) {
  console.error('Error: TARGET_REPO_TOKEN and BACKEND_REPO environment variables are required.');
  process.exit(1);
}

const destDir = path.join(__dirname, '../services/main');

// Clean and ensure directory exists
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

async function getLatestRelease() {
  // Change to fetch list of releases to include pre-releases
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=1`;
  const headers = {
    Authorization: `token ${TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
  };

  try {
    const res = await axios.get(url, { headers });
    if (!res.data || res.data.length === 0) {
      throw new Error('No releases found');
    }
    return res.data[0];
  } catch (error) {
    console.error(`Failed to fetch releases from ${REPO}:`, error.message);
    throw error;
  }
}

async function downloadAsset(asset, destPath) {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url: asset.url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/octet-stream'
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

(async () => {
  try {
    console.log(`Fetching latest release from ${REPO}...`);
    const release = await getLatestRelease();
    console.log(`Using release: ${release.tag_name}`);
    const platform = process.platform;

    // Determine keyword to match asset (e.g., 'win', 'mac', 'darwin')
    const keyword = platform === 'win32' ? 'win' : 'mac';

    // Find matching asset
    const asset = release.assets.find(a =>
      a.name.toLowerCase().includes(keyword) &&
      a.name.endsWith('.zip')
    );

    if (!asset) {
      throw new Error(`No asset found for platform '${platform}' (keyword: ${keyword}) in release ${release.tag_name}`);
    }

    console.log(`Found asset: ${asset.name}`);

    // Download zip
    const zipPath = path.join(destDir, 'temp_backend.zip');
    console.log(`Downloading to ${zipPath}...`);
    await downloadAsset(asset, zipPath);

    // Extract
    console.log('Extracting...');
    try {
      if (platform === 'win32') {
        execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
      } else {
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`);
      }
    } catch (err) {
      console.error('Extraction failed:', err.message);
      throw err;
    }

    // Remove zip file
    fs.unlinkSync(zipPath);

    // Find the binary file recursively in the extracted content
    const findBinary = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      // 1. 优先在当前目录查找文件
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          // Heuristic: Windows needs .exe, Mac/Linux usually no extension or just executable
          if (platform === 'win32') {
            if (entry.name.toLowerCase().endsWith('.exe')) return fullPath;
          } else {
            // Mac: 排除 .so, .dylib, .zip, 且不以 . 开头, 且通常没有后缀
            const name = entry.name.toLowerCase();
            if (!name.startsWith('.') && 
                !name.endsWith('.zip') && 
                !name.endsWith('.so') && 
                !name.endsWith('.dylib') &&
                !name.includes('_internal') // 双重保险
            ) {
               // 简单的启发式：如果文件名包含 autobots 或者 main，或者没有后缀，优先返回
               return fullPath;
            }
          }
        }
      }
      
      // 2. 如果当前目录没找到，再递归进入子目录 (排除 _internal)
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== '_internal') {
          const res = findBinary(path.join(dir, entry.name));
          if (res) return res;
        }
      }
      
      return null;
    };

    const binaryPath = findBinary(destDir);
    if (!binaryPath) {
      throw new Error('Could not find binary file in extracted zip');
    }

    console.log(`Found binary at: ${binaryPath}`);

    // Rename/Move to 'main' or 'main.exe'
    const targetName = platform === 'win32' ? 'main.exe' : 'main';
    const targetPath = path.join(destDir, targetName);

    if (binaryPath !== targetPath) {
      fs.renameSync(binaryPath, targetPath);
    }

    // Cleanup: Remove everything else in destDir to keep the package clean
    const allFiles = fs.readdirSync(destDir);
    for (const f of allFiles) {
      if (f !== targetName) {
        fs.rmSync(path.join(destDir, f), { recursive: true, force: true });
      }
    }

    if (platform !== 'win32') {
      fs.chmodSync(targetPath, 0o755); // Make executable
    }

    console.log('Backend download complete.');
  } catch (e) {
    console.error('Download failed:', e);
    process.exit(1);
  }
})();