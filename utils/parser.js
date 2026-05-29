function parseTableFromText(rawText) {
  const lines = rawText.split('\n');
  const result = [];
  
  const regex = /([A-Za-zА-Яа-я\s]+?)(?:\s{2,}|\s*\|\s*|\s+)(\d+)/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const match = trimmed.match(regex);
    if (match) {
      const name = match[1].trim();
      const staticNum = match[2];
      
      if (name.toLowerCase() === 'name' || 
          name.toLowerCase() === 'имя' ||
          staticNum === 'Number' ||
          staticNum === 'статик') {
        continue;
      }
      
      result.push({
        name: name,
        static: staticNum,
        originalLine: trimmed
      });
    }
  }
  
  return result;
}

module.exports = { parseTableFromText };