function getByteSize(obj) {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
}

async function getTotalStorageSize() {
    const allItems = await browser.storage.local.get(null);
    return getByteSize(allItems);
}

async function pruneSomeFormDataItems(deleteProbability) {
    for (let i = 0; i < 1000; i++) {
        const storageKey = `cache_${i}`
        const result = await browser.storage.local.get(storageKey)
        const storageData = result[storageKey];
        if (storageData) {
            for (const key in storageData) {
                if (Math.random() < deleteProbability) {
                    delete storageData[key];
                }
            }
            await browser.storage.local.set({[storageKey]: storageData});
        }
    }
}

async function maybePruneCache(maxBytes = 4 * 1024 * 1024) {
    const usedBytes = await getTotalStorageSize();
    if (usedBytes > maxBytes) {
        console.warn('Storage limit approaching — pruning some data...');
        const targetBytes = maxBytes * 0.9
        await pruneSomeFormDataItems((usedBytes - targetBytes) / usedBytes);
    }
}

setTimeout(maybePruneCache, 30 * 1000);
setInterval(maybePruneCache, 60 * 60 * 1000);
