const m = require('pdf-parse');
console.log('type:', typeof m);
console.log('keys:', Object.keys(m).slice(0,10));
console.log('default type:', typeof m.default);
console.log('is function:', typeof m === 'function');
