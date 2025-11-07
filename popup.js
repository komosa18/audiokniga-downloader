document.addEventListener('DOMContentLoaded', async () => {
  await initPopup();
  
  // Проверяем состояние скачивания при открытии popup
  await checkDownloadState();
  
  // Обновляем состояние каждые 2 секунды
  setInterval(checkDownloadState, 2000);
});

let currentAudiobook = null;
let downloadCheckInterval = null;

async function initPopup() {
  const isAuthorized = await checkAuthorization();
  updateAuthStatus(isAuthorized);

  if (!isAuthorized) {
    showNotAuthorized();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url || !tab.url.includes('audiokniga.one')) {
    showNotAudiobook();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getAudiobookData' });
    
    if (!response || !response.isAudiobookPage || !response.chapters || response.chapters.length === 0) {
      showNotAudiobook();
      return;
    }

    currentAudiobook = response;
    showAudiobookInfo(response);
    
  } catch (error) {
    console.error('Ошибка получения данных:', error);
    showNotAudiobook();
  }
}

// Проверка состояния скачивания
async function checkDownloadState() {
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getDownloadState' });
    
    if (state && state.isDownloading) {
      updateDownloadProgress(state);
    } else {
      // Если скачивание завершено, сбрасываем UI
      const downloadBtn = document.getElementById('downloadAllBtn');
      const progressDiv = document.getElementById('downloadProgress');
      
      if (downloadBtn && downloadBtn.disabled && progressDiv && progressDiv.style.display === 'block') {
        // Показываем результат
        if (state.errors > 0) {
          downloadBtn.innerHTML = `<span class="icon">⚠️</span><span>Завершено с ошибками (${state.errors})</span>`;
        } else {
          downloadBtn.innerHTML = '<span class="icon">✓</span><span>Скачивание завершено</span>';
        }
        
        setTimeout(() => {
          resetDownloadButton();
        }, 3000);
      }
    }
  } catch (error) {
    // Игнорируем ошибки, если popup закрыт
  }
}

// Обновление прогресса скачивания
function updateDownloadProgress(state) {
  const downloadBtn = document.getElementById('downloadAllBtn');
  const progressDiv = document.getElementById('downloadProgress');
  const progressStatus = document.getElementById('progressStatus');
  const progressText = document.getElementById('progressText');
  const progressFill = document.getElementById('progressFill');
  
  if (!downloadBtn || !progressDiv) return;
  
  // ВАЖНО: убираем disabled и делаем кнопку кликабельной
  downloadBtn.disabled = false;
  downloadBtn.style.cursor = 'pointer';
  downloadBtn.style.opacity = '1';
  downloadBtn.innerHTML = '<span class="icon">⏸️</span><span>Отменить скачивание</span>';
  
  progressDiv.style.display = 'block';
  progressStatus.textContent = `Скачивание: ${state.currentChapter}`;
  progressText.textContent = `${state.completed} / ${state.totalChapters}`;
  
  const percent = (state.completed / state.totalChapters) * 100;
  progressFill.style.width = `${percent}%`;
}

function resetDownloadButton() {
  const downloadBtn = document.getElementById('downloadAllBtn');
  const progressDiv = document.getElementById('downloadProgress');
  
  if (!downloadBtn || !currentAudiobook) return;
  
  downloadBtn.disabled = false;
  downloadBtn.style.cursor = 'pointer';
  downloadBtn.style.opacity = '1';
  downloadBtn.innerHTML = `<span class="icon">📥</span><span>Скачать всю книгу (<span id="chaptersCount">${currentAudiobook.chapters.length}</span> глав)</span>`;
  
  if (progressDiv) {
    progressDiv.style.display = 'none';
  }
}

async function checkAuthorization() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'audiokniga.one' });
    const authCookies = cookies.filter(c => 
      c.name.includes('dle_user_id') || 
      c.name.includes('dle_password') ||
      c.name.includes('dle_hash')
    );
    return authCookies.length >= 2;
  } catch (error) {
    console.error('Ошибка проверки авторизации:', error);
    return false;
  }
}

