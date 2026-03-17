import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, getDocs, Timestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDB3WJa1pmBcjxk0EKQM6is4z2n5oCY0W4",
  authDomain: "watertracker-1974e.firebaseapp.com",
  projectId: "watertracker-1974e",
  storageBucket: "watertracker-1974e.firebasestorage.app",
  messagingSenderId: "123716041712",
  appId: "1:123716041712:web:a94050f8faf9bdac9b7b35"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.currentDocs = [];
let waterChartInstance = null; 
let weightChartInstance = null; 
window.pieChartInstance = null; 
let waterListenerUnsubscribe = null; 
let journalListenerUnsubscribe = null; 
let hasAchievedGoalToday = false;
window.currentDietTag = '';

const dayNames = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.'];

function getTodayString() {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function getDateStringFromDate(dObj) {
    const offset = dObj.getTimezoneOffset() * 60000;
    return new Date(dObj.getTime() - offset).toISOString().split('T')[0];
}

function setJournalTimeNow() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('journalTime').value = `${hh}:${mm}`;
}

const todayStr = getTodayString();
document.getElementById('homeDateDisplay').innerText = new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
document.getElementById('journalDateDisplay').innerText = new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
document.getElementById('historyDate').value = todayStr; 
document.getElementById('historyDate').max = todayStr;   

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('userStatusBar').style.display = 'block';
        document.getElementById('currentUserEmail').innerText = user.email;
        document.getElementById('loginPage').classList.remove('active'); 
        document.getElementById('bottomNav').style.display = 'flex'; 
        switchTab('home'); 
        startWaterListener(); 
        startJournalListener(); 
    } else {
        document.getElementById('userStatusBar').style.display = 'none';
        document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
        document.getElementById('loginPage').classList.add('active'); 
        document.getElementById('bottomNav').style.display = 'none'; 
        if (waterListenerUnsubscribe) { waterListenerUnsubscribe(); waterListenerUnsubscribe = null; }
        if (journalListenerUnsubscribe) { journalListenerUnsubscribe(); journalListenerUnsubscribe = null; }
    }
});

window.signIn = () => {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('pwdInput').value;
    const btn = document.getElementById('loginBtn');
    if(!email || !pwd) { alert("請輸入信箱與密碼！"); return; }
    btn.innerText = "驗證中...";
    signInWithEmailAndPassword(auth, email, pwd)
        .then(() => { btn.innerText = "立即登入"; document.getElementById('pwdInput').value = ''; })
        .catch((error) => { alert("⚠️ 登入失敗：帳號或密碼錯誤！"); btn.innerText = "立即登入"; });
};

window.signUp = () => {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('pwdInput').value;
    const btn = document.getElementById('registerBtn');

    if(!email || !pwd) { alert("請先在上方輸入要註冊的信箱與密碼！"); return; }
    if(pwd.length < 6) { alert("⚠️ Firebase 規定密碼至少需要 6 個字元喔！"); return; }

    btn.innerText = "註冊中...";

    createUserWithEmailAndPassword(auth, email, pwd)
        .then(() => {
            alert("🎉 註冊成功！系統已自動為您登入。");
            btn.innerText = "📝 註冊新帳號";
            document.getElementById('pwdInput').value = '';
        })
        .catch((error) => {
            console.error(error);
            if(error.code === 'auth/email-already-in-use') { alert("⚠️ 這個信箱已經註冊過囉！請直接點擊上方「立即登入」。"); } 
            else if (error.code === 'auth/invalid-email') { alert("⚠️ 信箱格式不正確！"); } 
            else { alert("⚠️ 註冊失敗：" + error.message); }
            btn.innerText = "📝 註冊新帳號";
        });
};

window.logOut = () => { 
    if(confirm("確定要登出嗎？")) {
        signOut(auth).then(() => {
            document.getElementById('pwdInput').value = '';
            document.getElementById('loginBtn').innerText = "立即登入";
        });
    }
};

window.switchTab = (tabName) => {
    if (!auth.currentUser) return; 
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName + 'Page').classList.add('active');
    const tabBtn = document.getElementById('tab-' + tabName);
    if(tabBtn) tabBtn.classList.add('active');
    
    if (tabName === 'calendar') { loadMonthlyChart(); window.fetchHistoryByDate(); } 
    else if (tabName === 'weight') { window.loadWeightData(); }
    else if (tabName === 'diet') { window.loadDietData(); }
    else if (tabName === 'med') { window.loadMedData(); } 
    else if (tabName === 'journal') { setJournalTimeNow(); } 
};

async function updateStreak() {
    const snap = await getDocs(query(collection(db, "water_logs"), where("uid", "==", auth.currentUser.uid)));
    const dailyTotals = {};
    snap.forEach(doc => {
        const data = doc.data();
        if(!dailyTotals[data.date]) dailyTotals[data.date] = 0;
        dailyTotals[data.date] += data.amount;
    });
    
    let streak = 0;
    let curr = new Date();
    
    if (dailyTotals[todayStr] && dailyTotals[todayStr] >= 2000) {
        streak++;
        curr.setDate(curr.getDate() - 1);
    } else {
        curr.setDate(curr.getDate() - 1);
    }

    while(true) {
        let dStr = getDateStringFromDate(curr);
        if (dailyTotals[dStr] && dailyTotals[dStr] >= 2000) {
            streak++;
            curr.setDate(curr.getDate() - 1);
        } else {
            break;
        }
    }

    const badge = document.getElementById('streakBadge');
    if(streak > 0) {
        badge.style.display = 'inline-block';
        document.getElementById('streakCount').innerText = streak;
    } else {
        badge.style.display = 'none';
    }
}

