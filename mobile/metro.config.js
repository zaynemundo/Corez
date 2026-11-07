const { getDefaultConfig } = require("expo/metro-config");

/**
 * The shared CoreZ package is copied into node_modules as a real directory by
 * scripts/sync-shared.mjs (npm would link a Windows junction Metro cannot
 * follow consistently). No custom watch folders are needed: the copy lives
 * inside the project root.
 */
module.exports = getDefaultConfig(__dirname);
