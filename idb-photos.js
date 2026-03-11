// idb-photos.js
// Minimal IndexedDB helper til at gemme og hente billeder (Blob)

const PhotoStore = (function(){
  const DB_NAME = 'freezer-photos';
  const STORE = 'photos';
  const VERSION = 1;

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putPhoto(id, blob){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id, blob, createdAt: Date.now() });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deletePhoto(id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getPhotoURL(id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.objectStore(STORE).get(id).onsuccess = (e) => {
        const rec = e.target.result;
        if(!rec || !rec.blob){ resolve(null); return; }
        const url = URL.createObjectURL(rec.blob);
        resolve(url);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  return { putPhoto, deletePhoto, getPhotoURL };
})();
