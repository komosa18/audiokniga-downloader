// Скрипт для извлечения данных со страницы аудиокниги

(function() {
  'use strict';

  // Функция извлечения данных аудиокниги
  function extractAudiobookData() {
    const data = {
      isAudiobookPage: false,
      bookId: null,
      title: null,
      author: null,
      reader: null,
      cover: null,
      chapters: [],
      totalDuration: null
    };

    // Проверяем, что мы на странице аудиокниги
    const audioPlayer = document.querySelector('.player-container');
    if (!audioPlayer) {
      return data;
    }

    data.isAudiobookPage = true;

    // Извлекаем название книги
    const titleElement = document.querySelector('h1.b_short-title');
    if (titleElement) {
      data.title = titleElement.textContent.trim().replace(/⚙️/g, '').trim();
    }

    // Извлекаем автора
    const authorElement = document.querySelector('.kniga_info_line.icon_author a[rel="author"]');
    if (authorElement) {
      data.author = authorElement.textContent.trim();
    }

    // Извлекаем чтеца
    const readerElement = document.querySelector('.kniga_info_line.icon_reader a[rel="performer"]');
    if (readerElement) {
      data.reader = readerElement.textContent.trim();
    }

    // Извлекаем обложку
    const coverElement = document.querySelector('.fimg img.cover');
    if (coverElement) {
      data.cover = coverElement.src;
    }

    // Извлекаем общую длительность
    const durationElement = document.querySelector('.kniga_info_line.icon_duration');
    if (durationElement) {
      data.totalDuration = durationElement.textContent.trim();
    }

    // Извлекаем ID книги и главы из JavaScript
    const scripts = document.querySelectorAll('script');
    for (let script of scripts) {
      const content = script.textContent;
      
      // Ищем вызов playerInit
      const playerInitMatch = content.match(/playerInit\s*\(\s*(\d+)\s*,\s*'([^']+)'\s*,\s*'json'\s*,\s*(\[[\s\S]*?\])\s*,\s*'([^']+)'\s*\)/);
      
      if (playerInitMatch) {
        data.bookId = playerInitMatch[1];
        
        try {
          // Парсим массив глав
          const chaptersJson = playerInitMatch[3];
          const chapters = JSON.parse(chaptersJson);
          
          data.chapters = chapters.map(chapter => ({
            id: chapter.id,
            title: chapter.title,
            url: chapter.url,
            duration: chapter.duration,
            durationMin: chapter.duration_min || formatDuration(chapter.duration)
          }));
          
        } catch (e) {
          console.error('Ошибка парсинга глав:', e);
        }
        
        break;
      }
    }

    return data;
  }

  // Форматирование длительности из секунд в MM:SS
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  // Функция открытия popup авторизации на сайте
  function openLoginPopup() {
    // Ищем кнопку авторизации
    const loginButton = document.querySelector('.header-btn.btn.js-login');
    
    if (loginButton) {
      // Симулируем клик по кнопке
      loginButton.click();
      console.log('✅ Popup авторизации открыт');
      return true;
    } else {
      console.error('❌ Кнопка авторизации не найдена');
      return false;
    }
  }

  // Слушаем запросы от popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getAudiobookData') {
      const data = extractAudiobookData();
      sendResponse(data);
    }
    
    if (request.action === 'openLoginPopup') {
      const success = openLoginPopup();
      sendResponse({ success: success });
    }
    
    return true;
  });

  // Сохраняем данные в storage при загрузке страницы
  const audiobookData = extractAudiobookData();
  if (audiobookData.isAudiobookPage) {
    chrome.storage.local.set({ 
      currentAudiobook: audiobookData,
      lastUrl: window.location.href
    });
  }

})();