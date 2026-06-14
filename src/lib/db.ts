import { VideoProject } from '../types';

const DB_NAME = 'ScreenRecorderDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

// Fallback in-memory storage for sandboxed environments
const memoryStore: Record<string, VideoProject> = {};

function isIndexedDBAvailable(): boolean {
  try {
    return 'indexedDB' in window && window.indexedDB !== null;
  } catch (e) {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not supported or permission denied in this sandbox'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error || new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveProject(project: VideoProject): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(project);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.warn('DB Write failed, saving to memory fallback.');
        memoryStore[project.id] = project;
        resolve();
      };
    });
  } catch (error) {
    console.warn('IndexedDB unavailable or blocked, using memory storage instead.', error);
    memoryStore[project.id] = project;
  }
}

export async function getAllProjects(): Promise<VideoProject[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const dbProjects = request.result as VideoProject[];
        // Combine with memory project items (just in case some failed to write to DB)
        const allItems = [...dbProjects];
        const dbIds = new Set(dbProjects.map(p => p.id));
        for (const mProj of Object.values(memoryStore)) {
          if (!dbIds.has(mProj.id)) {
            allItems.push(mProj);
          }
        }
        allItems.sort((a, b) => b.createdAt - a.createdAt);
        resolve(allItems);
      };

      request.onerror = () => {
        resolve(Object.values(memoryStore).sort((a, b) => b.createdAt - a.createdAt));
      };
    });
  } catch (error) {
    return Object.values(memoryStore).sort((a, b) => b.createdAt - a.createdAt);
  }
}

export async function deleteProject(id: string): Promise<void> {
  delete memoryStore[id];
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to delete item'));
      };
    });
  } catch (error) {
    console.warn('Delete failed, fallback memory storage items cleaned.');
  }
}
