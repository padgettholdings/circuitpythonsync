const path = require('path');
const { execSync } = require('child_process');

function log(...args) { console.log(...args); }

async function main() {
  const workDir = __dirname;
  const webpackPath = path.join(__dirname, '..', 'webpack.config.js');

  // ** remove any existing node_modules and package.json and package-lock.json in the workDir directory
try {
    execSync('rm -rf node_modules package.json package-lock.json', { cwd: workDir, stdio: 'inherit' });
    log(`Cleaned up existing node_modules and package files in ${workDir}`);
} catch (error) {
    console.error('Cleanup failed:', error.message);
    process.exit(4);
}
  // load webpack config
  let config;
  try {
    config = require(webpackPath);
  } catch (err) {
    console.error(`Failed to require ${webpackPath}:`, err.message);
    process.exit(1);
  }

  const externals = config && config.externals ? config.externals : {};
  // collect package names, ignore 'vscode' key
  const pkgs = Object.keys(externals || {})
    .filter(k => k !== 'vscode')
    .map((k) => {
      const v = externals[k];
      if (typeof v === 'string') {
        // e.g. "commonjs serialport" -> "serialport"
        const parts = v.split(/\s+/).filter(Boolean);
        return parts.length > 1 ? parts[parts.length - 1] : parts[0];
      } else if (v && typeof v === 'object') {
        // possible forms like { commonjs: 'name' } or { root: 'name' }
        if (v.commonjs) { return v.commonjs; }
        // fallback to key name
        return k;
      } else {
        return k;
      }
    })
    .map(s => (typeof s === 'string' ? s.replace(/^commonjs[:\s]*/i, '').trim() : ''))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // unique

  log('Detected packages from webpack externals:', pkgs);

  try {
    log('Running: npm init --yes (in nativemodules)...');
    execSync('npm init --yes', { cwd: workDir, stdio: 'inherit' });
  } catch (err) {
    console.error('npm init failed:', err.message);
    process.exit(2);
  }

  if (pkgs.length === 0) {
    log('No packages to install. Done.');
    return;
  }

  const installCmd = 'npm i ' + pkgs.join(' ');
  try {
    log(`Running: ${installCmd} (in nativemodules)...`);
    execSync(installCmd, { cwd: workDir, stdio: 'inherit' });
    log('Installation complete.');
  } catch (err) {
    console.error('npm install failed:', err.message);
    process.exit(3);
  }
}

main();