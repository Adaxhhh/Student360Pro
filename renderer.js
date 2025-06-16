// --- Mock Data ---
const mockData = {
    students: [
        { id: 'S001', name: 'Alice Johnson', class: '10A', attendance: 88, marks: { 'Math': 85, 'Science': 72, 'English': 90, 'History': 78, 'Arts': 95 }, historicalMarks: { 'Math': [75, 80, 85], 'Science': [68, 70, 72], 'English': [85, 88, 90], 'History': [70, 75, 78], 'Arts': [90, 92, 95] }, parentIds: ['P001'] },
        { id: 'S002', name: 'Bob Smith', class: '10A', attendance: 70, marks: { 'Math': 60, 'Science': 55, 'English': 70, 'History': 65, 'Arts': 80 }, historicalMarks: { 'Math': [80, 70, 60], 'Science': [70, 60, 55], 'English': [75, 72, 70], 'History': [70, 68, 65], 'Arts': [85, 82, 80] }, parentIds: ['P002'] },
        { id: 'S003', name: 'Charlie Brown', class: '10A', attendance: 98, marks: { 'Math': 95, 'Science': 92, 'English': 98, 'History': 90, 'Arts': 99 }, historicalMarks: { 'Math': [90, 93, 95], 'Science': [88, 90, 92], 'English': [95, 96, 98], 'History': [85, 88, 90], 'Arts': [95, 97, 99] }, parentIds: ['P003'] },
        { id: 'S004', name: 'Diana Prince', class: '10A', attendance: 80, marks: { 'Math': 70, 'Science': 88, 'English': 75, 'History': 60, 'Arts': 85 }, historicalMarks: { 'Math': [85, 78, 70], 'Science': [80, 85, 88], 'English': [70, 72, 75], 'History': [75, 68, 60], 'Arts': [80, 82, 85] }, parentIds: ['P001'] },
        { id: 'S005', name: 'Ethan Hunt', class: '10A', attendance: 95, marks: { 'Math': 78, 'Science': 82, 'English': 85, 'History': 88, 'Arts': 90 }, historicalMarks: { 'Math': [70, 75, 78], 'Science': [80, 81, 82], 'English': [82, 84, 85], 'History': [85, 86, 88], 'Arts': [88, 89, 90] }, parentIds: ['P002'] }
    ],
    teachers: [{ id: 'T001', name: 'Mr. David Lee' }],
    parents: [
        { id: 'P001', name: 'Mrs. Johnson', children: ['S001', 'S004'] },
        { id: 'P002', name: 'Mr. Smith', children: ['S002', 'S005'] },
        { id: 'P003', name: 'Mrs. Brown', children: ['S003'] }
    ]
};

// --- DOM Elements & Global State ---
const htmlEl = document.documentElement;
const loginView = document.getElementById('login-view');
const teacherDashboardView = document.getElementById('teacher-dashboard-view');
const studentView = document.getElementById('student-view');
const parentDashboardView = document.getElementById('parent-dashboard-view');
const studentDetailModal = document.getElementById('student-detail-modal');
const parentChildDetailView = document.getElementById('parent-child-detail-view');
const geminiResponseModal = document.getElementById('gemini-response-modal');
const toastNotification = document.getElementById('toast-notification');


let currentLoggedInUser = null;
let currentRole = null;
let currentlyViewedChildId = null;
let chartInstances = {};

// --- Gemini API Integration ---
// IMPORTANT: This key is for demonstration purposes. 
// Please get your own free API key from Google AI Studio (https://aistudio.google.com/) and replace it below.
const apiKey = "AIzaSyDwhqcOHBZrpePq0p1HSQ04MXfcnHPhcHk"; 

async function callGeminiApi(prompt) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Error:", errorData);
            const errorMessage = errorData.error?.message || 'Unknown error';
            if (errorMessage.includes("API key not valid")) {
                 showToast('Invalid API Key. Please update it in renderer.js', 'error');
                 return "Error: The provided API key is not valid. Please obtain a key from Google AI Studio and update it in `renderer.js`.";
            }
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorMessage}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 && 
            result.candidates[0].content && result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        }
        return "Sorry, I couldn't generate a response. The AI returned an empty result.";
    } catch (error) {
        console.error("Gemini API call failed:", error);
        return `An error occurred while contacting the AI: ${error.message}. Please check the console for details.`;
    }
}

