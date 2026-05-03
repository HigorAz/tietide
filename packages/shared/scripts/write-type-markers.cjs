const fs = require('fs');
const path = require('path');

const cjsDir = path.join(__dirname, '..', 'dist', 'cjs');
const esmDir = path.join(__dirname, '..', 'dist', 'esm');

fs.writeFileSync(path.join(cjsDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
fs.writeFileSync(path.join(esmDir, 'package.json'), JSON.stringify({ type: 'module' }));
