// Фоновый скрипт для обработки скачиваний

let downloadQueue = [];
let isDownloading = false;
let currentDownloadState = {
  isDownloading: false,
  bookTitle: '',
  totalChapters: 0,
  completed: 0,
  errors: 0,
  currentChapter: ''
};

const MAX_CONCURRENT_DOWNLOADS = 2;

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    downloadFile(request.url, request.filename)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'downloadAll') {
    startBatchDownload(request.chapters, request.bookTitle)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getDownloadState') {
    sendResponse(currentDownloadState);
    return true;
  }
  
  if (request.action === 'cancelDownload') {
    cancelDownload();
    sendResponse({ success: true });
    return true;
  }
});

// Скачивание одного файла
async function downloadFile(url, filename) {
  try {
    // Проверяем авторизацию
    const cookies = await chrome.cookies.getAll({ domain: 'audiokniga.one' });
    const hasAuth = cookies.some(c => c.name.includes('dle_user_id'));
    
    if (!hasAuth) {
      throw new Error('Пользователь не авторизован');
    }

    // Проверяем, не скачивается ли уже этот файл
    const downloads = await chrome.downloads.search({ 
      filename: filename,
      state: 'in_progress'
    });
    
    if (downloads.length > 0) {
      throw new Error('Этот файл уже скачивается');
    }

    // Начинаем скачивание
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });

    console.log(`✅ Скачивание начато: ${filename} (ID: ${downloadId})`);
    
    // Ждем завершения скачивания
    return new Promise((resolve, reject) => {
      const listener = (delta) => {
        if (delta.id !== downloadId) return;
        
        if (delta.state && delta.state.current === 'complete') {
          chrome.downloads.onChanged.removeListener(listener);
          resolve(downloadId);
        }
        
        if (delta.error) {
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error(delta.error.current));
        }
      };
      
      chrome.downloads.onChanged.addListener(listener);
      
      // Таймаут на случай зависания
      setTimeout(() => {
        chrome.downloads.onChanged.removeListener(listener);
        reject(new Error('Превышено время ожидания скачивания'));
      }, 300000); // 5 минут
    });
    
  } catch (error) {
    console.error('❌ Ошибка скачивания:', error);
    throw error;
  }
}

// Массовое скачивание с очередью
async function startBatchDownload(chapters, bookTitle) {
  if (isDownloading) {
    throw new Error('Скачивание уже выполняется');
  }
  
  isDownloading = true;
  downloadQueue = [...chapters];
  
  currentDownloadState = {
    isDownloading: true,
    bookTitle: bookTitle,
    totalChapters: chapters.length,
    completed: 0,
    errors: 0,
    currentChapter: ''
  };
  
  // Сохраняем состояние
  await chrome.storage.local.set({ downloadState: currentDownloadState });
  
  // Запускаем воркеры
  const workers = [];
  for (let i = 0; i < Math.min(MAX_CONCURRENT_DOWNLOADS, chapters.length); i++) {
    workers.push(processDownloadQueue());
  }
  
  await Promise.all(workers);
  
  // Завершение
  isDownloading = false;
  currentDownloadState.isDownloading = false;
  
  await chrome.storage.local.set({ downloadState: currentDownloadState });
  
  // Показываем уведомление о завершении
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Скачивание завершено',
    message: `Скачано: ${currentDownloadState.completed} из ${currentDownloadState.totalChapters}. Ошибок: ${currentDownloadState.errors}`
  });
  
  console.log('✅ Массовое скачивание завершено');
}

// Обработка очереди скачивания
async function processDownloadQueue() {
  while (downloadQueue.length > 0 && isDownloading) {
    const item = downloadQueue.shift();
    
    if (!item) break;
    
    const { chapter, index, chapterNum, filename } = item;
    
    currentDownloadState.currentChapter = chapter.title;
    await chrome.storage.local.set({ downloadState: currentDownloadState });
    
    try {
      await downloadFile(chapter.url, filename);
      
      currentDownloadState.completed++;
      console.log(`✅ Скачано ${currentDownloadState.completed}/${currentDownloadState.totalChapters}: ${chapter.title}`);
      
    } catch (error) {
      currentDownloadState.errors++;
      console.error(`❌ Ошибка скачивания главы ${index + 1}:`, error);
    }
    
    // Сохраняем прогресс
    await chrome.storage.local.set({ downloadState: currentDownloadState });
    
    // Небольшая задержка между скачиваниями
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Отмена скачивания
function cancelDownload() {
  isDownloading = false;
  downloadQueue = [];
  
  currentDownloadState.isDownloading = false;
  chrome.storage.local.set({ downloadState: currentDownloadState });
  
  console.log('⏸️ Скачивание отменено');
}

// Отслеживание статуса скачиваний
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log(`✅ Скачивание завершено: ID ${delta.id}`);
  }
  
  if (delta.error) {
    console.error(`❌ Ошибка скачивания: ID ${delta.id}, Error: ${delta.error.current}`);
  }
});

// Восстановление состояния при перезапуске расширения
chrome.runtime.onStartup.addListener(async () => {
  const { downloadState } = await chrome.storage.local.get('downloadState');
  
  if (downloadState && downloadState.isDownloading) {
    console.log('🔄 Восстановление прерванного скачивания...');
    // Можно добавить логику восстановления, если нужно
  }
});