function sanitize(str) {
    return str?.toLowerCase()?.replace(/[^a-z0-9]/g, '');
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

function shouldIgnoreInput(input) {
    let computedStyle = window.getComputedStyle(input);
    return !suggestionFieldTypes.includes(input.type)
        || computedStyle.display === 'none'
        || computedStyle.visibility === 'hidden'
        || input.hasAttribute('data-no-autofill')
        || input.autocomplete?.match(/cc-(number|exp|exp-month|exp-year|csc|type)/i);
}

function getInputTags(target, input) {
    let fieldNames = new Set();

    if (input.autocomplete && input.autocomplete !== 'off') {
        fieldNames.add(input.autocomplete);
        fieldNames.add(input.autocomplete.split(' ').at(-1));
    }
    if (input.id) fieldNames.add(input.id);
    if (input.getAttribute('data-testid')) fieldNames.add(input.getAttribute('data-testid'));

    let sanitizedFieldName = sanitize(input.name);
    if (sanitizedFieldName) fieldNames.add(sanitizedFieldName);

    let label = target.querySelector(`label[for='${input.id}']`);
    if (label) {
        if (label.id) fieldNames.add(label.id);
        let sanitizedLabel = sanitize(label.textContent);
        if (sanitizedLabel) fieldNames.add(sanitizedLabel);
    }

    if (input.getAttribute('aria-label')) fieldNames.add(input.getAttribute('aria-label'));

    let sanitizedPlaceholder = sanitize(input.placeholder);
    if (sanitizedPlaceholder) fieldNames.add(sanitizedPlaceholder);
    if (['email', 'tel'].includes(input.type)) fieldNames.add(input.type);

    return Array.from(fieldNames).filter(f => f.length >= 3);
}

function getLocations() {
    let locations = []
    locations.push(window.location.origin);
    locations.push('*');
    return locations;
}

function getTimes() {
    let hours = new Date().getHours();
    return [
        `${hours}-${hours + 1}`,
        '0-24'
    ]
}

function getDays() {
    let day = new Date().getDay();
    return [
        `${day}`,
        '0-6'
    ]
}

let previousValue;

function getPreviousValues() {
    if (!previousValue) {
        return ['']
    } else {
        return [sanitize(previousValue.slice(-100)), ''];
    }
}

function getInputValues(inputValue) {
    if (!inputValue) {
        return ['']
    } else {
        let limitedInputValue = inputValue.slice(-100)
        return [limitedInputValue, limitedInputValue?.toLowerCase()];
    }
}

function* getDataKeys(target, input, inputValue) {
    let inputValues = getInputValues(inputValue);
    let locations = getLocations();
    let days = getDays();
    let times = getTimes();
    let previousValues = getPreviousValues();
    let inputTags = getInputTags(target, input);
    for (const inputValue of inputValues) {
        for (const location of locations) {
            for (const day of days) {
                for (const time of times) {
                    for (const previousValue of previousValues) {
                        for (const inputTag of inputTags) {
                            yield hash(`${inputValue} ${location} ${day} ${time} ${previousValue} ${inputTag}`);
                        }
                    }
                }
            }
        }
    }
}

function saveFormData(target, input) {
    setTimeout(() => {
        if (shouldIgnoreInput(input) || !input.value) {
            return;
        }
        for (let i = 0; i < Math.min(input.value.length, 1000); i++) {
            let inputValue = input.value.substring(Math.max(0, i - 100), i);
            let storageKey = getStorageKey(inputValue);
            browser.storage.local.get(storageKey).then(result => {
                let storageData = result[storageKey] || {};
                for (let dataKey of getDataKeys(target, input, inputValue)) {
                    storageData[dataKey] = input.value.slice(i, i + 100);
                }
                browser.storage.local.set({[storageKey]: storageData});
            });
        }
        previousValue = input.value;
    }, 0);
}

async function getSuggestion(target, input) {
    if (shouldIgnoreInput(input)) return null;
    let storageKey = getStorageKey(input.value);
    let result = await browser.storage.local.get(storageKey);
    let storageData = result[storageKey];
    if (!storageData) return null;
    for (let dataKey of getDataKeys(target, input, input.value)) {
        let value = storageData[dataKey];
        if (value) return value;
    }
    return null;
}

function showSuggestion(target, input) {
    let inputValue = input.value;
    let inputLength = input.value.length || 0
    if (input.disableSuggestion ||
        input.selectionStart !== inputLength ||
        input.selectionEnd !== inputLength) {
        return;
    }
    getSuggestion(target, input).then(suggestion => {
        if (suggestion && input.value === inputValue && target.activeElement === input) {
            input.setRangeText(suggestion, inputLength, inputLength, 'select');
        }
    });
}

function handleKeyDown(target, e) {
    let input = e.target;
    let inputLength = input.value.length || 0
    if ((e.key === 'Tab' || e.key === 'Enter') &&
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

function attachEventListenersToInput(target, input) {
    if (!input.dataset.processed) {
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
            let iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
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
