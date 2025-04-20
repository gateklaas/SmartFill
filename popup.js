document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleSmartFill');
    const statusText = document.getElementById('status');
    const clearCacheBtn = document.getElementById('clearCache');
    const confirmBox = document.getElementById('confirmBox');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');
    const messageBox = document.getElementById('message');

    browser.tabs.query({active: true, currentWindow: true}, tabs => {
        const url = new URL(tabs[0].url);
        const domain = url.hostname;

        if (!domain) {
            toggle.disabled = true;
            statusText.textContent = 'SmartFill is disabled';
            return;
        }

        browser.storage.sync.get([domain], result => {
            const isDisabled = result[domain] === false;

            toggle.checked = !isDisabled;
            statusText.textContent = isDisabled
                ? `Disabled for ${domain}`
                : `Enabled for ${domain}`;
        });

        toggle.addEventListener('change', () => {
            const isChecked = toggle.checked;
            browser.storage.sync.set({[domain]: isChecked}, () => {
                statusText.textContent = isChecked
                    ? `Enabled for ${domain}`
                    : `Disabled for ${domain}`;
            });
        });

        clearCacheBtn.addEventListener('click', () => {
            confirmBox.style.display = 'block';
        });

        confirmYes.addEventListener('click', () => {
            browser.storage.local.clear().then(() => {
                confirmBox.style.display = 'none';
                messageBox.textContent = 'Cache cleared successfully!';
                messageBox.style.display = 'block';

                setTimeout(() => {
                    messageBox.style.display = 'none';
                }, 3000);
            });
        });

        confirmNo.addEventListener('click', () => {
            confirmBox.style.display = 'none';
        });
    });
});
