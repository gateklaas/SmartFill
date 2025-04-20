function getByteSize(obj) {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
}

async function getTotalStorageSize() {
    const allItems = await browser.storage.local.get(null);
    return getByteSize(allItems);
}

async function pruneSomeFormDataItems() {
    for (let i = 0; i < 1000; i++) {
        let storageKey = `cache_${i}`
        browser.storage.local.get(storageKey).then(result => {
            let storageData = result[storageKey];
            if (storageData) {
                for (let key in storageData) {
                    if (Math.random() < 0.031) {
                        delete storageData[key];
                    }
                }
                browser.storage.local.set({[storageKey]: storageData});
            }
        });
    }
}

async function maybePruneCache(maxBytes = 4 * 1024 * 1024) {
    const used = await getTotalStorageSize();
    if (used > maxBytes) {
        console.warn('Storage limit approaching — pruning some data...');
        await pruneSomeFormDataItems();
    }
}

setTimeout(maybePruneCache, 30000);
