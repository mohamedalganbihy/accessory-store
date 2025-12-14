// sync-manager.js - مدير المزامنة المركزي
class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.syncListeners = [];
    
    this.init();
  }
  
  init() {
    // مراقبة حالة الاتصال
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // بدء المزامنة التلقائية
    this.startAutoSync();
  }
  
  // إضافة مستمع للأحداث
  addListener(callback) {
    this.syncListeners.push(callback);
  }
  
  // إعلام جميع المستمعين
  notifyListeners(event, data) {
    this.syncListeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('خطأ في مستمع المزامنة:', error);
      }
    });
  }
  
  // المزامنة التلقائية
  startAutoSync() {
    // مزامنة كل دقيقة إذا كان هناك اتصال
    setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.autoSync();
      }
    }, 60000);
    
    // محاولة مزامنة عند فتح الصفحة
    if (this.isOnline) {
      setTimeout(() => this.autoSync(), 5000);
    }
  }
  
  async autoSync() {
    if (this.syncInProgress || !this.isOnline) return;
    
    this.syncInProgress = true;
    this.notifyListeners('sync-start', {});
    
    try {
      // جلب البيانات من السحابة
      await this.pullFromCloud();
      
      // دفع البيانات للسحابة
      await this.pushToCloud();
      
      this.notifyListeners('sync-complete', { success: true });
    } catch (error) {
      this.notifyListeners('sync-error', { error: error.message });
    } finally {
      this.syncInProgress = false;
    }
  }
  
  async pullFromCloud() {
    // جلب البيانات من جميع الجداول
    const modules = ['customers', 'maintenance', 'orders'];
    
    for (const module of modules) {
      try {
        const data = await this.fetchFromCloud(module);
        this.mergeData(module, data);
      } catch (error) {
        console.error(`فشل جلب بيانات ${module}:`, error);
      }
    }
  }
  
  async pushToCloud() {
    // إرسال قائمة المزامنة
    const syncQueue = this.getSyncQueue();
    
    if (syncQueue.length === 0) return;
    
    for (const item of syncQueue) {
      try {
        await this.sendToCloud(item);
        this.markAsSynced(item);
      } catch (error) {
        console.error('فشل مزامنة العنصر:', item, error);
      }
    }
  }
  
  // وظائف التخزين المحلي
  getLocalData(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
  
  setLocalData(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('خطأ في حفظ البيانات المحلية:', error);
      return false;
    }
  }
  
  getSyncQueue() {
    return this.getLocalData('sync_queue');
  }
  
  addToSyncQueue(item) {
    const queue = this.getSyncQueue();
    queue.push({
      ...item,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      attempts: 0
    });
    this.setLocalData('sync_queue', queue);
    this.notifyListeners('queue-updated', { count: queue.length });
  }
  
  markAsSynced(syncItem) {
    const queue = this.getSyncQueue();
    const index = queue.findIndex(item => item.id === syncItem.id);
    if (index !== -1) {
      queue.splice(index, 1);
      this.setLocalData('sync_queue', queue);
    }
  }
  
  // دمج البيانات
  mergeData(module, cloudData) {
    const localKey = `${module}_local`;
    const localData = this.getLocalData(localKey);
    
    const merged = this.mergeArrays(localData, cloudData);
    this.setLocalData(localKey, merged);
    
    this.notifyListeners('data-updated', { module, data: merged });
  }
  
  mergeArrays(localArray, cloudArray) {
    const merged = [...localArray];
    const lookup = {};
    
    // إنشاء lookup للبيانات المحلية
    localArray.forEach(item => {
      if (item.id) lookup[item.id] = item;
    });
    
    // دمج البيانات السحابية
    cloudArray.forEach(cloudItem => {
      if (cloudItem.id && lookup[cloudItem.id]) {
        // تحديث العنصر الموجود
        const index = merged.findIndex(item => item.id === cloudItem.id);
        if (index !== -1) {
          merged[index] = { ...merged[index], ...cloudItem, synced: true };
        }
      } else {
        // إضافة عنصر جديد
        merged.push({ ...cloudItem, synced: true });
      }
    });
    
    return merged;
  }
  
  // وظائف المساعدة
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  async fetchFromCloud(module) {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=get${module.charAt(0).toUpperCase() + module.slice(1)}`);
    if (!response.ok) throw new Error('فشل في جلب البيانات');
    const result = await response.json();
    return result.success ? result.data : [];
  }
  
  async sendToCloud(syncItem) {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncItem)
    });
    
    if (!response.ok) throw new Error('فشل في إرسال البيانات');
    return await response.json();
  }
  
  handleOnline() {
    this.isOnline = true;
    this.notifyListeners('online', {});
    this.autoSync();
  }
  
  handleOffline() {
    this.isOnline = false;
    this.notifyListeners('offline', {});
  }
}

// إنشاء نسخة عامة من مدير المزامنة
const syncManager = new SyncManager();