function updateAuthStatus(isAuthorized) {
  const indicator = document.getElementById('authIndicator');
  const text = document.getElementById('authText');
  
  if (isAuthorized) {
    indicator.classList.add('authorized');
    text.textContent = 'Авторизован ✓';
  } else {
    indicator.classList.add('unauthorized');
    text.textContent = 'Не авторизован ✗';
  }
}

function showNotAudiobook() {
  document.getElementById('notAudiobook').style.display = 'flex';
  document.getElementById('notAuthorized').style.display = 'none';
  document.getElementById('audiobookInfo').style.display = 'none';
}

function showNotAuthorized() {
  document.getElementById('notAudiobook').style.display = 'none';
  document.getElementById('notAuthorized').style.display = 'flex';
  document.getElementById('audiobookInfo').style.display = 'none';
  
  // Кнопка "Войти" - открывает popup авторизации
  document.getElementById('loginBtn').addEventListener('click', async () => {
    await openLoginPopup();
  });
  
  // Кнопка "Открыть сайт" - открывает сайт в новой вкладке
  document.getElementById('openSiteBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://audiokniga.one' });
  });
}

// Функция открытия popup авторизации
async function openLoginPopup() {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url || !tab.url.includes('audiokniga.one')) {
      tab = await chrome.tabs.create({ url: 'https://audiokniga.one' });
      
      await new Promise(resolve => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }
    
    await chrome.tabs.sendMessage(tab.id, { action: 'openLoginPopup' });
    window.close();
    
  } catch (error) {
    console.error('Ошибка открытия popup авторизации:', error);
    chrome.tabs.create({ url: 'https://audiokniga.one' });
    window.close();
  }
}

function showAudiobookInfo(data) {
  document.getElementById('notAudiobook').style.display = 'none';
  document.getElementById('notAuthorized').style.display = 'none';
  document.getElementById('audiobookInfo').style.display = 'flex';
  
  document.getElementById('bookCover').src = data.cover || '';
  document.getElementById('bookTitle').textContent = data.title || 'Без названия';
  document.getElementById('bookAuthor').textContent = data.author || '—';
  document.getElementById('bookReader').textContent = data.reader || '—';
  document.getElementById('bookDuration').textContent = data.totalDuration || '—';
  document.getElementById('chaptersCount').textContent = data.chapters.length;
  document.getElementById('chaptersTotal').textContent = `${data.chapters.length} глав`;
  
  // ВАЖНО: используем addEventListener вместо onclick для правильной обработки
  const downloadBtn = document.getElementById('downloadAllBtn');
  downloadBtn.addEventListener('click', async () => {
    await handleDownloadButtonClick(data);
  });
  
  document.getElementById('toggleChaptersBtn').addEventListener('click', () => {
    toggleChaptersList();
  });
  
  document.getElementById('closeChaptersBtn').addEventListener('click', () => {
    hideChaptersList();
  });
  
  document.getElementById('chaptersSearch').addEventListener('input', (e) => {
    filterChapters(e.target.value);
  });
  
  document.getElementById('closeErrorBtn').addEventListener('click', () => {
    hideErrorModal();
  });
  
  document.getElementById('modalOverlay').addEventListener('click', () => {
    hideErrorModal();
  });
  
  renderChapters(data.chapters);
}

// Обработчик клика по кнопке скачивания
async function handleDownloadButtonClick(data) {
  try {
    // Проверяем текущее состояние
    const state = await chrome.runtime.sendMessage({ action: 'getDownloadState' });
    
    if (state && state.isDownloading) {
      // Если идет скачивание, отменяем его
      await chrome.runtime.sendMessage({ action: 'cancelDownload' });
      resetDownloadButton();
    } else {
      // Если не идет, запускаем скачивание
      await downloadAllChapters(data);
    }
  } catch (error) {
    console.error('Ошибка обработки клика:', error);
    showErrorModal(error.message || 'Произошла ошибка');
  }
}

function toggleChaptersList() {
  const section = document.getElementById('chaptersSection');
  const isVisible = section.style.display === 'flex';
  
  if (isVisible) {
    hideChaptersList();
  } else {
    showChaptersList();
  }
}

function showChaptersList() {
  document.getElementById('chaptersSection').style.display = 'flex';
}

function hideChaptersList() {
  document.getElementById('chaptersSection').style.display = 'none';
}

