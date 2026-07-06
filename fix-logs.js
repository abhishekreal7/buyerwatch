const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'worker/handlers');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('import { logger }')) {
    content = "import { logger } from '../../src/lib/logger';\n" + content;
  }
  
  content = content.replace(/console\.log\(/g, 'logger.info(');
  content = content.replace(/console\.error\(/g, 'logger.error(');
  
  fs.writeFileSync(filePath, content);
}
console.log('Done');