function startWaterListener() {
    if (waterListenerUnsubscribe) { waterListenerUnsubscribe(); } 
    const qToday = query(collection(db, "water_logs"), where("uid", "==", auth.currentUser.uid));
    
    waterListenerUnsubscribe = onSnapshot(qToday, (snapshot) => {
        let total = 0; let html = ''; const docs = [];
        snapshot.forEach((docSnap) => { 
            if (docSnap.data().date === todayStr) {
                docs.push({ id: docSnap.id, ...docSnap.data() }); 
            }
        });
        docs.sort((a, b) => b.timestamp - a.timestamp); window.currentDocs = docs;
        
        docs.forEach((data) => {
            total += data.amount;
            let timeStr = '--:--';
            if (data.timestamp) {
                const dateObj = data.timestamp.toDate();
                timeStr = dateObj.getHours().toString().padStart(2, '0') + ':' + dateObj.getMinutes().toString().padStart(2, '0');
            }
            let itemName = data.itemName ? `<span class="log-name">${data.itemName}</span>` : '';
            html += `<div class="log-item"><div><span class="log-time">${timeStr}</span> ${itemName}</div><span style="color: var(--primary-dark); font-weight:bold;">${data.amount} ml</span></div>`;
        });
        
        document.getElementById('homeTotalAmount').innerText = total;
        document.getElementById('recordTotalAmount').innerText = total;
        document.getElementById('logList').innerHTML = html || '<div style="text-align:center; color:var(--text-light); padding:10px;">今天還沒喝水喔，趕快喝一杯吧！</div>';

        let percentage = (total / 2000) * 100;
        if (percentage > 100) percentage = 100;
        document.getElementById('homeProgress').style.background = `conic-gradient(var(--primary) ${percentage}%, #fff5f7 0%)`;

        if (total >= 2000 && !hasAchievedGoalToday) {
            hasAchievedGoalToday = true;
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#ff8da1', '#ffb6c1', '#ffffff', '#ff6b8b'], zIndex: 3000 });
        } else if (total < 2000) {
            hasAchievedGoalToday = false; 
        }
        
        updateStreak();

    }, (error) => { console.error("Listener error:", error); });
}

window.saveJournal = async () => {
    const timeStr = document.getElementById('journalTime').value;
    const category = document.getElementById('journalCategory').value;
    const text = document.getElementById('journalText').value.trim();

    if (!timeStr || !text) { alert("請輸入時間與內容！"); return; }

    try {
        const btn = event.target; btn.innerText = "儲存中...";
        await addDoc(collection(db, "journal_logs"), { 
            timeStr: timeStr, 
            category: category, 
            text: text, 
            date: getTodayString(), 
            timestamp: Timestamp.now(), 
            uid: auth.currentUser.uid 
        });
        document.getElementById('journalText').value = '';
        btn.innerText = "➕ 新增時間軸項目";
    } catch (e) { 
        alert("儲存失敗"); 
        event.target.innerText = "➕ 新增時間軸項目"; 
    }
};

window.deleteJournal = async (id) => {
    if(confirm("確定要刪除這個項目嗎？")) { 
        await deleteDoc(doc(db, "journal_logs", id)); 
    }
};

function startJournalListener() {
    if (journalListenerUnsubscribe) { journalListenerUnsubscribe(); }
    const qToday = query(collection(db, "journal_logs"), where("uid", "==", auth.currentUser.uid));
    
    journalListenerUnsubscribe = onSnapshot(qToday, (snapshot) => {
        const events = [];
        snapshot.forEach(docSnap => {
            if (docSnap.data().date === todayStr) {
                let d = docSnap.data();
                let [hours, minutes] = d.timeStr.split(':').map(Number);
                d.totalMins = hours * 60 + minutes;
                d.id = docSnap.id;
                events.push(d);
            }
        });
        
        events.sort((a, b) => a.totalMins - b.totalMins);
        
        for (let i = 0; i < events.length; i++) {
            if (i < events.length - 1) {
                events[i].duration = events[i+1].totalMins - events[i].totalMins;
            } else {
                events[i].duration = 15; 
            }
        }
        
        renderJournal(events);
    });
}

function renderJournal(events) {
    const timelineEl = document.getElementById('timeline');
    timelineEl.innerHTML = '<div class="timeline-line"></div>'; 
    
    if (events.length === 0) {
        timelineEl.innerHTML += '<div style="text-align:center; padding: 20px; color:#9ca3af;">今天還沒有紀錄喔！</div>';
        document.getElementById('top5-container').innerHTML = '';
        if(window.pieChartInstance) window.pieChartInstance.destroy();
        return;
    }

    const startMins = events[0].totalMins - 30; 
    const pxPerMin = 3; 
    const minSpacing = 65; 

    let lastTop = -100; 
    let prevTop = null;

    events.forEach((ev, index) => {
        let topPosition = (ev.totalMins - startMins) * pxPerMin;
        if (topPosition - lastTop < minSpacing) {
            topPosition = lastTop + minSpacing;
        }

        if (index > 0 && prevTop !== null) {
            const middlePosition = prevTop + (topPosition - prevTop) / 2;
            const durationHtml = `<div class="duration" style="top: ${middlePosition}px;">${events[index-1].duration} min</div>`;
            timelineEl.insertAdjacentHTML('beforeend', durationHtml);
        }

        const deleteBtn = `<span onclick="deleteJournal('${ev.id}')" style="cursor:pointer; float:right; color:#ff9e9e; font-size:1rem; margin-left:10px;">✖</span>`;

        const eventHtml = `
            <div class="event" style="top: ${topPosition}px;">
                <div class="time">${ev.timeStr}</div>
                <div class="dot"></div>
                <div class="content">
                    <span class="category-tag">${ev.category}</span>${ev.text}
                    ${deleteBtn}
                </div>
            </div>
        `;
        timelineEl.insertAdjacentHTML('beforeend', eventHtml);
        
        lastTop = topPosition;
        prevTop = topPosition;
    });
    
    timelineEl.style.height = (lastTop + 100) + 'px';

    const sortedEvents = [...events].sort((a, b) => b.duration - a.duration).slice(0, 5);
    const top5Container = document.getElementById('top5-container');
    top5Container.innerHTML = '';
    sortedEvents.forEach(ev => {
        const li = document.createElement('li');
        li.innerHTML = `[${ev.category}] ${ev.text} <span class="top5-time">${ev.duration} min</span>`;
        top5Container.appendChild(li);
    });

    const categoryData = { "娛樂": 0, "出門": 0, "個人": 0, "家務": 0, "生產力": 0, "飲食": 0, "社交": 0, "未分類": 0 };
    events.forEach(ev => {
        if (categoryData[ev.category] !== undefined) categoryData[ev.category] += ev.duration;
        else categoryData["未分類"] += ev.duration;
    });

    const labels = Object.keys(categoryData).filter(key => categoryData[key] > 0);
    const dataValues = labels.map(key => categoryData[key]);
    
    const bgColors = labels.map(label => {
        switch(label) {
            case '娛樂': return '#a78bfa';
            case '出門': return '#f472b6';
            case '個人': return '#fbbf24';
            case '家務': return '#9ca3af';
            case '生產力': return '#34d399';
            case '飲食': return '#fb923c';
            case '社交': return '#60a5fa';
            default: return '#cbd5e1'; 
        }
    });

    if (window.pieChartInstance) { window.pieChartInstance.destroy(); }
    const ctx = document.getElementById('pieChart').getContext('2d');
    window.pieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: dataValues, backgroundColor: bgColors, borderWidth: 2, borderColor: '#ffffff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: '-apple-system, sans-serif' } } } } }
    });
}

