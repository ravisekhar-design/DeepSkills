const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const keyMatch = env.match(/GOOGLE_GENAI_API_KEY=\"?([^\s\"]+)/);
if (!keyMatch) {
    console.error("Key not found");
    process.exit(1);
}
const key = keyMatch[1];
fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key)
    .then(r => r.json())
    .then(d => {
        if (d.error) {
            console.error(d.error);
        } else {
            console.log(d.models.map(m => m.name).join('\n'));
        }
    })
    .catch(console.error);
