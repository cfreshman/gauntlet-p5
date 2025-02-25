/**
 * punycode.js - wrapper for punycode-esm
 * 
 * this module provides a wrapper around the punycode-esm module to replace
 * the deprecated native punycode module.
 * 
 * to use this module:
 * 1. require this module instead of the native punycode module
 * 2. make sure this module is loaded before any module that requires punycode
 */

const punycodeEsm = require('punycode-esm');

// export the punycode-esm functions with the same interface as the native punycode module
module.exports = {
  decode: punycodeEsm.decode,
  encode: punycodeEsm.encode,
  toASCII: punycodeEsm.toASCII,
  toUnicode: punycodeEsm.toUnicode,
  ucs2: {
    decode: punycodeEsm.ucs2decode,
    encode: punycodeEsm.ucs2encode
  },
  version: punycodeEsm.version
}; 