window.addWater = async (amount, itemName = '') => {
    try { await addDoc(collection(db, "water_logs"), { amount, itemName, date: getTodayString(), timestamp: Timestamp.now(), uid: auth.currentUser.uid }); } 
    catch (e) { console.error(e); }
};
window.customInput = () => {
    let input = prompt("請輸入喝水量 (ml)：", "300");
    if (input !== null && input.trim() !== "") {
        let amount = parseInt(input, 10);
        if (!isNaN(amount) && amount > 0) window.addWater(amount, '手動輸入');
        else alert("請輸入大於 0 的有效數字！");
    }
};
window.undoLast = async () => {
    if (window.currentDocs.length > 0) {
        const lastRecord = window.currentDocs[0];
        if (confirm(`確定要刪除剛才喝的 ${lastRecord.amount} ml 嗎？`)) { await deleteDoc(doc(db, "water_logs", lastRecord.id)); }
    } else alert("今天還沒有記錄喔！");
};
window.clearToday = async () => {
    if (window.currentDocs.length > 0) {
        if (confirm("⚠️ 確定要清除今天的『所有』記錄嗎？")) {
            for (let i = 0; i < window.currentDocs.length; i++) { await deleteDoc(doc(db, "water_logs", window.currentDocs[i].id)); }
        }
    } else alert("今天本來就沒有記錄喔！");
};

window.renderCustomButtons = () => {
    const container = document.getElementById('customBtnGroup');
    const buttons = JSON.parse(localStorage.getItem('myCustomWaterBtns') || '[]');
    let html = '';
    buttons.forEach((btn) => {
        html += `<button class="btn btn-add-special" style="background-color: #ffe4e1;" onclick="addWater(${btn.amount}, '${btn.name}')">🌟 ${btn.name} ${btn.amount} ml</button>`;
    });
    container.innerHTML = html;
};
window.addCustomButton = () => {
    let name = prompt("請輸入自訂水杯名稱\n(例如：我的保溫瓶)：", "");
    if (!name || name.trim() === "") return;
    let amountStr = prompt(`請設定「${name}」的容量 (ml)：`, "600");
    if (!amountStr || amountStr.trim() === "") return;
    let amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) { alert("⚠️ 請輸入大於 0 的有效數字！"); return; }
    const buttons = JSON.parse(localStorage.getItem('myCustomWaterBtns') || '[]');
    buttons.push({ name: name.trim(), amount: amount });
    localStorage.setItem('myCustomWaterBtns', JSON.stringify(buttons));
    window.renderCustomButtons();
};
window.editCustomButton = () => {
    const buttons = JSON.parse(localStorage.getItem('myCustomWaterBtns') || '[]');
    if (buttons.length === 0) { alert("目前沒有自訂按鈕可以編輯喔！"); return; }
    let promptText = "請輸入要編輯的按鈕「數字編號」：\n\n";
    buttons.forEach((btn, index) => { promptText += `${index + 1}. ${btn.name} (${btn.amount} ml)\n`; });
    let choice = prompt(promptText);
    if (choice !== null && choice.trim() !== "") {
        let idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < buttons.length) {
            let newName = prompt("請輸入新的水杯名稱：", buttons[idx].name);
            if (!newName || newName.trim() === "") return;
            let newAmount = prompt(`請輸入「${newName}」的容量 (ml)：`, buttons[idx].amount);
            if (!newAmount || newAmount.trim() === "") return;
            let amount = parseInt(newAmount, 10);
            if (isNaN(amount) || amount <= 0) { alert("⚠️ 請輸入大於 0 的有效數字！"); return; }
            buttons[idx] = { name: newName.trim(), amount: amount };
            localStorage.setItem('myCustomWaterBtns', JSON.stringify(buttons));
            window.renderCustomButtons();
        } else { alert("⚠️ 找不到這個編號，請重新輸入！"); }
    }
};
window.deleteCustomButton = () => {
    const buttons = JSON.parse(localStorage.getItem('myCustomWaterBtns') || '[]');
    if (buttons.length === 0) { alert("目前沒有自訂按鈕可以刪除喔！"); return; }
    let promptText = "請輸入要刪除的按鈕「數字編號」：\n\n";
    buttons.forEach((btn, index) => { promptText += `${index + 1}. ${btn.name} (${btn.amount} ml)\n`; });
    let choice = prompt(promptText);
    if (choice !== null && choice.trim() !== "") {
        let idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < buttons.length) {
            if(confirm(`確定要刪除「${buttons[idx].name}」嗎？`)) {
                buttons.splice(idx, 1);
                localStorage.setItem('myCustomWaterBtns', JSON.stringify(buttons));
                window.renderCustomButtons();
            }
        } else { alert("⚠️ 找不到這個編號，請重新輸入！"); }
    }
};

const defaultDietBtns = {
    drinks: ['☕ 咖啡', '🍵 無糖茶', '🧋 手搖飲'],
    meals: ['👩‍🍳 媽媽食物', '🍝 義大利麵', '🍛 燉飯', '🍜 拉麵', '🍣 壽司', '🍲 火鍋', '🐟 酸菜魚', '🍢 夜市'],
    snacks: ['🍞 麵包', '🥚 蛋', '🍎 蘋果', '🍐 芭樂', '🍬 糖果', '🍪 餅乾']
};

