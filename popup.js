document.addEventListener("DOMContentLoaded", () => {
    const usageList = document.getElementById("usageList");
    const resetUsageBtn = document.getElementById("resetUsageBtn");
    const pomodoroCountEl = document.getElementById("pomodoroCount");
    const timerDisplay = document.getElementById("timer-display");
    const startBtn = document.getElementById("start-button");
    const resetPomodoroBtn = document.getElementById("reset-button");
    const blocklistDisplay = document.getElementById("blocklistDisplay");
    const newSiteInput = document.getElementById("newSiteInput");
    const addSiteBtn = document.getElementById("addSiteBtn");

    // Tab Handling
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const targetId = btn.dataset.tab + "-tab";
            tabContents.forEach(tab => {
                tab.classList.toggle("hidden", tab.id !== targetId);
            });
        });
    });

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const formatPomodoroTime = (sec) => {
        const m = Math.floor(sec / 60).toString().padStart(2, "0");
        const s = (sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    function pollTimerState() {
        chrome.runtime.sendMessage({ type: "getTimerState" }, (state) => {
            if (state && timerDisplay) {
                timerDisplay.textContent = formatPomodoroTime(state.remainingTime);
            }
        });
    }

    startBtn?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "startPomodoro" });
    });

    resetPomodoroBtn?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "resetPomodoro" });
        if (timerDisplay) timerDisplay.textContent = formatPomodoroTime(1500);
    });

    pollTimerState();
    setInterval(pollTimerState, 1000);

    chrome.storage.local.get("pomodoroHistory", (data) => {
        const today = new Date().toISOString().slice(0, 10);
        const history = data.pomodoroHistory || {};
        const count = history[today] || 0;
        pomodoroCountEl.textContent = `${count} Pomodoros completed today`;
    });

    chrome.storage.local.get("usageData", (data) => {
        const usage = data.usageData || {};
        const entries = Object.entries(usage);
        if (entries.length === 0) {
            usageList.textContent = "No usage data yet.";
            return;
        }
        entries.sort((a, b) => b[1] - a[1]);
        usageList.innerHTML = "<ul>";
        for (const [domain, seconds] of entries) {
            usageList.innerHTML += `<li><strong>${domain}</strong>: ${formatTime(seconds)}</li>`;
        }
        usageList.innerHTML += "</ul>";
    });

    resetUsageBtn?.addEventListener("click", () => {
        chrome.storage.local.set({ usageData: {} }, () => {
            usageList.innerHTML = "Data reset.";
        });
    });

    const renderBlocklist = () => {
        chrome.storage.local.get("blocklist", (data) => {
            const blocklist = data.blocklist || [];
            blocklistDisplay.innerHTML = "";
            blocklist.forEach((site) => {
                const li = document.createElement("li");
                const cleanSite = site.replace(/^\|\|/, "").replace(/\^$/, "");
                li.textContent = cleanSite;
                const removeBtn = document.createElement("button");
                removeBtn.textContent = "Remove";
                removeBtn.onclick = () => {
                    const updatedBlocklist = blocklist.filter(b => b !== site);
                    chrome.storage.local.set({ blocklist: updatedBlocklist }, () => {
                        chrome.runtime.sendMessage({ action: "refreshBlocklist" }, () => {
                            alert(`✅ Removed \"${cleanSite}\"`);
                            renderBlocklist();
                        });
                    });
                };
                li.appendChild(removeBtn);
                blocklistDisplay.appendChild(li);
            });
        });
    };

    addSiteBtn?.addEventListener("click", () => {
        let site = newSiteInput.value.trim().toLowerCase();
        if (!site) return alert("⚠️ Please enter a valid site.");
        site = site.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!site.startsWith("||")) site = "||" + site;
        if (!site.endsWith("^")) site = site + "^";

        chrome.storage.local.get("blocklist", (data) => {
            const blocklist = data.blocklist || [];
            if (!blocklist.includes(site)) {
                blocklist.push(site);
                chrome.storage.local.set({ blocklist }, () => {
                    chrome.runtime.sendMessage({ action: "refreshBlocklist" }, () => {
                        alert(`✅ \"${site.replace(/^\|\|/, "").replace(/\^$/, "")}\" added`);
                        renderBlocklist();
                        newSiteInput.value = "";
                    });
                });
            } else {
                alert("⚠️ Site already in blocklist.");
            }
        });
    });

    renderBlocklist();

    // ✅ Fetch today's motivational quote
    fetchDailyMotivationalQuote();
});

// 🎉 Confetti on pomodoro complete
function triggerConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
    const audio = new Audio("celebration.wav");
    audio.play().catch(e => {
        console.warn("Sound couldn't play automatically:", e);
    });
}

chrome.storage.local.get("lastPomodoroCompleted", (data) => {
    const lastCompleted = data.lastPomodoroCompleted;
    const lastShown = localStorage.getItem("lastConfettiTime");

    if (lastCompleted && lastCompleted.toString() !== lastShown) {
        triggerConfetti();
        localStorage.setItem("lastConfettiTime", lastCompleted.toString());
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "pomodoroComplete") triggerConfetti();
});

// 📖 Motivational Quote Logic
function fetchDailyMotivationalQuote() {
    const quoteBox = document.getElementById("quote-box");
    if (!quoteBox) return;

    const today = new Date().toISOString().split("T")[0];
    const storedDate = localStorage.getItem("quoteDate");
    const storedQuote = localStorage.getItem("quoteText");

    if (storedDate === today && storedQuote) {
        quoteBox.textContent = storedQuote;
    } else {
        fetch("https://zenquotes.io/api/random")
            .then((response) => response.json())
            .then((data) => {
                if (Array.isArray(data) && data[0]?.q && data[0]?.a) {
                    const quoteText = `“${data[0].q}” — ${data[0].a}`;
                    quoteBox.textContent = quoteText;
                    localStorage.setItem("quoteDate", today);
                    localStorage.setItem("quoteText", quoteText);
                } else {
                    throw new Error("Invalid API response");
                }
            })
            .catch((error) => {
                console.error("Failed to fetch quote:", error);
                quoteBox.textContent = "“Stay strong. The quote will be back tomorrow.”";
            });
    }
}
