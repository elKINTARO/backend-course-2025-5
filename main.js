const { program } = require('commander');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const superagent = require('superagent');
//знову ті самі налаштування
program
  .requiredOption('-H, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії кешу');

program.parse();

const options = program.opts();

//створюю директорію для кешу якщо її ще нема(отой какхе)
async function ensureCacheDirectory() {
  try {
    await fs.access(options.cache);
  } catch (error) {
    await fs.mkdir(options.cache, { recursive: true });
    console.log(`Створено директорію кешу: ${options.cache}`);
  }
}

//отримую тут шлях до файлу кешу якогось хттп коду, картинка котика короч
function getCacheFilePath(httpCode) {
  return path.join(options.cache, `${httpCode}.jpg`);
}

//отримую картинку з сайту хттп котиків
async function fetchFromHttpCat(httpCode) {
  try {
    const url = `https://http.cat/${httpCode}`;
    console.log(`Запит до http.cat: ${url}`);
    
    const response = await superagent.get(url);
    return response.body;
  } catch (error) {
    console.error(`Помилка запиту до http.cat для коду ${httpCode}:`, error.message);
    return null;
  }
}

//гет запит - отримати картинку з сайту чи кешу
async function handleGet(httpCode, res) {
  try {
    //спроба отримання з кешу
    const filePath = getCacheFilePath(httpCode);
    const imageData = await fs.readFile(filePath);
    
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(imageData);
    console.log(`GET ${httpCode} - успішно отримано з кешу`);
  } catch (error) {
    //в кеші нема, берем з сайту котиків
    console.log(`GET ${httpCode} - немає в кеші, запит до http.cat`);
    
    const imageData = await fetchFromHttpCat(httpCode);
    
    if (!imageData) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found\n');
      console.log(`GET ${httpCode} - не знайдено на http.cat`);
      return;
    }
    
    //збереження котика в кеш
    try {
      const filePath = getCacheFilePath(httpCode);
      await fs.writeFile(filePath, imageData);
      console.log(`GET ${httpCode} - збережено в кеш`);
    } catch (cacheError) {
      console.error(`Помилка збереження в кеш:`, cacheError);
    }
    
    //відправка котика з кеша
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(imageData);
    console.log(`GET ${httpCode} - успішно отримано з http.cat`);
  }
}

//пут - зберегти картинку в кеш
async function handlePut(httpCode, req, res) {
  try {
    const chunks = [];
    
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    
    const imageData = Buffer.concat(chunks);
    const filePath = getCacheFilePath(httpCode);
    
    await fs.writeFile(filePath, imageData);
    
    res.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Created\n');
    console.log(`PUT ${httpCode} - збережено в кеш`);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error\n');
    console.error(`PUT ${httpCode} - помилка:`, error);
  }
}

//делете котика з кешу(
async function handleDelete(httpCode, res) {
  try {
    const filePath = getCacheFilePath(httpCode);
    await fs.unlink(filePath);
    
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK\n');
    console.log(`DELETE ${httpCode} - видалено з кешу`);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found\n');
    console.log(`DELETE ${httpCode} - не знайдено в кеші`);
  }
}

//створення хттп сервера
const server = http.createServer(async (req, res) => {
  //отримання хттп коду з урл
  const httpCode = req.url.slice(1);
  
  console.log(`${req.method} ${req.url}`);
  
  //валідність хттп коду
  if (!httpCode || !/^\d{3}$/.test(httpCode)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request: Invalid HTTP code. Use format: /200, /404, etc.\n');
    return;
  }
  
  //обробка наших трьох методів (гет пут делете)
  switch (req.method) {
    case 'GET':
      await handleGet(httpCode, res);
      break;
      
    case 'PUT':
      await handlePut(httpCode, req, res);
      break;
      
    case 'DELETE':
      await handleDelete(httpCode, res);
      break;
      
    default:
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed\n');
      console.log(`${req.method} ${httpCode} - метод не дозволено`);
  }
});

//запуск
async function startServer() {
  await ensureCacheDirectory();
  
  server.listen(options.port, options.host, () => {
    console.log(`Сервер запущено на http://${options.host}:${options.port}`);
    console.log(`Директорія кешу: ${options.cache}`);
  });
}

startServer().catch(error => {
  console.error('Помилка запуску сервера:', error);
  process.exit(1);
});