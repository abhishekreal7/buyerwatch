const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = `${dir}/${file}`;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      if (name.endsWith('.tsx')) {
        files.push(name);
      }
    }
  }
  return files;
}

const files = getFiles('c:/dev/matchsignal/src');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Main card backgrounds
  const oldContent = content;
  content = content.replace(/bg-white(?=\s+(?:rounded-\[24px\]|rounded-2xl|rounded-xl|border|shadow))/g, 'bg-surface');
  content = content.replace(/hover:bg-white/g, 'hover:bg-surface-secondary');
  content = content.replace(/focus:bg-white/g, 'focus:bg-surface-secondary');
  
  // Replace old explicit off-whites with the new nested surface variable
  content = content.replace(/bg-\[\#F9F9FB\]/g, 'bg-surface-secondary');
  
  // Custom case for opportunities where bg-white is used directly with other classes
  content = content.replace(/bg-white(?=\s+shadow-\[inset)/g, 'bg-surface');

  // Input fields that were pure white or bg-background
  // The global background is white now, so bg-background is white.
  // We want inputs inside cards (which are #f6f6f7) to be nested (#f0f0f2)
  content = content.replace(/bg-background border border-transparent/g, 'bg-surface-secondary border border-transparent');
  content = content.replace(/bg-white border border-black\/\[0\.08\]/g, 'bg-surface-secondary border border-black/[0.08]');
  
  // Drafts: Review & Post panel
  content = content.replace(/bg-white shrink-0 flex gap-3/g, 'bg-surface shrink-0 flex gap-3');
  content = content.replace(/bg-white shrink-0/g, 'bg-surface shrink-0');
  
  if (content !== oldContent) {
    fs.writeFileSync(file, content);
    console.log('Updated:', file);
  }
}
console.log('Done');
