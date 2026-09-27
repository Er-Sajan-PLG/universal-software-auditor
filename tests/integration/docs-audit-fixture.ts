/**
 * Shared fixture for the documentation-universe tests: a small Express app
 * with partial docs (README + one API doc), no CHANGELOG, and one
 * undocumented route (POST /users) for the invariant tests.
 */
export const DEFAULT_TAXONOMY_RULES: Record<string, string> = {
  'README.md': [
    '# demo-api',
    '',
    'A tiny Express service.',
    '',
    '## Install',
    '',
    '```bash',
    'npm install',
    '```',
    '',
    '## Test',
    '',
    '```bash',
    'npm test',
    '```',
  ].join('\n'),
  LICENSE: 'MIT License\n\nCopyright (c) 2026 demo\n',
  'CONTRIBUTING.md': '# Contributing\n\nRun the tests before pushing.\n',
  'package.json': JSON.stringify(
    { name: 'demo-api', version: '1.0.0', scripts: { test: 'node --test test/' } },
    null,
    2,
  ),
  // NB: /users is intentionally NOT in the OpenAPI spec — the source defines
  // the route, so DOCU-INV-ROUTES must flag it as undocumented.
  'openapi.yaml': [
    'openapi: 3.0.0',
    'info: { title: demo-api, version: 1.0.0 }',
    'paths:',
    '  /health:',
    '    get: { summary: liveness }',
  ].join('\n'),
  'src/app.js': [
    "const express = require('express');",
    'const app = express();',
    '',
    // DOCU-INV-ENV target: read by code, absent from the doc corpus.
    'const limit = process.env.USER_LIMIT || "10";',
    "app.get('/health', (req, res) => res.send('ok'));",
    "app.post('/users', (req, res) => res.send('created'));",
    '',
    'module.exports = app;',
  ].join('\n'),
  'test/app.test.js': [
    "const test = require('node:test');",
    "test('health responds', () => {});",
  ].join('\n'),
  'docs/api.md': [
    '# API',
    '',
    'GET /health — liveness probe.',
    '',
    'See [README](../README.md) for install instructions.',
  ].join('\n'),
  '.usa.yaml': 'version: 1\n',
};
