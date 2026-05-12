const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver = config.resolver ?? {};
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const existingBlockList = config.resolver.blockList;
const extraBlocks = [
  /.*\/apps\/api\/storage\/.*/,
  /.*\/apps\/api\/\.piper\/.*/,
  /.*\/storage\/backgrounds\/.*/,
  /.*\/storage\/voiceovers\/.*/,
  /.*\/storage\/videos\/.*/,
];

config.resolver.blockList = existingBlockList
  ? [
      ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]),
      ...extraBlocks,
    ]
  : extraBlocks;

module.exports = config;