// --- Theme Management ---
function updateChartJsDefaults() {
    const isDarkMode = htmlEl.classList.contains('dark');
    const color = isDarkMode ? '#d1d5db' : '#4b5563';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';

    Chart.defaults.color = color;
    Chart.defaults.borderColor = gridColor;
    Chart.defaults.scale.ticks.color = color;
    Chart.defaults.plugins.legend.labels.color = color;
    Chart.defaults.scale.grid.color = gridColor;
}

function setTheme(theme) {
    localStorage.setItem('theme', theme);
    const toggleIcons = document.querySelectorAll('.theme-toggle-btn i');

    if (theme === 'dark') {
        htmlEl.classList.add('dark');
        toggleIcons.forEach(icon => {
            if(icon) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        });
    } else {
        htmlEl.classList.remove('dark');
        toggleIcons.forEach(icon => {
            if(icon) {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        });
    }
    updateChartJsDefaults();
    // Re-render any currently visible charts to apply the new theme
    Object.values(chartInstances).forEach(chart => {
        if (chart) chart.update();
    });
}


// --- Helper Functions ---
const calculateAverage = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
const getOverallAverage = (marks) => calculateAverage(Object.values(marks));
const getSubjectInfo = (marks, type) => {
    if (Object.keys(marks).length === 0) return { subject: 'N/A', score: 0 };
    const sorted = Object.entries(marks).sort(([, a], [, b]) => type === 'lowest' ? a - b : b - a);
    return { subject: sorted[0][0], score: sorted[0][1] };
};
const getLowestScoringSubject = (marks) => getSubjectInfo(marks, 'lowest');
const getHighestScoringSubject = (marks) => getSubjectInfo(marks, 'highest');
const generatePredictiveScore = (historicalMarks) => {
    const overallAverages = Object.values(historicalMarks).map(history => parseFloat(calculateAverage(history.slice(-3))));
    return `${calculateAverage(overallAverages)} (projected)`;
};
const getClassAverageMarks = () => {
    const subjectData = {};
    mockData.students.forEach(student => {
        for (const [subject, mark] of Object.entries(student.marks)) {
            if (!subjectData[subject]) subjectData[subject] = [];
            subjectData[subject].push(mark);
        }
    });
    const classAverages = {};
    for (const [subject, marks] of Object.entries(subjectData)) {
        classAverages[subject] = calculateAverage(marks);
    }
    return classAverages;
};
const getTopper = () => mockData.students.reduce((topper, current) => parseFloat(getOverallAverage(current.marks)) > parseFloat(getOverallAverage(topper.marks)) ? current : topper);
const getStudentById = (id) => mockData.students.find(s => s.id === id);

async function copyToClipboard(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    const textToCopy = container.innerText; // Use innerText to get formatted text
    
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(textToCopy);
            showToast('Text copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showToast('Failed to copy text.', 'error');
        }
    } else {
        // Fallback for older browsers
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = textToCopy;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        try {
            document.execCommand('copy');
            showToast('Text copied to clipboard!');
        } catch (err) {
            console.error('Fallback copy failed: ', err);
            showToast('Failed to copy text.', 'error');
        }
        document.body.removeChild(tempTextArea);
    }
}


function showToast(message, type = 'success', duration = 3000) {
    toastNotification.textContent = message;
    toastNotification.className = 'toast-notification'; // Reset classes
    toastNotification.classList.add('show', type === 'error' ? 'error' : 'success');

    setTimeout(() => {
        toastNotification.classList.remove('show');
    }, duration);
}

// --- Chart Management ---
function destroyChart(chartId) {
    if (chartInstances[chartId]) {
        chartInstances[chartId].destroy();
        delete chartInstances[chartId];
    }
}

function destroyAllCharts() {
    Object.keys(chartInstances).forEach(chartId => destroyChart(chartId));
    chartInstances = {};
}

// --- View Management ---
function hideAllViews() {
    [loginView, teacherDashboardView, studentView, parentDashboardView, studentDetailModal, parentChildDetailView, geminiResponseModal].forEach(v => {
        if (v) v.classList.add('hidden');
    });
}

function showView(viewId) {
    hideAllViews();
    const viewElement = document.getElementById(viewId);
    if (viewElement) {
        viewElement.classList.remove('fadeInScale', 'hidden'); 
        void viewElement.offsetWidth; // Force reflow
        viewElement.classList.add('fadeInScale');
    }
}

