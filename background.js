function getByteSize(obj) {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
}

async function getTotalStorageSize() {
    const allItems = await browser.storage.local.get(null);
    return getByteSize(allItems);
}

async function pruneSomeFormDataItems() {
    let result = await browser.storage.local.get('savedFormData');
    let savedData = result.savedFormData;
    for (let key in savedData) {
        if (Math.random() < 0.031) {
            delete savedData[key];
        }
    }
    browser.storage.local.set({'savedFormData': savedData});
}

async function maybePruneCache(maxBytes = 4 * 1024 * 1024) {
    const used = await getTotalStorageSize();
    if (used > maxBytes) {
        console.warn("Storage limit approaching — pruning some data...");
        await pruneSomeFormDataItems();
        browser.storage.local.get(null, data => console.log(data))
    }
}

setTimeout(maybePruneCache, 30000);
