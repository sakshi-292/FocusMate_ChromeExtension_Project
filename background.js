function getTodayDateStr() {
    return new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
}

function checkAndResetIfNewDay() {
    chrome.storage.local.get(["lastActiveDate", "usageData"], (data) => {
        const today = getTodayDateStr();
        const lastDate = data.lastActiveDate;

        if (lastDate !== today) {
            chrome.storage.local.set({
                usageData: {},
                lastActiveDate: today
            });
        }
    });
}

let currentTabId = null;
let currentDomain = null;
let startTime = null;

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (err) {
        return null;
    }
}

function saveTime(domain, timeSpent) {
    if (!domain || timeSpent <= 0) return;

    chrome.storage.local.get(["usageData"], (result) => {
        const usageData = result.usageData || {};
        usageData[domain] = (usageData[domain] || 0) + timeSpent;
        chrome.storage.local.set({ usageData });
    });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    checkAndResetIfNewDay();

    if (currentDomain && startTime) {
        const timeSpent = Math.floor((Date.now() - startTime) / 1000);
        saveTime(currentDomain, timeSpent);
    }

    const tab = await chrome.tabs.get(activeInfo.tabId);
    currentTabId = tab.id;
    currentDomain = getDomain(tab.url);
    startTime = Date.now();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    checkAndResetIfNewDay();

    if (tabId === currentTabId && changeInfo.url) {
        if (currentDomain && startTime) {
            const timeSpent = Math.floor((Date.now() - startTime) / 1000);
            saveTime(currentDomain, timeSpent);
        }

        currentDomain = getDomain(changeInfo.url);
        startTime = Date.now();
    }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    checkAndResetIfNewDay();

    if (windowId === chrome.windows.WINDOW_ID_NONE) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const tab = tabs[0];

        if (currentDomain && startTime) {
            const timeSpent = Math.floor((Date.now() - startTime) / 1000);
            saveTime(currentDomain, timeSpent);
        }

        currentDomain = getDomain(tab.url);
        startTime = Date.now();
    });
});

chrome.runtime.onInstalled.addListener(() => {
    const today = getTodayDateStr();

    chrome.storage.local.get("blocklist", (data) => {
        if (!data.blocklist) {
            chrome.storage.local.set({
                blocklist: ["||youtube.com^", "||instagram.com^"],
                lastActiveDate: today
            }, setupBlockingRules);
        } else {
            chrome.storage.local.set({ lastActiveDate: today }, setupBlockingRules);
        }
    });
});

function setupBlockingRules() {
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
        const existingRuleIds = existingRules.map(rule => rule.id);

        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRuleIds,
            addRules: []
        }, () => {
            chrome.storage.local.get("blocklist", (data) => {
                const blocklist = data.blocklist || [];

                const newRules = blocklist.map((domain, index) => ({
                    id: index + 1000,
                    priority: 1,
                    action: { type: "block" },
                    condition: {
                        urlFilter: domain,
                        resourceTypes: ["main_frame"]
                    }
                }));

                chrome.declarativeNetRequest.updateDynamicRules({
                    addRules: newRules
                });
            });
        });
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "refreshBlocklist") {
        setupBlockingRules();
        sendResponse({ status: "done" });
    }

    if (msg.type === "notify") {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: msg.title,
            message: msg.message
        });
    }

    if (msg.type === "startPomodoro") {
        startPomodoro();
    }

    if (msg.type === "resetPomodoro") {
        resetPomodoro();
    }

    if (msg.type === "getTimerState") {
        sendResponse(timerState);
    }
});

// -------------------- Pomodoro Timer --------------------

let timerInterval = null;
let timerState = {
    isRunning: false,
    isFocus: true,
    remainingTime: 1500 // 25 minutes
};

function startPomodoro() {
    if (timerState.isRunning) return;

    timerState.isRunning = true;
    chrome.storage.local.set({ timerState });

    timerInterval = setInterval(() => {
        timerState.remainingTime--;

        if (timerState.remainingTime <= 0) {
            clearInterval(timerInterval);
            timerState.isRunning = false;

            const isFocusCompleted = timerState.isFocus;

            if (isFocusCompleted) {
                const today = new Date().toISOString().split("T")[0];

                chrome.storage.local.get("pomodoroHistory", (data) => {
                    const history = data.pomodoroHistory || {};
                    history[today] = (history[today] || 0) + 1;
                    chrome.storage.local.set({ pomodoroHistory: history });
                });

                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon.png",
                    title: "✅ Focus session complete!",
                    message: "Take a 5-minute break!",
                    requireInteraction: true
                });

                chrome.runtime.sendMessage({ type: "pomodoroComplete" });
                chrome.storage.local.set({ lastPomodoroCompleted: Date.now() });

                timerState.remainingTime = 300; // 5 minutes
            } else {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icon.png",
                    title: "🕒 Break over!",
                    message: "Time to get back to work!",
                    requireInteraction: true
                });

                timerState.remainingTime = 1500; // 25 minutes
            }

            timerState.isFocus = !timerState.isFocus;
            chrome.storage.local.set({ timerState });
        }

        chrome.storage.local.set({ timerState });
    }, 1000);
}

function resetPomodoro() {
    clearInterval(timerInterval);
    timerState = {
        isRunning: false,
        isFocus: true,
        remainingTime: 1500
    };
    chrome.storage.local.set({ timerState });
}