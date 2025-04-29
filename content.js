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
    const computedStyle = window.getComputedStyle(input);
    if (!suggestionFieldTypes.includes(input.type)
        || computedStyle.display === 'none'
        || computedStyle.visibility === 'hidden'
        || input.hasAttribute('data-no-autofill')
        || input.autocomplete === 'off'
        || input.autocomplete?.match(/cc-(number|exp|exp-month|exp-year|csc|type)/i)) {
        return true;
    }

    const filters = (await browser.storage.sync.get('filters')).filters;
    if (!filters) return false;
    const inputTags = getInputTags(target, input);
    return filters.some(filter => inputTags.some(tag => tag.toLowerCase().includes(filter.toLowerCase())));
}

function getInputTags(target, input) {
    const tagMap = new Map();

    function add(tag, priority, sntz = false) {
        if (sntz) {
            tag = sanitize(tag);
        }
        if (!tag) return;
        const existing = tagMap.get(tag);
        if (existing === undefined || priority < existing) {
            tagMap.set(tag, priority);
        }
    }

    // autocomplete
    add(input.autocomplete, 1);
    add(input.autocomplete.split(' ').pop(), 2);

    // id, testid
    add(input.id, 3);
    add(input.getAttribute('data-testid'), 3);

    // name title
    add(input.name, 10, true);
    add(input.title, 10, true);

    // label[for]
    if (input.id) {
        const label = target.querySelector(`label[for='${CSS.escape(input.id)}']`);
        if (label) {
            add(label.id, 10);
            add(label.textContent, 10, true);
        }
    }

    // aria-label
    add(input.getAttribute('aria-label'), 10, true);

    // aria-labelledby
    const labelledById = input.getAttribute('aria-labelledby');
    if (labelledById) {
        const labelEl = target.querySelector(`#${CSS.escape(labelledById)}`);
        if (labelEl) add(labelEl.textContent, 10, true);
    }

    // nearby label (e.g., <label>Email</label><input>)
    if (input.previousElementSibling?.tagName === 'LABEL') {
        add(input.previousElementSibling.textContent, 10, true);
    }

    // placeholder
    add(input.placeholder, 10, true);

    // input type
    if (['email', 'tel'].includes(input.type)) {
        add(input.type, 11);
    }

    // Build and sort: first by priority, then length descending
    return Array.from(tagMap.entries())
        .sort(([tagA, pA], [tagB, pB]) => {
            if (pA !== pB)
                return pA - pB;
            else
                return tagB.length - tagA.length;
        })
        .map(([tag]) => tag);
}

function getLocations() {
    const locations = [];
    locations.push(window.location.origin);
    locations.push('*');
    return locations;
}

function getTimes() {
    const hours = new Date().getHours();
    return [
        `${hours}-${hours + 1}`,
        '0-24'
    ]
}

function getDays() {
    const day = new Date().getDay();
    return [
        `${day}`,
        '0-6'
    ]
}

function getPreviousValues(previousValue) {
    if (!previousValue) {
        return [''];
    } else {
        return [sanitize(previousValue.slice(-100)), ''];
    }
}

function getInputValues(inputValue) {
    if (!inputValue) {
        return [''];
    } else {
        const limitedInputValue = inputValue.slice(-100)
        return [limitedInputValue, limitedInputValue?.toLowerCase()];
    }
}

function* getDataKeys(target, input, inputValue, previousValue) {
    const locations = getLocations();
    const days = getDays();
    const times = getTimes();
    const previousValues = getPreviousValues(previousValue);
    const inputTags = getInputTags(target, input);
    const inputValues = getInputValues(inputValue);
    for (const location of locations) {
        for (const previousValue of previousValues) {
            for (const time of times) {
                for (const day of days) {
                    for (const inputTag of inputTags) {
                        for (const inputValue of inputValues) {
                            yield hash(`${inputValue} ${location} ${day} ${time} ${previousValue} ${inputTag}`);
                        }
                    }
                }
            }
        }
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
            for (let dataKey of getDataKeys(target, input, inputValuePrefix, previousValue)) {
                const oldValue = storageData[dataKey];
                const valueToStore = getValueToStore(oldValue, newValue, randomNumber);
                if (valueToStore) {
                    storageData[dataKey] = valueToStore;
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
            input.dispatchEvent(new Event('input', { bubbles: true }));
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
