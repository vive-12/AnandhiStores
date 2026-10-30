'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const repo = path.resolve(__dirname, '../..');
const mobile = path.join(repo, 'mobile');
module.exports = { repo, mobile, requireMobile: createRequire(path.join(mobile, 'package.json')) };
