document.addEventListener('DOMContentLoaded', async () => {
    const $ = id => document.getElementById(id);

    const toggle = $('toggleSmartFill');
    const statusText = $('status');
    const addFilterBtn = $('addFilter');
    const filterList = $('filterList');
    const clearCacheBtn = $('clearCache');
    const confirmBox = $('confirmBox');
    const confirmYes = $('confirmYes');
    const confirmNo = $('confirmNo');
    const messageBox = $('message');

    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    const domain = new URL(tab.url).hostname;

    if (!domain) {
        toggle.disabled = true;
        statusText.textContent = 'SmartFill is disabled';
        return;
    }

    const setDomainStatus = async isEnabled => {
        await browser.storage.sync.set({[domain]: isEnabled});
        statusText.textContent = isEnabled ? `Enabled for ${domain}` : `Disabled for ${domain}`;
    };

    const initToggle = async () => {
        const {[domain]: isEnabled = true} = await browser.storage.sync.get(domain);
        toggle.checked = isEnabled;
        statusText.textContent = isEnabled ? `Enabled for ${domain}` : `Disabled for ${domain}`;
        toggle.addEventListener('change', () => setDomainStatus(toggle.checked));
    };

    const saveFilters = filters => {
        browser.storage.sync.set({filters: filters})
    };

    const getFilters = async () => {
        let filters = (await browser.storage.sync.get('filters')).filters;
        if (filters === undefined) {
            filters = ['search'];
            await saveFilters(filters);
        }
        return filters;
    };

    const createButton = (text, className, onClick) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = className;
        btn.addEventListener('click', onClick);
        return btn;
    };

    const createInput = (value, onChange) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter filter tag';
        input.value = value;
        input.addEventListener('change', onChange);
        return input;
    };

    const createFilterRow = (initialValue = '') => {
        const row = document.createElement('div');
        row.className = 'filter-row';

        const input = createInput(initialValue, async () => {
            const filters = await getFilters();
            if (input.value && !filters.includes(input.value)) {
                filters.push(input.value);
                await saveFilters(filters);
            }
        });

        const deleteBtn = createButton('✖', 'delete-btn', async () => {
            let filters = await getFilters();
            filters = filters.filter(f => f !== input.value);
            await saveFilters(filters);
            row.remove();
        });

        row.appendChild(input);
        row.appendChild(deleteBtn);
        filterList.appendChild(row);
    };

    const initFilters = async () => {
        const filters = await getFilters();
        filters.forEach(createFilterRow);
        addFilterBtn.addEventListener('click', () => createFilterRow());
    };

    const initClearCache = () => {
        clearCacheBtn.addEventListener('click', () => confirmBox.style.display = 'block');
        confirmYes.addEventListener('click', async () => {
            await browser.storage.local.clear();
            confirmBox.style.display = 'none';
            messageBox.textContent = 'Cache cleared successfully!';
            messageBox.style.display = 'block';
            setTimeout(() => messageBox.style.display = 'none', 3000);
        });
        confirmNo.addEventListener('click', () => confirmBox.style.display = 'none');
    };

    // Initialize everything
    await initToggle();
    await initFilters();
    initClearCache();
});