window.renderDietButtons = () => {
    let btns = JSON.parse(localStorage.getItem('myDietBtns'));
    if (!btns) {
        btns = { ...defaultDietBtns };
        localStorage.setItem('myDietBtns', JSON.stringify(btns));
    }
    
    document.getElementById('dietDrinksBtnGroup').innerHTML = btns.drinks.map(b => `<button class="btn btn-add-special" style="flex: 1 1 30%; font-size: 0.85rem;" onclick="appendDiet('${b}')">${b}</button>`).join('');
    document.getElementById('dietMealsBtnGroup').innerHTML = btns.meals.map(b => `<button class="btn btn-add-special" style="flex: 1 1 30%; font-size: 0.85rem;" onclick="appendDiet('${b}')">${b}</button>`).join('');
    document.getElementById('dietSnacksBtnGroup').innerHTML = btns.snacks.map(b => `<button class="btn btn-add-special" style="flex: 1 1 30%; font-size: 0.85rem;" onclick="appendDiet('${b}')">${b}</button>`).join('');
};

window.addDietBtn = (cat) => {
    let name = prompt("請輸入新的食物名稱 (建議加上 Emoji，如：🍔 漢堡)：", "");
    if (!name || name.trim() === "") return;
    let btns = JSON.parse(localStorage.getItem('myDietBtns'));
    btns[cat].push(name.trim());
    localStorage.setItem('myDietBtns', JSON.stringify(btns));
    window.renderDietButtons();
};
window.editDietBtn = (cat) => {
    let btns = JSON.parse(localStorage.getItem('myDietBtns'));
    if (btns[cat].length === 0) { alert("沒有按鈕可以編輯！"); return; }
    let promptText = "請輸入要編輯的「數字編號」：\n\n";
    btns[cat].forEach((btn, index) => { promptText += `${index + 1}. ${btn}\n`; });
    let choice = prompt(promptText);
    if (choice !== null && choice.trim() !== "") {
        let idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < btns[cat].length) {
            let newName = prompt("請輸入新的名稱：", btns[cat][idx]);
            if (newName !== null && newName.trim() !== "") {
                btns[cat][idx] = newName.trim();
                localStorage.setItem('myDietBtns', JSON.stringify(btns));
                window.renderDietButtons();
            }
        } else { alert("⚠️ 找不到編號！"); }
    }
};
window.deleteDietBtn = (cat) => {
    let btns = JSON.parse(localStorage.getItem('myDietBtns'));
    if (btns[cat].length === 0) { alert("沒有按鈕可以刪除！"); return; }
    let promptText = "請輸入要刪除的「數字編號」：\n\n";
    btns[cat].forEach((btn, index) => { promptText += `${index + 1}. ${btn}\n`; });
    let choice = prompt(promptText);
    if (choice !== null && choice.trim() !== "") {
        let idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < btns[cat].length) {
            if(confirm(`確定刪除「${btns[cat][idx]}」嗎？`)) {
                btns[cat].splice(idx, 1);
                localStorage.setItem('myDietBtns', JSON.stringify(btns));
                window.renderDietButtons();
            }
        } else { alert("⚠️ 找不到編號！"); }
    }
};

window.renderMedButtons = () => {
    const container = document.getElementById('medBtnGroup');
    let buttons = JSON.parse(localStorage.getItem('myMedBtns'));
    if (!buttons) {
        buttons = ['感冒藥', '止痛藥', '胃藥', 'B群', '維他命C', '益生菌'];
        localStorage.setItem('myMedBtns', JSON.stringify(buttons));
    }
    let html = '';
    buttons.forEach((btn) => {
        html += `<button class="btn btn-add-special" style="flex: 1 1 30%; font-size: 0.85rem;" onclick="appendMed('${btn}')">${btn}</button>`;
    });
    container.innerHTML = html;
};
window.addMedButton = () => {
    let name = prompt("請輸入新的藥物/保健品名稱：", "");
    if (!name || name.trim() === "") return;
    const buttons = JSON.parse(localStorage.getItem('myMedBtns') || '[]');
    buttons.push(name.trim());
    localStorage.setItem('myMedBtns', JSON.stringify(buttons));
    window.renderMedButtons();
};
window.editMedButton = () => {
    const buttons = JSON.parse(localStorage.getItem('myMedBtns') || '[]');
    if (buttons.length === 0) { alert("沒有按鈕可以編輯！"); return; }
    let promptText = "請輸入要編輯的「數字編號」：\n\n";
    buttons.forEach((btn, index) => { promptText += `${index + 1}. ${btn}\n`; });
    let choice = prompt(promptText);
    if (choice !== null && choice.trim() !== "") {
        let idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < buttons.length) {
            let newName = prompt("請輸入新的名稱：", buttons[idx]);
            if (newName !== null && newName.trim() !== "") {
                buttons[idx] = newName.trim();
                localStorage.setItem('myMedBtns', JSON.stringify(buttons));
                window.renderMedButtons();
            }
        } else { alert("⚠️ 找不到編號！"); }
    }
};
window.deleteMedButton = () => {
    const buttons = JSON.parse(localStorage.getItem('myMedBtns') || '[]');
    if (buttons.length === 0) { alert("沒有按鈕可以刪除！"); return; }
    let promptText = "請輸入要刪除的「數字編號」：\n\n";
    buttons.forEach((btn, index) => { promptText += `${index + 1}. ${btn}\n`; });
    let choice = prompt(promptText);
    if (choice !== null && choice.trim() !== "") {
        let idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < buttons.length) {
            if(confirm(`確定刪除「${buttons[idx]}」嗎？`)) {
                buttons.splice(idx, 1);
                localStorage.setItem('myMedBtns', JSON.stringify(buttons));
                window.renderMedButtons();
            }
        } else { alert("⚠️ 找不到編號！"); }
    }
};

window.renderCustomButtons();
window.renderDietButtons();
window.renderMedButtons();

