const fs = require('fs');
const path = require('path');

const replacements = {
  'bg-black': 'bg-background',
  'text-white': 'text-text-primary',
  'text-[#98989D]': 'text-text-secondary',
  'text-[#48484A]': 'text-text-tertiary',
  'bg-[#111111]': 'bg-surface',
  'bg-[#1C1C1E]': 'bg-surface-elevated',
  'border-white/10': 'border-border',
  'border-white/5': 'border-border',
  'bg-white/10': 'bg-black/5',
  'bg-white/5': 'bg-black/5',
  'hover:bg-white/5': 'hover:bg-black/5',
  'hover:bg-white/10': 'hover:bg-black/5',
  'hover:bg-white/20': 'hover:bg-black/10',
  'hover:text-white': 'hover:text-text-primary',
  'border-white/20': 'border-border-hover',
  'border-white/30': 'border-border-hover',
  'bg-white/[0.08]': 'bg-black/5',
  'hover:bg-white/[0.08]': 'hover:bg-black/5',
  'bg-white/20': 'bg-black/10',
  'bg-white': 'bg-white', // this is okay for buttons usually, but maybe they should be primary?
  'text-black': 'text-black',
  'bg-black/50': 'bg-surface/80',
  'border-t border-white/10': 'border-t border-border',
  'border-b border-white/10': 'border-b border-border',
  'border-r border-white/10': 'border-r border-border',
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  for (const [search, replace] of Object.entries(replacements)) {
    // using split join to replace all occurrences
    content = content.split(search).join(replace);
  }
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
