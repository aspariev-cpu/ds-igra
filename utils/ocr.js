const Tesseract = require('tesseract.js');
const { parseTableFromText } = require('./parser');

async function recognizeTable(imageBuffer) {
  const { data: { text } } = await Tesseract.recognize(
    imageBuffer,
    'rus+eng',
    {
      logger: m => console.log(m)
    }
  );
  
  console.log('Распознанный текст:', text);
  
  const tableData = parseTableFromText(text);
  return tableData;
}

module.exports = { recognizeTable };