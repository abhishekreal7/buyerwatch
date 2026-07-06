const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'worker/handlers');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix logger.error('Message:', error) -> logger.error({ error }, 'Message:')
  // We use regex to match logger.error('...', errVar)
  content = content.replace(/logger\.error\((['"`])(.*?)\1\s*,\s*([a-zA-Z0-9_]+)\)/g, (match, quote, msg, errVar) => {
    return `logger.error({ ${errVar} }, ${quote}${msg}${quote})`;
  });

  fs.writeFileSync(filePath, content);
}
console.log('Done fixing logger calls');