// --- Global Logout Function ---
function logout() {
    destroyAllCharts();
    currentLoggedInUser = null;
    currentRole = null;
    currentlyViewedChildId = null;
    showView('login-view');
}

// --- Teacher View Rendering ---
function renderTeacherDashboard() {
    destroyAllCharts();
    
    // Populate Banner
    const teacherBanner = document.getElementById('teacher-banner');
    teacherBanner.innerHTML = `
        <i class="fas fa-school-flag"></i>
        <div>
            <h3>Welcome, ${currentLoggedInUser.name}!</h3>
            <p>Here's the current overview of your class's performance and key alerts.</p>
        </div>
    `;

    const performanceLevels = { 'Excellent (90+)': 0, 'Good (75-89)': 0, 'Average (60-74)': 0, 'Needs Improvement (<60)': 0 };
    mockData.students.forEach(student => {
        const avg = parseFloat(getOverallAverage(student.marks));
        if (avg >= 90) performanceLevels['Excellent (90+)']++;
        else if (avg >= 75) performanceLevels['Good (75-89)']++;
        else if (avg >= 60) performanceLevels['Average (60-74)']++;
        else performanceLevels['Needs Improvement (<60)']++;
    });

    const ctx = document.getElementById('classPerformanceDistributionChart').getContext('2d');
    chartInstances.classPerformanceDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(performanceLevels), datasets: [{ data: Object.values(performanceLevels), backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'], borderColor: '#fff', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Poppins' } } } } }
    });

    const classAverages = getClassAverageMarks();
    const ctx2 = document.getElementById('classSubjectAverageChart').getContext('2d');
    chartInstances.classSubjectAverageChart = new Chart(ctx2, {
        type: 'bar',
        data: { labels: Object.keys(classAverages), datasets: [{ label: 'Class Average', data: Object.values(classAverages), backgroundColor: 'rgba(108, 92, 231, 0.7)', borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { font: { family: 'Poppins' } } }, x: { ticks: { font: { family: 'Poppins' } } } }, plugins: { legend: { display: false } } }
    });

    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = '';
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = '';
    const smartAlertsContainer = document.getElementById('smart-alerts');
    let hasAlerts = false;

    mockData.students.forEach((student, index) => {
        const overallAvg = parseFloat(getOverallAverage(student.marks));
        const lowestSubject = getLowestScoringSubject(student.marks);
        const flags = [];

        if (student.attendance < 85) {
            flags.push(`<span class="flag-red">Low Att. (${student.attendance}%)</span>`);
            alertList.innerHTML += `<li><strong>${student.name}</strong> has low attendance (${student.attendance}%).</li>`; hasAlerts = true;
        }
        if (overallAvg < 65) {
            flags.push(`<span class="flag-red">Low Avg. (${overallAvg.toFixed(1)}%)</span>`);
            alertList.innerHTML += `<li><strong>${student.name}</strong>'s average (${overallAvg.toFixed(1)}%) is below target.</li>`; hasAlerts = true;
        }
        if (lowestSubject.score < 50) {
            flags.push(`<span class="flag-orange">Struggling: ${lowestSubject.subject}</span>`);
            alertList.innerHTML += `<li><strong>${student.name}</strong> is struggling in ${lowestSubject.subject} (${lowestSubject.score}%).</li>`; hasAlerts = true;
        }
        
        const tr = document.createElement('tr');
        tr.onclick = () => showStudentDetailModal(student.id);
        tr.style.animationDelay = `${index * 0.05}s`;
        tr.innerHTML = `
            <td>${student.name}</td>
            <td>${student.class}</td>
            <td>${overallAvg.toFixed(1)}</td>
            <td>${student.attendance}%</td>
            <td><div class="flex flex-col gap-2">${flags.join('') || '<span class="flag-green">Good</span>'}</div></td>
        `;
        tbody.appendChild(tr);
    });
    
    smartAlertsContainer.classList.toggle('hidden', !hasAlerts);
    showView('teacher-dashboard-view');
}

