/* Update the project's .vscodeignore with includes for folders found in
   nativemodules/node_modules. This script:
   - reads folder names from nativemodules/node_modules (ignores '.bin')
   - finds the marker comment in .vscodeignore and replaces the managed block
   - writes lines like "!node_modules/foldername/" for each folder
   - avoids duplicating lines already present before the marker
*/
const fs = require('fs').promises;
const path = require('path');

async function main() {
  const nmDir = path.join(__dirname, 'node_modules');
  const ignorePath = path.join(__dirname, '..', '.vscodeignore');
  const markerText = '# AUTO-NATIVEMODULES-DO-NOT-DELETE-THIS-LINE';

  // Read node_modules folders
  // ** if nativemodules/node_modules does not exist, make entries empty so we just ensure marker is present
  let entries=[];
  if (!await fs.stat(nmDir).catch(() => false)) {
    console.warn(`Warning: ${nmDir} does not exist. No native modules found, .vscodignore nativemodules includes will be empty.`);
    entries = [];
  } else {
    try {
      entries = await fs.readdir(nmDir, { withFileTypes: true });
    } catch (err) {
      console.error(`Error reading ${nmDir}:`, err.message);
      process.exitCode = 2;
      return;
    }
  }
  const folders = entries
    .filter(e => e.isDirectory() && e.name !== '.bin')
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  // Desired include lines
  const desiredLines = folders.map(name => `!node_modules/${name}/`);

  // Read .vscodeignore
  let content;
  try {
    content = await fs.readFile(ignorePath, 'utf8');
  } catch (err) {
    console.error(`Error reading ${ignorePath}:`, err.message);
    process.exitCode = 2;
    return;
  }

  const lines = content.split(/\r?\n/);
  const markerIdx = lines.findIndex(l => l.includes(markerText));

  let headLines;
  if (markerIdx === -1) {
    // If no marker, append marker at end (preserve existing content)
    headLines = lines.concat('', markerText);
  } else {
    // Keep everything up to and including the marker line
    headLines = lines.slice(0, markerIdx + 1);
  }

  // Build set of existing head lines (trimmed) to avoid duplicates
  const headSet = new Set(headLines.map(l => l.trim()));

  // Filter desired lines to avoid duplicating lines already present before marker
  const toAdd = desiredLines.filter(l => !headSet.has(l.trim()));

  // Compose new content: head + managed lines (toAdd)
  const newLines = headLines.concat(toAdd);

  // Ensure file ends with a newline
  const newContent = newLines.join('\n') + '\n';

  // Write file only if changed
  if (newContent !== content) {
    try {
      await fs.writeFile(ignorePath, newContent, 'utf8');
      console.log(`Updated ${path.relative(process.cwd(), ignorePath)} with ${toAdd.length} lines.`);
    } catch (err) {
      console.error(`Error writing ${ignorePath}:`, err.message);
      process.exitCode = 2;
    }
  } else {
    console.log(`${path.relative(process.cwd(), ignorePath)} is already up to date.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});