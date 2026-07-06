const fs = require('fs');
let code = fs.readFileSync('./content.js', 'utf8');

const scriptToRun = 'const chrome = { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} } }; const window = { location: { href: "", hostname: "" }, scrollTo: () => {}, dispatchEvent: () => {} }; const document = { getElementById: () => ({ addEventListener: () => {} }), createElement: () => ({ style: "", addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } }), body: { appendChild: () => {} }, links: [], querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {} }; ' + code + '\nconsole.log(extractAttributes("POCO M8 Charger in the Box (Frost Silver, 256 GB) (8 GB RAM)"));';

fs.writeFileSync('test_run_final.js', scriptToRun);
require('child_process').execSync('node test_run_final.js', {stdio: 'inherit'});
