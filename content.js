function sanitize(str) {
    if (!str) return null;
    return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hashToInt(str) {
    return str.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
}

function hash(str) {
    return hashToInt(str).toString(36);
}

function getStorageKey(inputValue) {
    return 'cache_' + hashToInt(inputValue.toLowerCase().slice(-3)) % 1000;
}

let cachedFilters = null;

async function getCachedFilters() {
    if (cachedFilters === null) {
        const {filters} = await browser.storage.sync.get('filters');
        cachedFilters = filters || [];
    }
    return cachedFilters;
}


const suggestionFieldTypes = [
    'date',
    'datetime',
    'datetime-local',
    'email',
    'month',
    'number',
    'search',
    'tel',
    'text',
    'textarea',
    'time',
    'url',
    'week'
];

async function shouldIgnoreInput(target, input) {
    if (input.disabled
        || input.readOnly
        || input.hidden
        || input.style.display === 'none'
        || input.style.visibility === 'hidden'
        || input.style.opacity === '0'
        || input.style.pointerEvents === 'none'
        || !suggestionFieldTypes.includes(input.type)
        || input.hasAttribute('data-no-autofill')
        || (input.form?.autocomplete === 'off')
        || input.autocomplete === 'off'
        || input.autocomplete?.match(/cc-(number|exp|exp-month|exp-year|csc|type)/i)) {
        return true;
    }

    const filters = getCachedFilters();
    if (!filters?.length) return false;
    const inputTags = getInputTags(target, input);
    return filters.some(filter => inputTags.some(tag => tag.toLowerCase().includes(filter.toLowerCase())));
}

function addPriority(priorityList, value, priority, sntz = false) {
    if (sntz) value = sanitize(value);
    if (!value) return;
    if (priorityList.some(e => e.value === value)) return;
    let i = priorityList.findIndex(e => e.priority < priority);
    priorityList.splice(i === -1 ? priorityList.length : i, 0, {value, priority});
}

function getInputTags(target, input) {
    const priorityList = [];

    // autocomplete
    addPriority(priorityList, input.autocomplete, 2);
    addPriority(priorityList, input.autocomplete.split(' ').pop(), 1);

    // id, testid
    addPriority(priorityList, input.id, 98);
    addPriority(priorityList, input.getAttribute('data-testid'), 97);

    // title
    addPriority(priorityList, input.title, 30, true);

    // name
    if (/[.[\]_/\\\s]/.test(input.name)) {
        const parts = input.name.split(/[.\[\]_/\\\s]+/).filter(Boolean);
        parts.forEach((_, i) => {
            const suffix = parts.slice(i).join('');
            addPriority(priorityList, suffix, 40 - i, true);
        });
    } else {
        addPriority(priorityList, input.name, 40, true);
    }

    // label[for]
    if (input.id) {
        const label = target.querySelector(`label[for='${CSS.escape(input.id)}']`);
        if (label) {
            addPriority(priorityList, label.id, 99);
            addPriority(priorityList, label.textContent, 20, true);
        }
    }

    // aria-label
    addPriority(priorityList, input.getAttribute('aria-label'), 20, true);

    // aria-labelledby
    const labelledById = input.getAttribute('aria-labelledby');
    if (labelledById) {
        const labelEl = target.querySelector(`#${CSS.escape(labelledById)}`);
        if (labelEl) addPriority(priorityList, labelEl.textContent, 30, true);
    }

    // nearby label (e.g., <label>Email</label><input>)
    if (input.previousElementSibling?.tagName === 'LABEL') {
        addPriority(priorityList, input.previousElementSibling.textContent, 40, true);
    }

    // placeholder
    addPriority(priorityList, input.placeholder, 70, true);

    // input type
    if (['email', 'tel'].includes(input.type)) {
        addPriority(priorityList, input.type, 10);
    }

    return priorityList;
}

function getLocations() {
    const priorityList = [];
    addPriority(priorityList, window.location.origin + window.location.pathname, 90);
    addPriority(priorityList, document.title, 40);
    addPriority(priorityList, window.location.origin, 30);
    addPriority(priorityList, '*', 1);
    return priorityList;
}

function getTimes() {
    const priorityList = [];
    const hours = new Date().getHours();
    const h3 = Math.floor(hours / 3) * 3
    const h6 = Math.floor(hours / 6) * 6
    const h12 = Math.floor(hours / 12) * 12
    addPriority(priorityList, `${hours}-${hours + 1}`, 96);
    addPriority(priorityList, `${h3}-${h3 + 3}`, 89);
    addPriority(priorityList, `${h6}-${h6 + 6}`, 75);
    addPriority(priorityList, `${h12}-${h12 + 12}`, 50);
    addPriority(priorityList, '0-24', 1);
    return priorityList;
}

function getDays() {
    const priorityList = [];
    const day = new Date().getDay();
    addPriority(priorityList, `${day}`, 86);
    addPriority(priorityList, (day >= 1 && day <= 5) ? '1-5' : '0,6', 50);
    addPriority(priorityList, '0-6', 1);
    return priorityList;
}

function getPreviousValues(previousValue) {
    const priorityList = [];
    if (previousValue) {
        addPriority(priorityList, sanitize(previousValue.slice(-100)), 98);
        addPriority(priorityList, sanitize(previousValue.slice(-5)), 50);
    }
    addPriority(priorityList, ' ', 1);
    return priorityList;
}

function getInputValues(inputValue) {
    const priorityList = [];
    if (!inputValue) {
        addPriority(priorityList, ' ', 1);
    } else {
        const limitedInputValue = inputValue.slice(-100)
        addPriority(priorityList, limitedInputValue, 100);
        addPriority(priorityList, limitedInputValue.toLowerCase(), 95);
        addPriority(priorityList, limitedInputValue.slice(-10).toLowerCase(), 40);
    }
    return priorityList;
}

function* iteratePriority(iterators, reverse = false) {
    iterators = iterators.map(iterator => ({...iterator.next(), iterator}));
    yield iterators.map(it => it.value?.value);

    while (iterators.some(it => !it.done)) {
        let priorityIterator;
        if (reverse) {
            priorityIterator = iterators.reduce((min, it) => !it.done && (min.done || it.value.priority < min.value.priority) ? it : min);
        } else {
            priorityIterator = iterators.reduce((max, it) => !it.done && (max.done || it.value.priority > max.value.priority) ? it : max);
        }
        const next = priorityIterator.iterator.next();
        priorityIterator.done = next.done;
        if (!next.done) {
            priorityIterator.value = next.value;
            yield iterators.map(it => it.value?.value);
        }
    }
}

function* getDataKeys(target, input, inputValue, previousValue, reverse = false) {
    let priorityLists = [
        getLocations(),
        getDays(),
        getTimes(),
        getPreviousValues(previousValue),
        getInputTags(target, input),
        getInputValues(inputValue)
    ];

    if (reverse) {
        priorityLists = priorityLists.map(list => list.toReversed());
    }
    const priorityIterators = priorityLists.map(array => array[Symbol.iterator]())

    for (const [location, day, time, previousValue, inputTag, inputValue] of iteratePriority(priorityIterators, reverse)) {
        yield hash(`${inputValue} ${location} ${day} ${time} ${previousValue} ${inputTag}`);
    }
}

function getValueToStore(oldValue, newValue, randomNumber) {
    if (!oldValue) {
        return newValue;
    } else if (!newValue) {
        return oldValue;
    }

    if (randomNumber < 0.9) {
        const minLength = Math.min(oldValue.length, newValue.length);
        const oldValueLowered = oldValue.toLowerCase();
        const newValueLowered = newValue.toLowerCase();
        let i = 0;
        while (i < minLength && oldValueLowered[i] === newValueLowered[i]) {
            i++;
        }
        if (i >= 1) {
            return newValue.substring(0, i);
        }
    }

    return newValue;
}

let previousInput;
let previousValue;

function saveFormData(target, input) {
    const inputValue = input.value;
    setTimeout(async () => {
        if (!inputValue) {
            return;
        }

        if (input !== previousInput) {
            previousValue = previousInput?.value;
            previousInput = input;
        }

        const randomNumber = Math.random();

        for (let i = 0; i < Math.min(inputValue.length, 1000); i++) {
            const inputValuePrefix = inputValue.substring(Math.max(0, i - 100), i);
            const newValue = inputValue.slice(i, i + 100);
            const storageKey = getStorageKey(inputValuePrefix);
            const result = await browser.storage.local.get(storageKey);
            const storageData = result[storageKey] || {};
            for (let dataKey of getDataKeys(target, input, inputValuePrefix, previousValue, true)) {
                const oldValue = storageData[dataKey];
                const valueToStore = getValueToStore(oldValue, newValue, randomNumber);
                if (valueToStore) {
                    storageData[dataKey] = valueToStore;
                }
                if (!oldValue || oldValue === newValue) {
                    break;
                }
            }
            await browser.storage.local.set({[storageKey]: storageData});
        }
    }, 0);
}

async function getSuggestion(target, input) {
    const storageKey = getStorageKey(input.value);
    const result = await browser.storage.local.get(storageKey);
    const storageData = result[storageKey];
    if (!storageData) return null;
    for (let dataKey of getDataKeys(target, input, input.value, previousInput?.value)) {
        const value = storageData[dataKey];
        if (value) return value;
    }
    return null;
}

function showSuggestion(target, input) {
    const inputValue = input.value;
    const inputLength = input.value.length || 0;
    if (input.disableSuggestion ||
        input.selectionStart !== inputLength ||
        input.selectionEnd !== inputLength) {
        return;
    }
    getSuggestion(target, input).then(suggestion => {
        if (suggestion && input.value === inputValue && target.activeElement === input) {
            input.setRangeText(suggestion, inputLength, inputLength, 'select');
            input.dispatchEvent(new Event('input', {bubbles: true}));
        }
    });
}

function handleKeyDown(target, e) {
    const input = e.target;
    const inputLength = input.value.length || 0
    if ((e.key === 'Tab' || e.key === 'Enter') &&
        input.selectionStart > 0 &&
        input.selectionStart < inputLength &&
        input.selectionEnd === inputLength) {
        e.preventDefault();
        input.setSelectionRange(inputLength, inputLength);
        showSuggestion(target, input);
    } else if (e.key.length !== 1 || e.ctrlKey || e.metaKey) {
        input.disableSuggestion = 'True';
    } else {
        delete input.disableSuggestion;
    }
}

async function attachEventListenersToInput(target, input) {
    if (!input.dataset.processed && !(await shouldIgnoreInput(target, input))) {
        input.addEventListener('focus', () => showSuggestion(target, input));
        input.addEventListener('click', () => showSuggestion(target, input));
        input.addEventListener('keydown', e => handleKeyDown(target, e));
        input.addEventListener('input', () => showSuggestion(target, input));
        input.addEventListener('change', () => saveFormData(target, input));
        input.addEventListener('blur', () => saveFormData(target, input));
        input.dataset.processed = 'true';
    }
}

function attachEventListenersToTarget(target) {
    target.querySelectorAll('input, textarea').forEach(input =>
        attachEventListenersToInput(target, input)
    );
}

function attachEventListeners() {
    attachEventListenersToTarget(document);
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDocument) {
                attachEventListenersToTarget(iframeDocument);
            }
        } catch (e) {
        }
    });
}

let mutationTimeout;

function attachEventListenersAfterMutation() {
    const observer = new MutationObserver(() => {
        clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(attachEventListeners, 500);
    });
    observer.observe(document.body, {childList: true, subtree: true});
}

if (document.location.hostname) {
    browser.storage.sync.get([document.location.hostname], result => {
        if (result[document.location.hostname] === false) {
            return;
        }

        attachEventListeners();
        attachEventListenersAfterMutation();
    });
}

//browser.storage.local.get(null, data => console.log(data))
