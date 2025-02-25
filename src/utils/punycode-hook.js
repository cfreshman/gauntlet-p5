/**
 * punycode-hook.js
 * 
 * this module uses node.js module hooks to intercept all punycode imports
 * and redirect them to our custom implementation.
 * 
 * to use this module, require it as early as possible in your application:
 * require('./src/utils/punycode-hook');
 */

const Module = require('module');
const path = require('path');

// store the original require function
const originalRequire = Module.prototype.require;

// override the require function to intercept punycode imports
Module.prototype.require = function(id) {
  // if the module being required is punycode, redirect to our custom implementation
  if (id === 'punycode') {
    return originalRequire.call(this, path.resolve(__dirname, './punycode'));
  }
  
  // otherwise, use the original require function
  return originalRequire.call(this, id);
};

// log that the hook has been installed
console.log('punycode hook installed - redirecting all punycode imports to custom implementation'); 