function sanitize(str) {
    return str?.toLowerCase()?.replace(/[^a-z0-9]/g, '');
}

function hash(str) {
    return str.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0).toString(36);
}

let lastSelection;
let selectionTimeout;
function setSelectionRangeForced(input, start, end) {
    clearTimeout(selectionTimeout);
    lastSelection = { input, start, end }
    setTimeout(() => setSelectionRange(input, start, end), 10);
    selectionTimeout = setTimeout(() => lastSelection = null, 200);
}

function checkSelection(input) {
    if (lastSelection?.input == input && (input.selectionStart != lastSelection.start || input.selectionEnd != lastSelection.end)) {
        setSelectionRangeForced(input, lastSelection.start, lastSelection.end);
    }
}

function setSelectionRange(input, start, end) {
  if (input.setSelectionRange) {
    input.setSelectionRange(start, end, 'backward');
  } else if (input.createTextRange) {
    var range = input.createTextRange();
    range.collapse(true);
    range.moveEnd('character', end);
    range.moveStart('character', start);
    range.select();
  }
  console.log(`select ${start}-${end}`)
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

function showCustomAutocomplete(target, field, e) {
    if (field.disableAutocomplete) {
        console.log("field.disableAutocomplete")
        delete field.autocompleteValue;
        return;
    }
    let value = 'aaaaaaaa'
    //getAutocompleteValue(target, field).then(value => {
        if (!value) {
            console.log("!value")
            console.log(field.value)
            console.log(field)
            delete field.autocompleteValue;
            return;
        }
        let inputLength = field.value.length || 0
        field.autocompleteSplit = inputLength;
        field.autocompleteValue = value;
        let suggestion = value.substring(field.autocompleteSplit)
        if (suggestion.length > 0) {
            console.log(`suggestion: ${suggestion}`)
            console.log(e)
            field.setRangeText(suggestion, inputLength, inputLength, 'select');
            e.preventDefault();
        }
    //});
}

function handleKeyDown(e) {
    // console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`)
    let field = e.target;
    if (e.key === 'Backspace' || e.key === 'Process') {
        field.disableAutocomplete = 'True';
    } else {
        delete field.disableAutocomplete;
    }
    //if (field.autocompleteValue?.toLowerCase() !== field.value?.toLowerCase()) return;
    //if (e.key === 'Backspace' || e.key === 'Process' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Delete') {
    //    field.value = field.value.substring(0, field.autocompleteSplit)
    //    delete field.autocompleteValue;
    //} else if ((e.key === 'Tab' || e.key === 'Enter') && field.selectionStart != field.selectionEnd) {
    //    e.preventDefault();
    //    setSelectionRangeForced(field, field.value.length, field.value.length)
    //    delete field.autocompleteValue;
    //} else if (e.key === field.value.charCodeAt(field.autocompleteSplit)) {
    //}

}
        let inputOnKeyDownLength = 0;
        let suggestionWindow;
        let suggestionTimeout;
        function resetSuggestionWindow() {
            clearTimeout(suggestionWindow)
            suggestionWindow = null;
            clearTimeout(suggestionTimeout)
        }

function attachEventListenersToField(target, field) {
    if (!field.dataset.processed) {
        //field.addEventListener('focus', (e) => showCustomAutocomplete(target, field, e));
        //field.addEventListener('click', (e) => showCustomAutocomplete(target, field, e));
        //field.addEventListener('selectionchange', (e) => showCustomAutocomplete(target, field, e));
        //field.addEventListener('compositionend', (e) => showCustomAutocomplete(target, field, e));
        //field.addEventListener('compositionstart', () => field.disableAutocomplete = 'True');
        //field.addEventListener('keydown', handleKeyDown);
        //field.addEventListener('change', () => saveFormData(target, field));
        //field.addEventListener('blur', () => saveFormData(target, field));
        //field.addEventListener("selectionchange", () => checkSelection(field));
        field.dataset.processed = 'true';

        field.addEventListener('keydown', () => {
            resetSuggestionWindow();
            inputOnKeyDownLength = field.value.length - (field.selectionEnd - field.selectionStart)
        });
        field.addEventListener('keyup', () => {
            if (inputOnKeyDownLength < field.value.length
                && field.selectionStart == field.value.length
                && field.selectionEnd == field.value.length) {
               suggestionWindow = setTimeout(() => resetSuggestionWindow(), 2)
               console.log(`suggestionWindow ${inputOnKeyDownLength} ${field.value}`)
            } else {
                resetSuggestionWindow();
            }
        });
        field.addEventListener('selectionchange', (e) => {
            if (suggestionWindow) {
                resetSuggestionWindow()
                suggestionTimeout = setTimeout(() => field.setRangeText('looooongsuggestion', field.value.length, field.value.length, 'select'), 20)
            }
        });



        field.addEventListener('abort', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('animationcancel', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('animationend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('animationiteration', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('animationstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('auxclick', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('beforeinput', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('beforetoggle', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('blur', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('cancel', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('canplay', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('canplaythrough', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('change', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('click', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('close', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('compositionstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('compositionend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('contentvisibilityautostatechange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('contextlost', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('contextmenu', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('contextrestored', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('copy', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('cuechange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('cut', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dblclick', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('drag', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dragend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dragenter', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dragexit', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dragleave', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dragover', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('dragstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('drop', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('durationchange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('emptied', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('ended', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('error', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('focus', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('formdata', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('fullscreenchange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('fullscreenerror', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('gotpointercapture', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('input', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('invalid', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('keydown', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('keypress', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('keyup', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('load', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('loadeddata', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('loadedmetadata', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('loadstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('lostpointercapture', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('mousedown', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('mousemove', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('mouseout', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('mouseover', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('mouseup', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('paste', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pause', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('play', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('playing', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointercancel', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointerdown', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointerenter', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointerleave', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointermove', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointerout', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointerover', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('pointerup', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('progress', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('ratechange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('reset', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('resize', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('scroll', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('scrollend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('securitypolicyviolation', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('seeked', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('seeking', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('select', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('selectionchange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('selectstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('slotchange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('stalled', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('submit', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('suspend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('timeupdate', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('toggle', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('touchcancel', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('touchend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('touchmove', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('touchstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('transitioncancel', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('transitionend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('transitionrun', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('transitionstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('volumechange', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('waiting', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('webkitanimationend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('webkitanimationiteration', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('webkitanimationstart', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('webkittransitionend', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
        field.addEventListener('wheel', e => console.log(`${e.type}: ${e.target.selectionStart}-${e.target.selectionEnd}, ${e.target.value}`));
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