async function handleGenerateSuggestions() {
    const btn = document.getElementById('generate-suggestions');
    const btnText = document.getElementById('suggestion-btn-text');
    const spinner = document.getElementById('suggestion-spinner');
    const suggestionList = document.getElementById('suggestion-list');

    btn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    suggestionList.innerHTML = '';

    const studentsNeedingSupport = mockData.students.filter(s => parseFloat(getOverallAverage(s.marks)) < 70 || s.attendance < 85);

    if (studentsNeedingSupport.length === 0) {
        suggestionList.innerHTML = '<li class="text-green-600">All students are performing well! No specific suggestions needed at this time.</li>';
    } else {
        let prompt = `As an AI assistant for a teacher, generate concise, actionable feedback for students who need support. Focus on specific subjects or attendance issues. Provide suggestions as a bulleted list using markdown. No conversational filler, just the list.\nStudents:\n`;
        studentsNeedingSupport.forEach(student => {
            prompt += `- Name: ${student.name}, Avg Score: ${getOverallAverage(student.marks)}, Attendance: ${student.attendance}%, Lowest Subject: ${getLowestScoringSubject(student.marks).subject}.\n`;
        });

        const suggestions = await callGeminiApi(prompt);
        const formattedSuggestions = suggestions.split('\n').map(item => item.trim().replace(/^[-*]\s*/, '')).filter(Boolean).map(item => `<li>${item}</li>`).join('');
        suggestionList.innerHTML = formattedSuggestions || '<li>No suggestions generated.</li>';
    }

    btn.disabled = false;
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
}

function showStudentDetailModal(studentId) {
    const student = getStudentById(studentId);
    if (!student) return;

    document.getElementById('modal-student-name').textContent = student.name;
    document.getElementById('modal-student-class').textContent = student.class;
    document.getElementById('modal-student-attendance').textContent = student.attendance;
    document.getElementById('modal-student-avg').textContent = getOverallAverage(student.marks);
    document.getElementById('modal-student-lowest-subject').textContent = getLowestScoringSubject(student.marks).subject;
    document.getElementById('modal-student-highest-subject').textContent = getHighestScoringSubject(student.marks).subject;
    document.getElementById('modal-student-predictive-score').textContent = generatePredictiveScore(student.historicalMarks);

    const marksBody = document.getElementById('modal-marks-table-body');
    marksBody.innerHTML = Object.entries(student.marks).map(([subject, score]) => `
        <tr><td class="px-2 py-1">${subject}</td><td class="px-2 py-1 font-bold">${score}</td></tr>`).join('');

    const radarCtx = document.getElementById('studentRadarChart').getContext('2d');
    destroyChart('studentRadarChart');
    const classAverages = getClassAverageMarks();
    chartInstances.studentRadarChart = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: Object.keys(student.marks),
            datasets: [
                { label: student.name, data: Object.values(student.marks), backgroundColor: 'rgba(108, 92, 231, 0.4)', borderColor: 'rgba(108, 92, 231, 1)', borderWidth: 2 },
                { label: 'Class Average', data: Object.keys(student.marks).map(sub => classAverages[sub]), backgroundColor: 'rgba(26, 188, 156, 0.3)', borderColor: 'rgba(26, 188, 156, 1)', borderWidth: 2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100, pointLabels: { font: { size: 12, family: 'Poppins' } }, ticks: { stepSize: 20 } } }, plugins: { legend: { position: 'top', labels: { font: { family: 'Poppins' } } } } }
    });

    const trendCtx = document.getElementById('studentTrendLineChart').getContext('2d');
    destroyChart('studentTrendLineChart');
    const trendLabels = ['Test 1', 'Test 2', 'Test 3'];
    const datasets = Object.entries(student.historicalMarks).map(([subject, marks]) => {
        const hue = (subject.length * 30) % 360;
        return { label: subject, data: marks.slice(-3), borderColor: `hsl(${hue}, 70%, 50%)`, tension: 0.3, fill: false, pointRadius: 4 };
    });
    chartInstances.studentTrendLineChart = new Chart(trendCtx, {
        type: 'line',
        data: { labels: trendLabels, datasets: datasets },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 }, x: {} }, plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } } }
    });

    studentDetailModal.classList.remove('hidden');
}

