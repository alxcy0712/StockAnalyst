import type { Asset } from '../types';

interface CacheEntry {
  assetId: string;
  data: any;
  timestamp: number;
  tradingDay: string;
  assetHash: string;
}

const DB_NAME = 'StockAnalystCache';
const DB_VERSION = 1;
const STORE_NAME = 'assetHistory';

class DataCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async get(assetId: string, asset: Asset, cacheType: 'nav' = 'nav'): Promise<any | null> {
    await this.init();
    if (!this.db) return null;

    // 分离缓存键：日线用 ${id}_nav，K线用 ${id}_kline
    const cacheKey = `${assetId}_${cacheType}`;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const entry: CacheEntry | undefined = request.result;
        
        if (!entry) {
          resolve(null);
          return;
        }

        // 检查资产是否变动
        const currentHash = this.generateAssetHash(asset);
        if (entry.assetHash !== currentHash) {
          console.log(`Cache invalidated for ${asset.code}: asset data changed`);
          resolve(null);
          return;
        }

        // 检查是否过期
        if (this.isExpired(entry)) {
          console.log(`Cache expired for ${asset.code}`);
          resolve(null);
          return;
        }

        console.log(`Cache hit for ${asset.code}`);
        resolve(entry.data);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async set(assetId: string, data: any, asset: Asset, cacheType: 'nav' = 'nav'): Promise<void> {
    await this.init();
    if (!this.db) return;

    // 分离缓存键
    const cacheKey = `${assetId}_${cacheType}`;

    const entry: CacheEntry = {
      assetId: cacheKey,
      data,
      timestamp: Date.now(),
      tradingDay: this.getLastTradingDay(),
      assetHash: this.generateAssetHash(asset),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async invalidate(assetId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    const cacheKey = `${assetId}_nav`;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(cacheKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('All cache cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private isExpired(entry: CacheEntry): boolean {
    const now = new Date();
    const cacheTime = new Date(entry.timestamp);

    // 获取今天的收盘时间（15:00）
    const todayClose = new Date();
    todayClose.setHours(15, 0, 0, 0);

    // 如果是昨天或更早的缓存，过期
    if (now.getDate() !== cacheTime.getDate() || 
        now.getMonth() !== cacheTime.getMonth() ||
        now.getFullYear() !== cacheTime.getFullYear()) {
      return true;
    }

    // 如果缓存是今天收盘前创建的，且现在已经收盘了，过期
    if (cacheTime < todayClose && now >= todayClose) {
      return true;
    }

    return false;
  }

  private generateAssetHash(asset: Asset): string {
    // 生成资产数据的哈希，用于检测变动
    const hashData = {
      code: asset.code,
      type: asset.type,
      purchaseDate: asset.purchaseDate,
      purchasePrice: asset.purchasePrice,
      quantity: asset.quantity,
      currency: asset.currency,
    };
    return JSON.stringify(hashData);
  }

  private getLastTradingDay(): string {
    const now = new Date();
    const day = now.getDay();
    
    // 如果是周末，回退到周五
    if (day === 0) {
      now.setDate(now.getDate() - 2);
    } else if (day === 6) {
      now.setDate(now.getDate() - 1);
    }

    return now.toISOString().split('T')[0];
  }
}

// 单例模式导出
export const dataCache = new DataCache();

// 初始化缓存
export async function initCache(): Promise<void> {
  try {
    await dataCache.init();
    console.log('Data cache initialized');
  } catch (error) {
    console.warn('Failed to initialize cache:', error);
  }
}
