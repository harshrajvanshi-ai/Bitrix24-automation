const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let errors = 0;
function scan(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.gemini') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      scan(full);
    } else if (e.name.endsWith('.js')) {
      try {
        execSync(`node --check "${full}"`, { stdio: 'pipe' });
      } catch (err) {
        errors++;
        console.error('ERROR in ' + full + ':\n' + (err.stderr ? err.stderr.toString() : err.message));
      }
    }
  }
}

scan('.');
if (errors === 0) {
  console.log('✓ All JavaScript files passed syntax check with 0 errors.');
} else {
  console.log(`Found ${errors} syntax error(s).`);
  process.exit(1);
}
