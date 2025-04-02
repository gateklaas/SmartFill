function sanitize(str) {
    return str?.toLowerCase()?.replace(/[^a-z0-9]/g, '');
}

function hash(str) {
    return str.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0).toString(36);
}

let selectionTimeout;
function setSelectionRangeTimeout(field, start, end) {
    setSelectionRange(field, start, end)
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => setSelectionRange(field, start, end), 40); // needed for firefox-android
}

function setSelectionRange(input, selectionStart, selectionEnd) {
  if (input.setSelectionRange) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
  else if (input.createTextRange) {
    var range = input.createTextRange();
    range.collapse(true);
    range.moveEnd('character', selectionEnd);
    range.moveStart('character', selectionStart);
    range.select();
  }
}

const autocompleteFieldTypes = [
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
function shouldIgnoreField(field) {
    let computedStyle = window.getComputedStyle(field);
    return !autocompleteFieldTypes.includes(field.type)
        || computedStyle.display === 'none'
        || computedStyle.visibility === 'hidden'
        || field.hasAttribute('data-no-autofill')
        || field.autocomplete?.match(/cc-(number|exp|exp-month|exp-year|csc|type)/i);
}

function getFieldNames(target, field) {
    let fieldNames = new Set();

    if (field.autocomplete) fieldNames.add(field.autocomplete);
    if (field.id) fieldNames.add(field.id);
    if (field.getAttribute('data-testid')) fieldNames.add(field.getAttribute('data-testid'));

    let sanitizedFieldName = sanitize(field.name);
    if (sanitizedFieldName) fieldNames.add(sanitizedFieldName);

    let label = target.querySelector(`label[for='${field.id}']`);
    if (label) {
        if (label.id) fieldNames.add(label.id);
        let sanitizedLabel = sanitize(label.textContent);
        if (sanitizedLabel) fieldNames.add(sanitizedLabel);
    }

    if (field.getAttribute('aria-label')) fieldNames.add(field.getAttribute('aria-label'));

    let sanitizedPlaceholder = sanitize(field.placeholder);
    if (sanitizedPlaceholder) fieldNames.add(sanitizedPlaceholder);
    if (['email', 'tel'].includes(field.type)) fieldNames.add(field.type);

    return Array.from(fieldNames).filter(f => f.length >= 3);
}

function getLocations() {
    let locations = []
    if (window.location.pathname.length > 1) {
        locations.push(window.location.origin + window.location.pathname);
    }
    locations.push(document.title);
    locations.push(window.location.origin);
    locations.push('*');
    return locations;
}

function getTimes() {
    let hours = new Date().getHours();
    let h3 = Math.floor(hours / 3) * 3
    let h6 = Math.floor(hours / 6) * 6
    let h12 = Math.floor(hours / 12) * 12
    return [
        `${hours}-${hours + 1}`,
        `${h3}-${h3 + 3}`,
        `${h6}-${h6 + 6}`,
        `${h12}-${h12 + 12}`,
        '0-24'
    ]
}

function getDays() {
    let day = new Date().getDay();
    return [
        `${day}`,
        (day >= 1 && day <= 5) ? '1-5' : '0,6',
        '0-6'
    ]
}

let previousValue;
function getPreviousValues() {
    if (previousValue) {
        return [previousValue, 'null']
    } else {
        return ['null']
    }
}

function* getDataKeys(target, field) {
    let locations = getLocations();
    let days = getDays();
    let times = getTimes();
    let previousValues = getPreviousValues();
    let fieldNames = getFieldNames(target, field);
    for (const location of locations) {
        for (const day of days) {
            for (const time of times) {
                for (const previousValue of previousValues) {
                    for (const fieldName of fieldNames) {
                        yield hash(`${location} ${day} ${time} ${previousValue} ${fieldName}`);
                    }
                }
            }
        }
    }
}

function saveFormData(target, field) {
    if (shouldIgnoreField(field) || !field.value || field.value.length > 200) {
        return;
    }

    browser.storage.local.get('savedFormData').then(result => {
        let savedData = result.savedFormData || {};
        for (let dataKey of getDataKeys(target, field)) {
            previousValue = field.value;
            savedData[dataKey] = field.value;
        };
        browser.storage.local.set({ 'savedFormData': savedData });
    });
}

async function getAutocompleteValue(target, field) {
    if (shouldIgnoreField(field)) return null;
    if (field.value && field.autocompleteValue?.toLowerCase()?.startsWith(field.value?.toLowerCase())) {
        return field.autocompleteValue;
    }
    let result = await browser.storage.local.get('savedFormData');
    let savedData = result.savedFormData;
    if (!savedData) return null;
    for (let dataKey of getDataKeys(target, field)) {
        let value = savedData[dataKey];
        if (value && (!field.value || value.toLowerCase().startsWith(field.value.toLowerCase()))) {
            return value;
        }
    }
    return null;
}

function showCustomAutocomplete(target, field) {
    if (field.disableAutocomplete || typeof field.selectionStart === 'number' && field.selectionStart != field.value.length) {
        delete field.autocompleteValue;
        return;
    }
    getAutocompleteValue(target, field).then(value => {
        if (!value) {
            delete field.autocompleteValue;
            return;
        }
        field.autocompleteSplit = field.value.length || 0;
        field.autocompleteValue = value;
        let suggestion = value.substring(field.autocompleteSplit)
        if (suggestion.length > 0) {
            let inputText = field.value;
            field.value += suggestion;
            setSelectionRangeTimeout(field, inputText.length, field.value.length)
        }
    });
}

function handleKeyDown(e) {
    let field = e.target;
    if (e.key === 'Backspace' || e.key === 'Process') {
        field.disableAutocomplete = 'True';
    } else {
        delete field.disableAutocomplete;
    }
    if (field.autocompleteValue?.toLowerCase() !== field.value?.toLowerCase()) return;
    if (e.key === 'Backspace' || e.key === 'Process' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Delete') {
        field.value = field.value.substring(0, field.autocompleteSplit)
        delete field.autocompleteValue;
    } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        setSelectionRangeTimeout(field, field.value.length, field.value.length)
        delete field.autocompleteValue;
    }
}

function attachEventListenersToField(target, field) {
    if (!field.dataset.processed) {
        field.addEventListener('focus', () => showCustomAutocomplete(target, field));
        field.addEventListener('click', () => showCustomAutocomplete(target, field));
        field.addEventListener('input', () => showCustomAutocomplete(target, field));
        field.addEventListener('compositionend', () => showCustomAutocomplete(target, field));
        field.addEventListener('compositionstart', () => field.disableAutocomplete = 'True');
        field.addEventListener('keydown', handleKeyDown);
        field.addEventListener('change', () => saveFormData(target, field));
        field.addEventListener('blur', () => saveFormData(target, field));
        field.dataset.processed = 'true';
    }
}

function attachEventListenersToTarget(target) {
    target.querySelectorAll('input, textarea').forEach(field => {
        attachEventListenersToField(target, field);
    });
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
    observer.observe(document.body, { childList: true, subtree: true });
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
//browser.storage.local.set({ 'savedFormData': {} });