window.fetchHistoryByDate = async () => {
    const selectedDate = document.getElementById('historyDate').value;
    if (!selectedDate) return;

    const qWater = query(collection(db, "water_logs"), where("uid", "==", auth.currentUser.uid));
    const snapWater = await getDocs(qWater).catch(e => { return {forEach:()=>{}}; });
    let waterTotal = 0; let waterHtml = ''; const waterDocs = [];
    snapWater.forEach((docSnap) => { 
        if(docSnap.data().date === selectedDate) waterDocs.push(docSnap.data()); 
    });
    waterDocs.sort((a, b) => b.timestamp - a.timestamp).forEach((data) => {
        waterTotal += data.amount;
        let timeStr = '--:--';
        if (data.timestamp) {
            const dateObj = data.timestamp.toDate();
            timeStr = `${dayNames[dateObj.getDay()]} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        }
        let itemName = data.itemName ? `<span class="log-name">${data.itemName}</span>` : '';
        waterHtml += `<div class="log-item"><div><span class="log-time">${timeStr}</span> ${itemName}</div><span style="color: var(--primary-dark); font-weight:bold;">${data.amount} ml</span></div>`;
    });
    document.getElementById('historyTotal').innerText = `${waterTotal} ml`;
    document.getElementById('historyLogList').innerHTML = waterHtml || '<div style="text-align:center; color:var(--text-light); padding:10px;">無喝水記錄</div>';

    const qWeight = query(collection(db, "weight_logs"), where("uid", "==", auth.currentUser.uid));
    const snapWeight = await getDocs(qWeight).catch(e => { return {forEach:()=>{}}; });
    let allWeightDocs = [];
    snapWeight.forEach((docSnap) => { allWeightDocs.push(docSnap.data()); });
    allWeightDocs.sort((a, b) => b.timestamp - a.timestamp); 
    
    let weightHtml = '';
    allWeightDocs.forEach((data, index) => {
        if (data.date === selectedDate) { 
            let timeStr = '--:--';
            if (data.timestamp) {
                const dateObj = data.timestamp.toDate();
                timeStr = `${dayNames[dateObj.getDay()]} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
            }
            
            let diffHtml = '';
            if (index + 1 < allWeightDocs.length) {
                let prevLog = allWeightDocs[index + 1];
                let diff = parseFloat((data.weight - prevLog.weight).toFixed(1));
                if (diff < 0) diffHtml = `<span style="color: #27ae60; font-size: 0.7em; white-space: nowrap; margin-left: 5px;">(⬇️ 瘦了 ${Math.abs(diff)}kg 🎉)</span>`;
                else if (diff > 0) diffHtml = `<span style="color: #c0392b; font-size: 0.7em; white-space: nowrap; margin-left: 5px;">(⬆️ 胖了 ${diff}kg 🙈)</span>`;
                else diffHtml = `<span style="color: var(--text-light); font-size: 0.7em; white-space: nowrap; margin-left: 5px;">(持平)</span>`;
            }
            
            weightHtml += `<div class="log-item"><div><span class="log-time">${timeStr}</span></div><span style="color: #9b59b6; font-weight:bold;">${data.weight} kg ${diffHtml}</span></div>`;
        }
    });
    document.getElementById('historyWeightList').innerHTML = weightHtml || '<div style="text-align:center; color:var(--text-light); padding:10px;">無體重記錄</div>';

    const qDiet = query(collection(db, "diet_logs"), where("uid", "==", auth.currentUser.uid));
    const snapDiet = await getDocs(qDiet).catch(e => { return {forEach:()=>{}}; });
    let dietHtml = ''; const dietDocs = [];
    snapDiet.forEach((docSnap) => { 
        if(docSnap.data().date === selectedDate) dietDocs.push(docSnap.data()); 
    });
    dietDocs.sort((a, b) => b.timestamp - a.timestamp).forEach((data) => {
        let timeStr = '--:--';
        if (data.timestamp) {
            const dateObj = data.timestamp.toDate();
            timeStr = `${dayNames[dateObj.getDay()]} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        }
        let tagDisplay = data.tag ? `<span style="margin-right: 5px;">${data.tag}</span>` : '';
        dietHtml += `<div class="log-item" style="flex-wrap: wrap;">
                        <span class="log-time" style="width: 100%; font-size: 0.8em; margin-bottom: 4px;">${timeStr}</span>
                        <span style="color: var(--text-dark); font-weight:bold; white-space: pre-wrap; word-break: break-all;">${tagDisplay}${data.meal}</span>
                     </div>`;
    });
    document.getElementById('historyDietList').innerHTML = dietHtml || '<div style="text-align:center; color:var(--text-light); padding:10px;">無飲食記錄</div>';

    const qMed = query(collection(db, "med_logs"), where("uid", "==", auth.currentUser.uid));
    const snapMed = await getDocs(qMed).catch(e => { return {forEach:()=>{}}; });
    let medHtml = ''; const medDocs = [];
    snapMed.forEach((docSnap) => { 
        if(docSnap.data().date === selectedDate) medDocs.push(docSnap.data()); 
    });
    medDocs.sort((a, b) => b.timestamp - a.timestamp).forEach((data) => {
        let timeStr = '--:--';
        if (data.timestamp) {
            const dateObj = data.timestamp.toDate();
            timeStr = `${dayNames[dateObj.getDay()]} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        }
        medHtml += `<div class="log-item" style="flex-wrap: wrap;">
                        <span class="log-time" style="width: 100%; font-size: 0.8em; margin-bottom: 4px;">${timeStr}</span>
                        <span style="color: #8e44ad; font-weight:bold; white-space: pre-wrap; word-break: break-all;">${data.med}</span>
                     </div>`;
    });
    document.getElementById('historyMedList').innerHTML = medHtml || '<div style="text-align:center; color:var(--text-light); padding:10px;">無吃藥記錄</div>';
};

