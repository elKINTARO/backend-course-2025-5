const { program } = require('commander');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

program
  .requiredOption('-H, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до директорії кешу');

program.parse();

const options = program.opts();

async function ensureCacheDirectory() {
  try {
    await fs.access(options.cache);
  } catch (error) {
    await fs.mkdir(options.cache, { recursive: true });
    console.log(`Створено директорію кешу: ${options.cache}`);
  }
}

function getCacheFilePath(httpCode) {
  return path.join(options.cache, `${httpCode}.jpg`);
}

async function handleGet(httpCode, res) {
  try {
    const filePath = getCacheFilePath(httpCode);
    const imageData = await fs.readFile(filePath);
    
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(imageData);
    console.log(`GET ${httpCode} - успішно отримано з кешу`);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found\n');
    console.log(`GET ${httpCode} - не знайдено в кеші`);
  }
}

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

const server = http.createServer(async (req, res) => {
  const httpCode = req.url.slice(1);
  
  console.log(`${req.method} ${req.url}`);
  
  if (!httpCode || !/^\d{3}$/.test(httpCode)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request: Invalid HTTP code. Use format: /200, /404, etc.\n');
    return;
  }
  
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