function renderChapters(chapters) {
  const container = document.getElementById('chaptersList');
  container.innerHTML = '';
  
  if (!chapters || chapters.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Главы не найдены</div>';
    return;
  }
  
  chapters.forEach((chapter, index) => {
    const item = document.createElement('div');
    item.className = 'chapter-item';
    item.dataset.chapterIndex = index;
    
    const chapterNum = String(index + 1).padStart(2, '0');
    
    item.innerHTML = `
      <div class="chapter-number">#${chapterNum}</div>
      <div class="chapter-info">
        <div class="chapter-title">${escapeHtml(chapter.title)}</div>
        <div class="chapter-duration">${escapeHtml(chapter.durationMin || '—')}</div>
      </div>
      <button class="chapter-download-btn" data-chapter-id="${chapter.id}">
        Скачать
      </button>
    `;
    
    const downloadBtn = item.querySelector('.chapter-download-btn');
    downloadBtn.addEventListener('click', () => {
      downloadChapter(chapter, index, downloadBtn);
    });
    
    container.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function filterChapters(query) {
  const items = document.querySelectorAll('.chapter-item');
  const lowerQuery = query.toLowerCase();
  
  items.forEach(item => {
    const title = item.querySelector('.chapter-title').textContent.toLowerCase();
    item.style.display = title.includes(lowerQuery) ? 'flex' : 'none';
  });
}

async function downloadChapter(chapter, index, button) {
  if (button.disabled) return;
  
  button.disabled = true;
  button.classList.add('downloading');
  const originalText = button.textContent;
  button.textContent = 'Скачивание...';
  
  const bookTitle = sanitizeFilename(currentAudiobook.title);
  const chapterNum = String(index + 1).padStart(3, '0');
  const chapterTitle = sanitizeFilename(chapter.title);
  const filename = `${bookTitle}/${chapterNum} - ${chapterTitle}.mp3`;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'download',
      url: chapter.url,
      filename: filename
    });
    
    if (response.success) {
      button.classList.remove('downloading');
      button.classList.add('success');
      button.textContent = 'Готово ✓';
      
      setTimeout(() => {
        button.disabled = false;
        button.classList.remove('success');
        button.textContent = originalText;
      }, 2000);
    } else {
      throw new Error(response.error || 'Ошибка скачивания');
    }
    
  } catch (error) {
    console.error('Ошибка скачивания:', error);
    
    button.classList.remove('downloading');
    button.classList.add('error');
    button.textContent = 'Ошибка ✗';
    
    showErrorModal(error.message || 'Произошла ошибка при скачивании файла');
    
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove('error');
      button.textContent = originalText;
    }, 3000);
  }
}

async function downloadAllChapters(data) {
  try {
    const bookTitle = sanitizeFilename(data.title);
    const chapters = data.chapters.map((chapter, index) => ({
      chapter,
      index,
      chapterNum: String(index + 1).padStart(3, '0'),
      filename: `${bookTitle}/${String(index + 1).padStart(3, '0')} - ${sanitizeFilename(chapter.title)}.mp3`
    }));
    
    // Отправляем задачу на скачивание в background
    await chrome.runtime.sendMessage({
      action: 'downloadAll',
      chapters: chapters,
      bookTitle: bookTitle
    });
    
    // Обновляем UI
    const downloadBtn = document.getElementById('downloadAllBtn');
    downloadBtn.disabled = false;
    downloadBtn.style.cursor = 'pointer';
    downloadBtn.innerHTML = '<span class="icon">⏸️</span><span>Отменить скачивание</span>';
    
    const progressDiv = document.getElementById('downloadProgress');
    progressDiv.style.display = 'block';
    
  } catch (error) {
    console.error('Ошибка запуска скачивания:', error);
    showErrorModal(error.message || 'Не удалось начать скачивание');
  }
}

function showErrorModal(message) {
  const modal = document.getElementById('errorModal');
  const messageEl = document.getElementById('errorMessage');
  
  messageEl.textContent = message;
  modal.style.display = 'flex';
}

function hideErrorModal() {
  const modal = document.getElementById('errorModal');
  modal.style.display = 'none';
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}