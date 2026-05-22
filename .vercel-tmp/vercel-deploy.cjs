#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const isWindows = require('os').platform() === 'win32';

const NODE = '/c/Program Files/nodejs/node';
const VERCEL_JS = '/c/Users/Ethan Chong/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const PROJECT = path.resolve(__dirname, '..');

function log(msg) { console.error(msg); }

function runVercel(args) {
  return spawnSync(NODE, [VERCEL_JS, ...args], {
    cwd: PROJECT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    timeout: 300000,
  });
}

log('=== Vercel Production Deployment ===');
log(`Project: ${PROJECT}`);
log('');

const result = runVercel(['--prod', '--yes']);
const output = (result.stdout || '') + (result.stderr || '');
log(output);

if (result.status !== 0) {
  log('Deployment failed!');
  process.exit(1);
}

const aliasMatch = output.match(/Aliased:\s*(https:\/\/[^\s]+)/i);
const prodMatch = output.match(/Production:\s*(https:\/\/[^\s]+)/i);
const url = (aliasMatch && aliasMatch[1]) || (prodMatch && prodMatch[1]) || null;

if (url) {
  log(`\nLive URL: ${url}`);
  console.log(JSON.stringify({ status: 'success', url }));
} else {
  console.log(JSON.stringify({ status: 'success', message: 'Deployment complete' }));
}