async function loadMonthlyChart() {
    const date = new Date(); const year = date.getFullYear(); let month = date.getMonth() + 1; month = month < 10 ? '0' + month : month;
    const startDate = `${year}-${month}-01`; const endDate = `${year}-${month}-31`;
    const qMonth = query(collection(db, "water_logs"), where("uid", "==", auth.currentUser.uid));
    const querySnapshot = await getDocs(qMonth).catch(e => { return {forEach:()=>{}}; });
    const dailyTotals = {};
    querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.date >= startDate && data.date <= endDate) {
            if (!dailyTotals[data.date]) dailyTotals[data.date] = 0;
            dailyTotals[data.date] += data.amount;
        }
    });
    const sortedDates = Object.keys(dailyTotals).sort();
    const labels = sortedDates.map(d => { const parts = d.split('-'); return `${parts[1]}/${parts[2]}`; });
    const dataPoints = sortedDates.map(d => dailyTotals[d]);
    if (waterChartInstance) { waterChartInstance.destroy(); }
    const ctx = document.getElementById('waterChart').getContext('2d');
    waterChartInstance = new Chart(ctx, {
        type: 'bar', data: { labels: labels.length > 0 ? labels : ['尚未有記錄'], datasets: [{ label: '每日喝水量 (ml)', data: dataPoints.length > 0 ? dataPoints : [0], backgroundColor: '#ffb6c1', borderColor: '#ff8da1', borderWidth: 1, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
    });
}

window.saveWeight = async () => {
    const weightVal = document.getElementById('weightInput').value;
    if(!weightVal || weightVal <= 0) { alert("請輸入有效的體重數字！"); return; }
    try {
        const btn = event.target; btn.innerText = "儲存中...";
        await addDoc(collection(db, "weight_logs"), { weight: parseFloat(weightVal), date: getTodayString(), timestamp: Timestamp.now(), uid: auth.currentUser.uid });
        document.getElementById('weightInput').value = ''; window.loadWeightData(); btn.innerText = "儲存體重";
    } catch (e) { alert("儲存失敗"); event.target.innerText = "儲存體重"; }
};
window.deleteWeight = async (id) => {
    if(confirm("確定要刪除這筆體重記錄嗎？")) { await deleteDoc(doc(db, "weight_logs", id)); window.loadWeightData(); }
};
window.loadWeightData = async () => {
    const querySnapshot = await getDocs(query(collection(db, "weight_logs"), where("uid", "==", auth.currentUser.uid))).catch(e => { return {forEach:()=>{}}; });
    const logs = []; querySnapshot.forEach(docSnap => logs.push({ id: docSnap.id, ...docSnap.data() }));
    logs.sort((a, b) => b.timestamp - a.timestamp); 
    
    let html = '';
    const renderLogs = logs.slice(0, 10);
    renderLogs.forEach((log, index) => { 
        let timeStr = '--/-- --:--';
        if (log.timestamp) {
            const d = log.timestamp.toDate();
            timeStr = `${d.getMonth()+1}/${d.getDate()} ${dayNames[d.getDay()]} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        }
        
        let diffHtml = '';
        if (index + 1 < logs.length) {
            let prevLog = logs[index + 1];
            let diff = parseFloat((log.weight - prevLog.weight).toFixed(1));
            if (diff < 0) {
                diffHtml = `<span style="color: #27ae60; font-size: 0.7em; white-space: nowrap; margin-left: 5px;">(⬇️ 瘦了 ${Math.abs(diff)}kg 🎉)</span>`;
            } else if (diff > 0) {
                diffHtml = `<span style="color: #c0392b; font-size: 0.7em; white-space: nowrap; margin-left: 5px;">(⬆️ 胖了 ${diff}kg 🙈)</span>`;
            } else {
                diffHtml = `<span style="color: var(--text-light); font-size: 0.7em; white-space: nowrap; margin-left: 5px;">(持平)</span>`;
            }
        }

        html += `<div class="log-item"><span class="log-time">${timeStr}</span><span style="color: var(--primary-dark); font-weight:bold;">${log.weight} kg ${diffHtml}</span><button onclick="deleteWeight('${log.id}')" style="background:none; border:none; color:#ff9e9e; font-size:1.2rem; cursor:pointer;">✖</button></div>`;
    });
    document.getElementById('weightLogList').innerHTML = html || '<div style="text-align:center; color:var(--text-light); padding:10px;">尚未有體重記錄喔。</div>';
    
    const chartLogs = [...logs].reverse(); const dailyWeight = {};
    chartLogs.forEach(log => { dailyWeight[log.date] = log.weight; });
    const labels = Object.keys(dailyWeight).sort(); const dataPoints = labels.map(date => dailyWeight[date]);
    const displayLabels = labels.map(d => { const parts = d.split('-'); return `${parts[1]}/${parts[2]}`; });
    if (weightChartInstance) { weightChartInstance.destroy(); }
    const ctx = document.getElementById('weightChart').getContext('2d');
    weightChartInstance = new Chart(ctx, {
        type: 'line', data: { labels: displayLabels.length > 0 ? displayLabels : ['尚未有記錄'], datasets: [{ label: '體重 (kg)', data: dataPoints.length > 0 ? dataPoints : [0], borderColor: '#ff6b8b', backgroundColor: 'rgba(255, 107, 139, 0.2)', borderWidth: 2, fill: true, tension: 0.3, pointBackgroundColor: '#ff6b8b', pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
};

window.toggleDietTag = (tag) => {
    if (window.currentDietTag === tag) {
        window.currentDietTag = ''; 
    } else {
        window.currentDietTag = tag;
    }
    
    const btnAngel = document.getElementById('btnTagAngel');
    const btnDevil = document.getElementById('btnTagDevil');
    
    if (window.currentDietTag === '😇') {
        btnAngel.classList.add('active-angel'); btnDevil.classList.remove('active-devil');
    } else if (window.currentDietTag === '😈') {
        btnDevil.classList.add('active-devil'); btnAngel.classList.remove('active-angel');
    } else {
        btnAngel.classList.remove('active-angel'); btnDevil.classList.remove('active-devil');
    }
};

window.appendDiet = (text) => {
    const input = document.getElementById('dietInput');
    if (input.value.trim() !== '') { input.value += ' + ' + text; } 
    else { input.value = text; }
};

window.saveDiet = async () => {
    let mealVal = document.getElementById('dietInput').value.trim();
    if(!mealVal) { alert("請輸入飲食內容！"); return; }
    
    let h = new Date().getHours();
    let timeLabel = "";
    if (h >= 5 && h < 11) timeLabel = "[🥞早餐] ";
    else if (h >= 11 && h < 16) timeLabel = "[🍱午餐] ";
    else if (h >= 16 && h < 22) timeLabel = "[🍲晚餐] ";
    else timeLabel = "[🍜宵夜] ";
    
    mealVal = timeLabel + mealVal;

    try {
        const btn = event.target; btn.innerText = "儲存中...";
        await addDoc(collection(db, "diet_logs"), { meal: mealVal, tag: window.currentDietTag, date: getTodayString(), timestamp: Timestamp.now(), uid: auth.currentUser.uid });
        
        document.getElementById('dietInput').value = ''; 
        window.toggleDietTag(''); 
        window.loadDietData(); 
        btn.innerText = "儲存飲食 (自動加時間標籤)";
    } catch (e) { alert("儲存失敗"); event.target.innerText = "儲存飲食 (自動加時間標籤)"; }
};

window.deleteDiet = async (id) => {
    if(confirm("確定要刪除這筆飲食記錄嗎？")) { await deleteDoc(doc(db, "diet_logs", id)); window.loadDietData(); }
};

window.loadDietData = async () => {
    const querySnapshot = await getDocs(query(collection(db, "diet_logs"), where("uid", "==", auth.currentUser.uid))).catch(e => { return {forEach:()=>{}}; });
    const logs = []; querySnapshot.forEach(docSnap => logs.push({ id: docSnap.id, ...docSnap.data() }));
    logs.sort((a, b) => b.timestamp - a.timestamp); 
    let html = '';
    logs.slice(0, 15).forEach(log => { 
        let timeStr = '--/-- --:--';
        if (log.timestamp) {
            const d = log.timestamp.toDate();
            timeStr = `${d.getMonth()+1}/${d.getDate()} ${dayNames[d.getDay()]} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        }
        let tagDisplay = log.tag ? `<span style="margin-right: 5px;">${log.tag}</span>` : '';
        
        html += `<div class="log-item" style="flex-wrap: wrap;">
                    <span class="log-time" style="width: 100%; font-size: 0.8em; margin-bottom: 4px;">${timeStr}</span>
                    <span style="color: var(--text-dark); font-weight:bold; flex: 1; white-space: pre-wrap; word-break: break-all;">${tagDisplay}${log.meal}</span>
                    <button onclick="deleteDiet('${log.id}')" style="background:none; border:none; color:#ff9e9e; font-size:1.2rem; cursor:pointer; padding: 0 5px;">✖</button>
                 </div>`;
    });
    document.getElementById('dietLogList').innerHTML = html || '<div style="text-align:center; color:var(--text-light); padding:10px;">尚未有飲食記錄喔。</div>';
};

window.appendMed = (text) => {
    const input = document.getElementById('medInput');
    if (input.value.trim() !== '') { input.value += ' + ' + text; } 
    else { input.value = text; }
};

window.saveMed = async () => {
    const medVal = document.getElementById('medInput').value.trim();
    if(!medVal) { alert("請輸入藥物或保健品名稱！"); return; }
    try {
        const btn = event.target; btn.innerText = "儲存中...";
        await addDoc(collection(db, "med_logs"), { med: medVal, date: getTodayString(), timestamp: Timestamp.now(), uid: auth.currentUser.uid });
        document.getElementById('medInput').value = ''; 
        window.loadMedData(); 
        btn.innerText = "儲存用藥";
    } catch (e) { alert("儲存失敗"); event.target.innerText = "儲存用藥"; }
};

window.deleteMed = async (id) => {
    if(confirm("確定要刪除這筆用藥記錄嗎？")) { await deleteDoc(doc(db, "med_logs", id)); window.loadMedData(); }
};

window.loadMedData = async () => {
    const querySnapshot = await getDocs(query(collection(db, "med_logs"), where("uid", "==", auth.currentUser.uid))).catch(e => { return {forEach:()=>{}}; });
    const logs = []; querySnapshot.forEach(docSnap => logs.push({ id: docSnap.id, ...docSnap.data() }));
    logs.sort((a, b) => b.timestamp - a.timestamp); 
    let html = '';
    logs.slice(0, 15).forEach(log => { 
        let timeStr = '--/-- --:--';
        if (log.timestamp) {
            const d = log.timestamp.toDate();
            timeStr = `${d.getMonth()+1}/${d.getDate()} ${dayNames[d.getDay()]} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        }
        html += `<div class="log-item" style="flex-wrap: wrap;">
                    <span class="log-time" style="width: 100%; font-size: 0.8em; margin-bottom: 4px;">${timeStr}</span>
                    <span style="color: #8e44ad; font-weight:bold; flex: 1; white-space: pre-wrap; word-break: break-all;">${log.med}</span>
                    <button onclick="deleteMed('${log.id}')" style="background:none; border:none; color:#ff9e9e; font-size:1.2rem; cursor:pointer; padding: 0 5px;">✖</button>
                 </div>`;
    });
    document.getElementById('medLogList').innerHTML = html || '<div style="text-align:center; color:var(--text-light); padding:10px;">尚未有用藥記錄喔。</div>';
};

window.drawGacha = async () => {
    const btn = document.getElementById('gachaBtn');
    const resultEl = document.getElementById('gachaResult');
    btn.innerText = "🎰 扭蛋轉動中...";
    resultEl.innerText = "🤔";
    resultEl.style.animation = "bounce 0.5s infinite alternate";
    
    try {
        const q = query(collection(db, "diet_logs"), where("uid", "==", auth.currentUser.uid));
        const snap = await getDocs(q);
        let foods = [];
        snap.forEach(doc => {
            let meal = doc.data().meal;
            meal = meal.replace(/\[.*?\]\s*/g, ''); 
            let items = meal.split('+').map(i => i.trim());
            foods.push(...items);
        });
        
        let filtered = foods.filter(f => f.length > 0 && !f.includes('咖啡') && !f.includes('茶') && !f.includes('手搖') && !f.includes('水'));
        let uniqueFoods = [...new Set(filtered)];
        
        if(uniqueFoods.length === 0) {
            uniqueFoods = ["火鍋 🍲", "義大利麵 🍝", "麥當勞 🍟", "健康餐盒 🍱", "水餃 🥟", "拉麵 🍜"];
        }
        
        setTimeout(() => {
            resultEl.style.animation = "none";
            let winner = uniqueFoods[Math.floor(Math.random() * uniqueFoods.length)];
            resultEl.innerText = winner;
            btn.innerText = "🎲 再抽一次";
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }, 1000);
    } catch(e) {
        btn.innerText = "🎲 點我抽隨機餐點";
        resultEl.innerText = "⚠️ 讀取失敗，請確認網路";
    }
};

window.retroType = '';
window.openRetroModal = (type) => {
    document.getElementById('retroModal').classList.add('active');
    const dInput = document.getElementById('retroDate');
    dInput.max = getTodayString();
    dInput.value = getTodayString();
    
    document.getElementById('retroWater').style.display = (type === 'water') ? 'block' : 'none';
    document.getElementById('retroWeight').style.display = (type === 'weight') ? 'block' : 'none';
    document.getElementById('retroDiet').style.display = (type === 'diet') ? 'block' : 'none';
    document.getElementById('retroDietTag').style.display = (type === 'diet') ? 'block' : 'none'; 
    document.getElementById('retroMed').style.display = (type === 'med') ? 'block' : 'none'; 
    
    const title = document.getElementById('retroModalTitle');
    if(type === 'water') title.innerText = '💧 補登喝水';
    if(type === 'weight') title.innerText = '⚖️ 補登體重';
    if(type === 'diet') title.innerText = '🍱 補登飲食';
    if(type === 'med') title.innerText = '💊 補登用藥';
    window.retroType = type;
};

window.closeRetroModal = () => {
    document.getElementById('retroModal').classList.remove('active');
    document.getElementById('retroWater').value = '';
    document.getElementById('retroWeight').value = '';
    document.getElementById('retroDiet').value = '';
    document.getElementById('retroDietTag').value = '';
    document.getElementById('retroMed').value = '';
};

window.saveRetroRecord = async () => {
    const rDate = document.getElementById('retroDate').value;
    if(!rDate) { alert("請選擇日期！"); return; }
    const dParts = rDate.split('-');
    const dObj = new Date(dParts[0], dParts[1]-1, dParts[2], 12, 0, 0);
    const retroTimestamp = Timestamp.fromDate(dObj);
    
    const btn = document.getElementById('retroSaveBtn');
    btn.innerText = "儲存中...";

    try {
        if(window.retroType === 'water') {
            const val = parseInt(document.getElementById('retroWater').value, 10);
            if(isNaN(val) || val <= 0) throw new Error("請輸入有效水量");
            await addDoc(collection(db, "water_logs"), { amount: val, itemName: '📅 補登記錄', date: rDate, timestamp: retroTimestamp, uid: auth.currentUser.uid });
            updateStreak();
        } 
        else if (window.retroType === 'weight') {
            const val = parseFloat(document.getElementById('retroWeight').value);
            if(isNaN(val) || val <= 0) throw new Error("請輸入有效體重");
            await addDoc(collection(db, "weight_logs"), { weight: val, date: rDate, timestamp: retroTimestamp, uid: auth.currentUser.uid });
            window.loadWeightData();
        } 
        else if (window.retroType === 'diet') {
            const val = document.getElementById('retroDiet').value.trim();
            const tagVal = document.getElementById('retroDietTag').value; 
            if(!val) throw new Error("請輸入飲食內容");
            await addDoc(collection(db, "diet_logs"), { meal: val, tag: tagVal, date: rDate, timestamp: retroTimestamp, uid: auth.currentUser.uid });
            window.loadDietData();
        }
        else if (window.retroType === 'med') {
            const val = document.getElementById('retroMed').value.trim();
            if(!val) throw new Error("請輸入藥物名稱");
            await addDoc(collection(db, "med_logs"), { med: val, date: rDate, timestamp: retroTimestamp, uid: auth.currentUser.uid });
            window.loadMedData();
        }
        alert("✅ 補登成功！請至「月曆」分頁查詢。");
        window.closeRetroModal();
    } catch (e) { alert(e.message || "儲存失敗，請重試"); }
    btn.innerText = "確認補登";
};

window.exportToCSV = async (event) => {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "📥 資料整理中...";
    
    try {
        let allData = [];
        const waterSnap = await getDocs(query(collection(db, "water_logs"), where("uid", "==", auth.currentUser.uid)));
        waterSnap.forEach(d => { let obj=d.data(); obj.type="💧 喝水"; obj.ts = obj.timestamp?obj.timestamp.toDate().getTime():0; allData.push(obj); });
        
        const weightSnap = await getDocs(query(collection(db, "weight_logs"), where("uid", "==", auth.currentUser.uid)));
        weightSnap.forEach(d => { let obj=d.data(); obj.type="⚖️ 體重"; obj.ts = obj.timestamp?obj.timestamp.toDate().getTime():0; allData.push(obj); });
        
        const dietSnap = await getDocs(query(collection(db, "diet_logs"), where("uid", "==", auth.currentUser.uid)));
        dietSnap.forEach(d => { let obj=d.data(); obj.type="🍱 飲食"; obj.ts = obj.timestamp?obj.timestamp.toDate().getTime():0; allData.push(obj); });
        
        const medSnap = await getDocs(query(collection(db, "med_logs"), where("uid", "==", auth.currentUser.uid)));
        medSnap.forEach(d => { let obj=d.data(); obj.type="💊 吃藥"; obj.ts = obj.timestamp?obj.timestamp.toDate().getTime():0; allData.push(obj); });

        const journalSnap = await getDocs(query(collection(db, "journal_logs"), where("uid", "==", auth.currentUser.uid)));
        journalSnap.forEach(d => { let obj=d.data(); obj.type="📝 日子"; obj.ts = obj.timestamp?obj.timestamp.toDate().getTime():0; allData.push(obj); });
        
        allData.sort((a,b) => b.ts - a.ts); 
        
        let csvContent = "\uFEFF分類,日期,時間,數值,備註\n";
        allData.forEach(data => {
            let dObj = data.timestamp ? data.timestamp.toDate() : new Date(data.date);
            let timeStr = data.timeStr ? data.timeStr : (dObj.getHours().toString().padStart(2, '0') + ':' + dObj.getMinutes().toString().padStart(2, '0'));
            let val = data.amount ? `${data.amount} ml` : (data.weight ? `${data.weight} kg` : "");
            
            let tagStr = data.tag ? `[${data.tag}] ` : (data.category ? `[${data.category}] ` : "");
            let note = data.itemName || data.meal || data.med || data.text || "";
            note = `"${tagStr}${note.replace(/"/g, '""').replace(/\n/g, ' ')}"`; 
            
            csvContent += `${data.type},${data.date},${timeStr},${val},${note}\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `健康記錄_${getTodayString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        btn.innerText = originalText;
    } catch (error) {
        console.error(error);
        alert("匯出失敗，請確認網路連線。");
        btn.innerText = originalText;
    }
};