// --- Student View Rendering & Features ---
function renderStudentView() {
    const student = currentLoggedInUser;
    if (!student) return showView('login-view');
    
    // Populate Banner
    const studentBanner = document.getElementById('student-banner');
    studentBanner.innerHTML = `
        <i class="fas fa-rocket"></i>
        <div>
            <h3>Ready for a great day, ${student.name.split(' ')[0]}?</h3>
            <p>Your hard work is paying off. Let's see your latest achievements!</p>
        </div>
    `;

    document.getElementById('student-name-display').textContent = student.name;
    const statusEl = document.getElementById('attendance-status');
    const isGoodAttendance = student.attendance >= 85;
    statusEl.textContent = isGoodAttendance ? 'Excellent!' : 'Needs Improvement';
    statusEl.className = `text-md mt-2 font-semibold ${isGoodAttendance ? 'text-green-500' : 'text-red-500'}`;
    
    // Setup Focus Area card
    document.getElementById('student-focus-subject').textContent = getLowestScoringSubject(student.marks).subject;
    document.getElementById('learning-path-list').innerHTML = ''; // Clear previous path

    
    const chatHistory = document.getElementById('chat-history');
    chatHistory.innerHTML = `<div class="chat-message-ai"><div class="chat-bubble"><p>Hello! I'm LionsGPT, your AI academic assistant. How can I help you today?</p></div></div>`;
    chatHistory.scrollTop = chatHistory.scrollHeight;

    document.getElementById('student-overall-avg').textContent = getOverallAverage(student.marks);
    const percentile = ((student.attendance + parseFloat(getOverallAverage(student.marks))) / 2).toFixed(0);
    document.getElementById('student-percentile').textContent = `${percentile}%`;
    document.getElementById('student-attendance-display').textContent = student.attendance;

    showView('student-view');
}

async function handleGenerateLearningPath() {
    const btn = document.getElementById('generate-learning-path');
    const btnText = document.getElementById('learning-path-btn-text');
    const spinner = document.getElementById('learning-path-spinner');
    const pathList = document.getElementById('learning-path-list');

    btn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    pathList.innerHTML = '';

    const student = currentLoggedInUser;
    const lowestSubject = getLowestScoringSubject(student.marks).subject;

    const prompt = `You are an AI academic coach. Generate a simple, actionable 4-step learning path for a student who is struggling in a subject. The path should be a mix of reviewing material, watching a specific online video (like from Khan Academy), completing a practice exercise, and an application task. Provide the response as a numbered markdown list. Do not include any intro or conclusion, just the 4 steps.

    Student Name: ${student.name}
    Struggling Subject: ${lowestSubject}`;

    const path = await callGeminiApi(prompt);
    
    const pathItems = path.split('\n')
        .map(item => item.trim().replace(/^\d+\.\s*/, ''))
        .filter(Boolean);

    if (pathItems.length === 0) {
        pathList.innerHTML = '<li>Could not generate a learning path. Please try again.</li>';
    } else {
        pathItems.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            li.style.animationDelay = `${index * 0.1}s`;
            pathList.appendChild(li);
        });
    }
    
    btn.disabled = false;
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
}


async function handleStudentChat() {
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send');
    const chatHistory = document.getElementById('chat-history');
    const sendBtnText = document.getElementById('chat-send-text');
    const spinner = document.getElementById('chat-spinner');
    const message = chatInput.value.trim();
    if (message === '') return;

    chatSendBtn.disabled = true;
    sendBtnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    chatInput.disabled = true;

    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'chat-message-user';
    userMessageDiv.innerHTML = `<div class="chat-bubble"><p>${message}</p></div>`;
    chatHistory.appendChild(userMessageDiv);
    
    chatInput.value = '';
    chatHistory.scrollTop = chatHistory.scrollHeight;

    const student = currentLoggedInUser;
    const studentContext = `Student: ${student.name}, Marks: ${JSON.stringify(student.marks)}, Attendance: ${student.attendance}%.`;
    const prompt = `You are LionsGPT, a friendly AI tutor. Based on the student's data and their question, provide a helpful, concise response (3-5 sentences). If they ask about a subject, give a brief tip. If about performance, be encouraging.\n\nData: ${studentContext}\nQuestion: ${message}`;
    
    const response = await callGeminiApi(prompt);

    const aiMessageDiv = document.createElement('div');
    aiMessageDiv.className = 'chat-message-ai';
    aiMessageDiv.innerHTML = `<div class="chat-bubble"><p>${response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p></div>`;
    chatHistory.appendChild(aiMessageDiv);
    
    chatHistory.scrollTop = chatHistory.scrollHeight;

    chatSendBtn.disabled = false;
    sendBtnText.classList.remove('hidden');
    spinner.classList.add('hidden');
    chatInput.disabled = false;
    chatInput.focus();
}

