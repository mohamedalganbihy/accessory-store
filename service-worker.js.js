// service-worker.js
const CACHE_NAME = 'maintenance-system-v1';
const SYNC_QUEUE = 'sync-queue';

// تثبيت Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll([
          '/',
          '/index.html',
          '/customers.html',
          '/orders.html',
          '/maintenance.html',
          '/sync-manager.js',
          'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
          'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap'
        ]);
      })
  );
});

// تفعيل Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// اعتراض الطلبات
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
  );
});

// مزامنة في الخلفية
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  try {
    const queue = await getSyncQueue();
    
    for (const item of queue) {
      try {
        await sendToServer(item);
        await removeFromQueue(item.id);
      } catch (error) {
        console.error('فشل مزامنة العنصر:', error);
      }
    }
  } catch (error) {
    console.error('فشل المزامنة:', error);
  }
}

async function getSyncQueue() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SYNC_QUEUE], 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromQueue(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MaintenanceDB', 1);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        db.createObjectStore(SYNC_QUEUE, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function sendToServer(data) {
  const response = await fetch('https://script.google.com/macros/s/AKfycbydFIBpXL6vRfYOt7R5zHfXb-FouKQ_H_ASw_GPf5oCFZW-e-cCtcOoDPfoVFFWz8Y/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) throw new Error('فشل الإرسال');
  return response.json();
}