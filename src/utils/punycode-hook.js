/**
 * Punycode Hook for ESM
 * 
 * This module provides a hook for punycode in ESM environments.
 * It's needed because punycode is not a native ESM module.
 */

import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

try {
  // Try to load punycode-esm first
  await import('punycode-esm');
} catch (error) {
  // Fallback to require if ESM version fails
  try {
    require('punycode');
  } catch (error) {
    console.warn('Warning: punycode not available');
  }
}

export {}; 