// --- Parent View Rendering & Features ---
function renderParentDashboard() {
    const parent = currentLoggedInUser;
    if (!parent) return showView('login-view');

    // Populate Banner
    const parentBanner = document.getElementById('parent-banner');
    parentBanner.innerHTML = `
        <i class="fas fa-users"></i>
        <div>
            <h3>Welcome, ${parent.name}!</h3>
            <p>Here's a summary of your children's academic progress.</p>
        </div>
    `;

    const container = document.getElementById('children-cards-container');
    container.innerHTML = parent.children.length === 0 ? '<p class="col-span-full text-center text-gray-600">No children linked to this account.</p>' : '';

    parent.children.forEach((childId, index) => {
        const child = getStudentById(childId);
        if (!child) return;
        const card = document.createElement('div');
        card.className = 'card child-card';
        card.style.animationDelay = `${0.2 + index * 0.1}s`;
        card.innerHTML = `<i class="fas fa-child-reaching"></i><h3 class="text-2xl font-semibold">${child.name}</h3><p class="text-lg text-gray-600">Class: ${child.class}</p><p class="mt-2 text-lg">Avg: <strong>${getOverallAverage(child.marks)}%</strong> | Att: <strong>${child.attendance}%</strong></p>`;
        card.addEventListener('click', () => showParentChildDetailView(child.id));
        container.appendChild(card);
    });
    showView('parent-dashboard-view');
}

