const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.jsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('/workspaces/New-Corez/src/components');
files.push('/workspaces/New-Corez/src/App.jsx');

let totalReplaced = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // We look for components that start with an uppercase letter followed by letters, then size={XX}
  // But to be safe and only target Lucide icons, let's just find anything with size={XX} and NO strokeWidth already
  const regex = /<([A-Z][a-zA-Z0-9]*)\s+([^>]*?)size={([0-9]+)}(?![^>]*?strokeWidth=)/g;
  
  let replacedInFile = 0;
  content = content.replace(regex, (match, iconName, beforeSize, sizeValue) => {
    replacedInFile++;
    return `<${iconName} ${beforeSize}size={${sizeValue}} strokeWidth={1.5}`;
  });

  // What if size is the last prop?
  const regex2 = /<([A-Z][a-zA-Z0-9]*)\s+size={([0-9]+)}(?![^>]*?strokeWidth=)/g;
  content = content.replace(regex2, (match, iconName, sizeValue) => {
    replacedInFile++;
    return `<${iconName} size={${sizeValue}} strokeWidth={1.5}`;
  });

  if (replacedInFile > 0) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${replacedInFile} icons in ${file}`);
    totalReplaced += replacedInFile;
  }
});

console.log(`Total icons updated: ${totalReplaced}`);
