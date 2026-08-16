const fs = require('fs');
const path = process.argv[2];
const buf = fs.readFileSync(path);
let i = 2;
while (!(buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2))) {
  i += 2 + buf.readUInt16BE(i + 2);
}
const h = buf.readUInt16BE(i + 5);
const w = buf.readUInt16BE(i + 7);
console.log(w, 'x', h);