async function showParentChildDetailView(childId) {
    destroyAllCharts();
    currentlyViewedChildId = childId;
    const child = getStudentById(childId);
    if (!child) return;
    
    document.getElementById('parent-view-child-name').textContent = `${child.name}'s Report`;
    document.getElementById('parent-view-child-class').textContent = child.class;
    document.getElementById('parent-view-child-attendance').textContent = child.attendance;
    document.getElementById('parent-view-child-avg').textContent = getOverallAverage(child.marks);
    
    const teacherMessageEl = document.getElementById('parent-view-teacher-message');
    teacherMessageEl.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="spinner" id="teacher-message-loading-spinner"></div>Generating message...</div>`;
    
    showView('parent-child-detail-view');

    const teacherMessagePrompt = `As an AI, write a concise, encouraging message from a teacher (Mr. Lee) to a parent about ${child.name}'s performance. Mention their average of ${getOverallAverage(child.marks)}%, strongest subject (${getHighestScoringSubject(child.marks).subject}), and weakest subject (${getLowestScoringSubject(child.marks).subject}). Suggest collaborating. Limit to 3-4 sentences.`;
    const aiTeacherMessage = await callGeminiApi(teacherMessagePrompt);
    teacherMessageEl.innerHTML = aiTeacherMessage.replace(/\n/g, '<br>');

    const marksBody = document.getElementById('parent-view-marks-table-body');
    marksBody.innerHTML = '';
    const classAvg = getClassAverageMarks();
    Object.entries(child.marks).forEach(([subject, mark]) => {
        let status;
        if (mark >= parseFloat(classAvg[subject]) + 5) status = '<span class="flag-green">Strong</span>';
        else if (mark <= parseFloat(classAvg[subject]) - 5) status = '<span class="flag-red">Weak</span>';
        else status = '<span class="flag-orange">Average</span>';
        marksBody.innerHTML += `<tr><td>${subject}</td><td>${mark}</td><td>${status}</td></tr>`;
    });
    
    const topper = getTopper();
    const marksTopperCtx = document.getElementById('parentChildMarksTopperChart').getContext('2d');
    chartInstances.parentChildMarksTopperChart = new Chart(marksTopperCtx, {
        type: 'bar', data: { labels: Object.keys(child.marks), datasets: [ { label: child.name, data: Object.values(child.marks), backgroundColor: 'rgba(108, 92, 231, 0.7)' }, { label: `${topper.name} (Topper)`, data: Object.values(topper.marks), backgroundColor: 'rgba(26, 188, 156, 0.7)' } ] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'top' } } }
    });

    const attendanceTrendCtx = document.getElementById('parentChildAttendanceTrendChart').getContext('2d');
    chartInstances.parentChildAttendanceTrendChart = new Chart(attendanceTrendCtx, {
        type: 'line', data: { labels: ['Term 1', 'Term 2', 'Term 3'], datasets: [{ label: 'Attendance %', data: [child.attendance > 5 ? child.attendance - 5 : 2, child.attendance < 97 ? child.attendance + 3 : 100, child.attendance], tension: 0.1, fill: true, borderColor: 'rgb(255, 159, 64)', backgroundColor: 'rgba(255, 159, 64, 0.2)' }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
    });
}

async function handleGenerateNoteToTeacher() {
    const btn = document.getElementById('generate-teacher-note');
    const btnText = document.getElementById('note-btn-text');
    const spinner = document.getElementById('note-spinner');
    const modal = document.getElementById('gemini-response-modal');
    
    btn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    const child = getStudentById(currentlyViewedChildId);
    if (!child) { showToast('Error: No child selected.', 'error'); btnText.classList.remove('hidden'); spinner.classList.add('hidden'); return; }

    const prompt = `You are an assistant for parents. Draft a polite, brief email from a parent to their child's teacher, Mr. Lee.\nChild: ${child.name}\nAvg: ${getOverallAverage(child.marks)}%\nStrongest: ${getHighestScoringSubject(child.marks).subject}\nWeakest: ${getLowestScoringSubject(child.marks).subject}\nAttendance: ${child.attendance}%\nThe parent wants to thank the teacher and ask for advice on supporting their child's learning at home, especially in their weakest subject. Format as a complete email.`;
    const response = await callGeminiApi(prompt);
    
    document.getElementById('gemini-modal-title').textContent = `Draft Note for ${child.name}'s Teacher`;
    document.getElementById('gemini-modal-content').innerHTML = response.replace(/\n/g, '<br>');
    modal.classList.remove('hidden');

    btn.disabled = false;
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Splash Screen Logic
    const splashScreen = document.getElementById('splash-screen');
    const splashSpans = splashScreen.querySelectorAll('h1 span');
    splashSpans.forEach((span, index) => {
        span.style.animationDelay = `${0.1 + index * 0.05}s`;
    });

    // --- Theme Setup ---
    const savedTheme = localStorage.getItem('theme') || 'dark'; // Default to dark mode
    setTheme(savedTheme);

    // Delegated event listener for theme toggle buttons
    const appContainer = document.getElementById('app');
    appContainer.addEventListener('click', (e) => {
        if (e.target.closest('.theme-toggle-btn')) {
            const newTheme = htmlEl.classList.contains('dark') ? 'light' : 'dark';
            setTheme(newTheme);
        }
    });
    
    // Login buttons
    const logins = { 'login-teacher': 'teacher', 'login-student': 'student', 'login-parent': 'parent' };
    Object.entries(logins).forEach(([id, role]) => {
        document.getElementById(id).addEventListener('click', () => {
            currentRole = role;
            if(role === 'teacher') { currentLoggedInUser = mockData.teachers[0]; renderTeacherDashboard(); } 
            else if(role === 'student') { currentLoggedInUser = mock-data.students[0]; renderStudentView(); } 
            else if(role === 'parent') { currentLoggedInUser = mockData.parents[0]; renderParentDashboard(); }
        });
    });

    // Logout Buttons
    ['teacher-logout', 'student-logout', 'parent-logout'].forEach(id => document.getElementById(id).addEventListener('click', logout));
    
    // Modal Close Buttons
    document.getElementById('close-student-detail').addEventListener('click', () => studentDetailModal.classList.add('hidden'));
    
    // AI Feature Buttons
    document.getElementById('generate-suggestions').addEventListener('click', handleGenerateSuggestions);
    document.getElementById('chat-send').addEventListener('click', handleStudentChat);
    document.getElementById('chat-input').addEventListener('keypress', e => e.key === 'Enter' && handleStudentChat());
    document.getElementById('generate-teacher-note').addEventListener('click', handleGenerateNoteToTeacher);
    document.getElementById('generate-learning-path').addEventListener('click', handleGenerateLearningPath);

    // Utility Buttons
    document.getElementById('copy-gemini-response').addEventListener('click', () => copyToClipboard('gemini-modal-content'));
    document.getElementById('download-parent-report').addEventListener('click', () => showToast('Report downloaded (mock)!'));
    document.getElementById('back-to-parent-dashboard').addEventListener('click', () => {
        destroyAllCharts();
        currentlyViewedChildId = null;
        renderParentDashboard();
    });
    
    // CORRECTED: The view is now shown inside the timer
    setTimeout(() => {
        splashScreen.classList.add('hidden');
        // This now runs AFTER the timer, initiating the cross-fade
        showView('login-view');
    }, 2500); // Keep splash screen for 2.5 seconds total
});