#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const VERCEL_JS = 'C:\\Users\\Ethan Chong\\AppData\\Roaming\\npm\\node_modules\\vercel\\dist\\index.js';
const PROJECT = path.resolve(__dirname, '..');

const result = spawnSync(NODE, [VERCEL_JS, '--prod', '--yes'], {
  cwd: PROJECT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 300000,
});

console.log('EXIT:', result.status);
console.log('STDOUT:\n', result.stdout || '(empty)');
console.log('STDERR:\n', result.stderr || '(empty)');
if (result.error) console.log('ERROR:', result.error.message);
