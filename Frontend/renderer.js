// --- Global Configuration ---
// The base URL for our Python backend API
const API_BASE_URL = '/api';

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

// Login form elements
const roleSelectionSection = document.getElementById('role-selection-section');
const credentialsSection = document.getElementById('credentials-section');
const loginFormTitle = document.getElementById('login-form-title');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const authLoginBtn = document.getElementById('auth-login-btn');
const backToRolesBtn = document.getElementById('back-to-roles-btn');

let currentLoggedInUser = null;
let currentRole = null;
let currentlyViewedChildId = null;
let chartInstances = {};
let allStudents = []; // Store the full list of students for the teacher
let currentlyAnsweringDoubtId = null;
let currentlySelectedStudent = null;

// Quiz State
let allQuizData = [];
let currentQuizQuestions = [];
let currentQuestionIndex = 0;
let quizResults = [];
let selectedOption = null;
let quizTimerInterval = null;
let speechRecognition;
let isRecording = false;
let quizStartTime = null;

// --- API & Helper Functions ---

async function callGeminiApi(prompt) {
    // This function now calls our secure backend proxy
    try {
        const response = await fetch(`${API_BASE_URL}/gemini-proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Proxy Error:", errorData);
            const errorMessage = errorData.details?.error?.message || 'Unknown AI service error.';
            if (errorMessage.includes("API key not valid")) {
                 showToast('Invalid Gemini API Key. Please update it in the backend .env file.', 'error');
                 return "Error: The Gemini API key configured on the server is not valid.";
            }
            throw new Error(`API Error: ${response.status} - ${errorMessage}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0]?.content?.parts[0]) {
            return result.candidates[0].content.parts[0].text;
        }
        return "Sorry, I couldn't generate a response. The AI returned an empty result.";

    } catch (error) {
        console.error("Gemini proxy call failed:", error);
        return `An error occurred while contacting the AI: ${error.message}. Please check the backend console for details.`;
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
        htmlEl.classList.remove('light');
        toggleIcons.forEach(icon => { if(icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); } });
    } else {
        htmlEl.classList.remove('dark');
        htmlEl.classList.add('light');
        toggleIcons.forEach(icon => { if(icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); } });
    }
    updateChartJsDefaults();
    Object.values(chartInstances).forEach(chart => { if (chart) chart.update(); });
}

// --- General Helper Functions ---
const getOverallAverage = (student) => student.overallAverage || '0.0';
const getLowestScoringSubject = (student) => student.lowestSubject || { subject: 'N/A', score: 0 };
const getHighestScoringSubject = (student) => student.highestSubject || { subject: 'N/A', score: 0 };
const generatePredictiveScore = (historicalMarks) => {
    if (!historicalMarks || Object.keys(historicalMarks).length === 0) return 'N/A';
    const overallAverages = Object.values(historicalMarks).map(history => {
        const numericHistory = history.slice(-3).map(Number);
        return numericHistory.length ? numericHistory.reduce((a, b) => a + b, 0) / numericHistory.length : 0;
    });
    const avg = overallAverages.reduce((a, b) => a + b, 0) / overallAverages.length;
    return `${avg.toFixed(1)} (projected)`;
};

async function copyToClipboard(elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    try {
        await navigator.clipboard.writeText(container.innerText);
        showToast('Text copied to clipboard!');
    } catch (err) {
        showToast('Failed to copy text.', 'error');
    }
}

function showToast(message, type = 'success', duration = 3000) {
    toastNotification.textContent = message;
    toastNotification.className = 'toast-notification show ' + (type === 'error' ? 'error' : 'success');
    setTimeout(() => { toastNotification.classList.remove('show'); }, duration);
}

// --- Chart & View Management ---
function destroyChart(chartId) { if (chartInstances[chartId]) { chartInstances[chartId].destroy(); delete chartInstances[chartId]; } }
function destroyAllCharts() { Object.keys(chartInstances).forEach(destroyChart); chartInstances = {}; }
function hideAllViews() { [loginView, teacherDashboardView, studentView, parentDashboardView, studentDetailModal, parentChildDetailView, geminiResponseModal, document.getElementById('answer-doubt-modal')].forEach(v => v?.classList.add('hidden')); }
function showView(viewId) { hideAllViews(); const viewElement = document.getElementById(viewId); if (viewElement) { viewElement.classList.remove('hidden'); } }

// --- Login & Logout ---
function logout() {
    let activeView = [teacherDashboardView, studentView, parentDashboardView].find(v => !v.classList.contains('hidden'));

    if (activeView) {
        activeView.classList.add('fade-out-up');
    }

    setTimeout(() => {
        if (activeView) {
            activeView.classList.remove('fade-out-up');
        }
        
        destroyAllCharts();
        currentLoggedInUser = null;
        currentRole = null;
        currentlyViewedChildId = null;
        usernameInput.value = '';
        passwordInput.value = '';

        // Reset login form state
        credentialsSection.classList.add('hidden');
        credentialsSection.classList.remove('animate-in', 'fade-out-down');
        roleSelectionSection.classList.remove('hidden', 'fade-out-up');
        
        hideAllViews();
        loginView.classList.remove('hidden');

    }, 300);
}

function showAuthFormForRole(role) {
    currentRole = role;
    loginFormTitle.textContent = `${role.charAt(0).toUpperCase() + role.slice(1)} Portal Login`;
    roleSelectionSection.classList.add('fade-out-up');
    setTimeout(() => {
        roleSelectionSection.classList.add('hidden');
        credentialsSection.classList.remove('hidden', 'fade-out-down');
        credentialsSection.classList.add('animate-in');
        usernameInput.focus();
    }, 300);
}

async function handleAuthLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showToast('Please enter username and password.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role: currentRole })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            currentLoggedInUser = result.user;
            showToast('Login successful!', 'success');
            if (currentRole === 'teacher') renderTeacherDashboard();
            else if (currentRole === 'student') renderStudentView();
            else if (currentRole === 'parent') renderParentDashboard();
        } else {
            showToast(result.message || 'Invalid credentials.', 'error');
        }
    } catch (error) {
        console.error("Login API call failed:", error);
        showToast('Could not connect to the server. Is it running?', 'error');
    }
}

function handleBackToRoles() {
    usernameInput.value = '';
    passwordInput.value = '';
    currentRole = null;
    credentialsSection.classList.add('fade-out-down');
    setTimeout(() => {
        credentialsSection.classList.add('hidden');
        roleSelectionSection.classList.remove('hidden', 'fade-out-up');
        roleSelectionSection.classList.add('animate-in');
    }, 300);
}

// --- Teacher View Rendering ---
function updateTeacherDashboard(studentsToDisplay) {
    destroyAllCharts();
    const performanceLevels = { 'Excellent (90+)': 0, 'Good (75-89)': 0, 'Average (60-74)': 0, 'Needs Improvement (<60)': 0 };
    studentsToDisplay.forEach(student => {
        const avg = parseFloat(getOverallAverage(student));
        if (avg >= 90) performanceLevels['Excellent (90+)']++;
        else if (avg >= 75) performanceLevels['Good (75-89)']++;
        else if (avg >= 60) performanceLevels['Average (60-74)']++;
        else performanceLevels['Needs Improvement (<60)']++;
    });
    const ctxPerf = document.getElementById('classPerformanceDistributionChart').getContext('2d');
    chartInstances.classPerformanceDistributionChart = new Chart(ctxPerf, { type: 'doughnut', data: { labels: Object.keys(performanceLevels), datasets: [{ data: Object.values(performanceLevels), backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'], borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });

    const subjectTotals = {};
    const subjectCounts = {};
    studentsToDisplay.forEach(student => {
        Object.entries(student.marks).forEach(([subject, mark]) => {
            subjectTotals[subject] = (subjectTotals[subject] || 0) + mark;
            subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
        });
    });
    const classAverages = {};
    Object.keys(subjectTotals).forEach(subject => { classAverages[subject] = subjectTotals[subject] / subjectCounts[subject]; });
    const ctxSub = document.getElementById('classSubjectAverageChart').getContext('2d');
    chartInstances.classSubjectAverageChart = new Chart(ctxSub, { type: 'bar', data: { labels: Object.keys(classAverages), datasets: [{ label: 'Class Average', data: Object.values(classAverages), backgroundColor: 'rgba(108, 92, 231, 0.7)', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } } });

    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = '';
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = '';
    let hasAlerts = false;

    studentsToDisplay.forEach((student, index) => {
        const avgScore = getOverallAverage(student);
        const lowestSubject = getLowestScoringSubject(student);
        const attendance = student.attendance || 'N/A';
        const flags = [];
        if (attendance < 80) flags.push('Low Attendance');
        if (avgScore < 60) flags.push('Low Average');
        if (lowestSubject.score < 50) flags.push(`Struggling in ${lowestSubject.subject}`);

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer';
        row.innerHTML = `
            <td>${student.name}</td>
            <td>${student.class_name}</td>
            <td>${avgScore}</td>
            <td>${attendance}%</td>
            <td>${flags.map(f => `<span class="flag ${f.toLowerCase().replace(/\s+/g, '-')}">${f}</span>`).join('')}</td>
        `;
        row.addEventListener('click', () => showStudentDetailModal(student));
        tbody.appendChild(row);

        if (flags.length > 0) {
            hasAlerts = true;
            const alertItem = document.createElement('li');
            alertItem.innerHTML = `<b>${student.name}:</b> ${flags.join(', ')}. <a href="#" class="text-blue-500 hover:underline" data-student-id="${student.id}">View Details</a>`;
            alertList.appendChild(alertItem);
            alertItem.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                showStudentDetailModal(student);
            });
        }
    });

    document.getElementById('smart-alerts').classList.toggle('hidden', !hasAlerts);
}

async function renderTeacherDashboard() {
    destroyAllCharts();
    showView('teacher-dashboard-view');

    document.getElementById('teacher-banner').innerHTML = `
        <i class="fas fa-school-flag"></i>
        <div><h3>Welcome, ${currentLoggedInUser.name}!</h3><p>Here's the current overview of your class's performance.</p></div>
    `;

    const response = await fetch(`${API_BASE_URL}/teacher/dashboard`);
    allStudents = await response.json();

    const classFilter = document.getElementById('class-filter');
    classFilter.innerHTML = '<option value="">All Classes</option>';
    currentLoggedInUser.classes.forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = className;
        classFilter.appendChild(option);
    });

    classFilter.addEventListener('change', () => {
        const selectedClass = classFilter.value;
        const studentsToDisplay = selectedClass 
            ? allStudents.filter(s => s.class_name === selectedClass)
            : allStudents;
        updateTeacherDashboard(studentsToDisplay);
    });

    updateTeacherDashboard(allStudents);
    renderTeacherDoubts();
}

async function renderTeacherDoubts() {
    if (!currentLoggedInUser) return;
    const doubtsContainer = document.getElementById('doubts-container');
    doubtsContainer.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/teacher/doubts/${currentLoggedInUser.id}`);
        const result = await response.json();

        if (response.ok && result.success) {
            doubtsContainer.innerHTML = '';
            if (result.doubts.length === 0) {
                doubtsContainer.innerHTML = '<p id="no-doubts-message" class="text-gray-600">No pending doubts from students.</p>';
            } else {
                result.doubts.forEach(doubt => {
                    const doubtEl = document.createElement('div');
                    doubtEl.className = 'doubt-item';
                    doubtEl.innerHTML = `
                        <p><strong>${doubt.student_name}:</strong> ${doubt.question_text}</p>
                        <button class="answer-doubt-btn" data-doubt-id="${doubt.id}" data-question="${doubt.question_text}">Answer</button>
                        <button class="resolve-doubt-btn" data-doubt-id="${doubt.id}">Mark as Resolved</button>
                    `;
                    doubtsContainer.appendChild(doubtEl);
                });
            }
        } else {
            doubtsContainer.innerHTML = `<p class="text-red-500">Error: ${result.message || 'Could not load doubts.'}</p>`;
        }
    } catch (error) {
        console.error("Failed to fetch doubts:", error);
        doubtsContainer.innerHTML = '<p class="text-red-500">Could not connect to the server to get doubts.</p>';
    }
}

async function handleResolveDoubt(doubtId) {
    try {
        const response = await fetch(`${API_BASE_URL}/doubts/resolve/${doubtId}`, { method: 'POST' });
        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Doubt marked as resolved!', 'success');
            renderTeacherDoubts();
        } else {
            showToast(result.message || 'Could not resolve the doubt.', 'error');
        }
    } catch (error) {
        console.error("Failed to resolve doubt:", error);
        showToast('Could not connect to the server.', 'error');
    }
}

function showAnswerModal(doubtId, question) {
    currentlyAnsweringDoubtId = doubtId;
    document.getElementById('answer-modal-question').textContent = question;
    document.getElementById('answer-textarea').value = '';
    document.getElementById('answer-doubt-modal').classList.remove('hidden');
}

async function handleSendAnswer() {
    const answerText = document.getElementById('answer-textarea').value.trim();
    if (!answerText) {
        showToast('Please enter an answer.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/doubts/answer/${currentlyAnsweringDoubtId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer_text: answerText })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Answer sent successfully!', 'success');
            document.getElementById('answer-doubt-modal').classList.add('hidden');
            renderTeacherDoubts();
        } else {
            showToast(result.message || 'Could not send answer.', 'error');
        }
    } catch (error) {
        showToast('Could not connect to the server.', 'error');
    }
}

// --- AI Suggestion Features ---
async function handleGenerateSuggestions() {
    const btn = document.getElementById('generate-suggestions');
    const btnText = document.getElementById('suggestion-btn-text');
    const spinner = document.getElementById('suggestion-spinner');
    const suggestionList = document.getElementById('suggestion-list');

    btn.disabled = true; btnText.classList.add('hidden'); spinner.classList.remove('hidden');
    suggestionList.innerHTML = '';

    const response = await fetch(`${API_BASE_URL}/teacher/dashboard`);
    const students = await response.json();

    const studentsNeedingSupport = students.filter(s => parseFloat(getOverallAverage(s)) < 70 || s.attendance < 85);
    if (studentsNeedingSupport.length === 0) {
        suggestionList.innerHTML = '<li class="text-green-600">All students are performing well!</li>';
    } else {
        let prompt = `As an AI assistant for a teacher, generate concise, actionable feedback for students who need support. Focus on specific subjects or attendance issues. Provide suggestions as a bulleted list using markdown. No conversational filler, just the list.\nStudents:\n`;
        studentsNeedingSupport.forEach(student => { prompt += `- Name: ${student.name}, Avg Score: ${getOverallAverage(student)}, Attendance: ${student.attendance}%, Lowest Subject: ${getLowestScoringSubject(student).subject}.\n`; });

        const suggestions = await callGeminiApi(prompt);
        suggestionList.innerHTML = suggestions.split('\n').map(item => item.trim().replace(/^[-*]\s*/, '')).filter(Boolean).map(item => `<li>${item}</li>`).join('');
    }

    btn.disabled = false; btnText.classList.remove('hidden'); spinner.classList.add('hidden');
}

function showStudentDetailModal(student) {
    if (!student) return;

    document.getElementById('modal-student-name').textContent = student.name;
    document.getElementById('modal-student-class').textContent = student.class_name;
    document.getElementById('modal-student-attendance').textContent = student.attendance;
    document.getElementById('modal-student-avg').textContent = getOverallAverage(student);
    document.getElementById('modal-student-lowest-subject').textContent = getLowestScoringSubject(student).subject;
    document.getElementById('modal-student-highest-subject').textContent = getHighestScoringSubject(student).subject;
    document.getElementById('modal-student-predictive-score').textContent = generatePredictiveScore(student.historicalMarks);
    
    document.getElementById('modal-marks-table-body').innerHTML = Object.entries(student.marks).map(([subject, score]) => `<tr><td class="px-2 py-1">${subject}</td><td class="px-2 py-1 font-bold">${score}</td></tr>`).join('');
    
    const radarCtx = document.getElementById('studentRadarChart').getContext('2d');
    destroyChart('studentRadarChart');
    chartInstances.studentRadarChart = new Chart(radarCtx, { type: 'radar', data: { labels: Object.keys(student.marks), datasets: [{ label: student.name, data: Object.values(student.marks), backgroundColor: 'rgba(108, 92, 231, 0.4)', borderColor: 'rgba(108, 92, 231, 1)', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } } }, plugins: { legend: { position: 'top' } } } });

    const trendCtx = document.getElementById('studentTrendLineChart').getContext('2d');
    destroyChart('studentTrendLineChart');
    const datasets = Object.entries(student.historicalMarks).map(([subject, marks]) => ({ label: subject, data: marks.slice(-3), borderColor: `hsl(${(subject.length * 30) % 360}, 70%, 50%)`, tension: 0.3, fill: false }));
    chartInstances.studentTrendLineChart = new Chart(trendCtx, { type: 'line', data: { labels: ['Test 1', 'Test 2', 'Test 3'], datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } } });

    currentlySelectedStudent = student;
    studentDetailModal.classList.remove('hidden');
}

// --- Student View Rendering & Features ---
function populateStudentView(student) {
    if (!student) return;

    // 1. Update Sidebar Name
    document.getElementById('student-sidebar-name').innerHTML = `
        <i class="fas fa-user-graduate"></i> ${student.name.split(' ')[0]}
    `;

    // 2. Update Stat Cards
    document.getElementById('student-dashboard-avg').textContent = `${student.overallAverage}%`;
    document.getElementById('student-dashboard-attendance').textContent = `${student.attendance}%`;
    document.getElementById('student-dashboard-quizzes').textContent = student.quizzesTaken;

    // 3. Update Strengths & Weaknesses
    const strengthsContainer = document.getElementById('student-strengths');
    const weaknessesContainer = document.getElementById('student-weaknesses');
    strengthsContainer.innerHTML = ''; // Clear static content
    weaknessesContainer.innerHTML = ''; // Clear static content

    if (student.marks && Object.keys(student.marks).length > 0) {
        const sortedSubjects = Object.entries(student.marks).sort(([, a], [, b]) => b - a);

        // Get top 2 strengths
        sortedSubjects.slice(0, 2).forEach(([subject, score]) => {
            const item = document.createElement('div');
            item.className = 'subject-item';
            item.innerHTML = `<span>${subject}:</span> <span>${score}%</span>`;
            strengthsContainer.appendChild(item);
        });

        // Get bottom 2 weaknesses
        if (sortedSubjects.length > 2) {
            sortedSubjects.slice(-2).reverse().forEach(([subject, score]) => {
                const item = document.createElement('div');
                item.className = 'subject-item';
                item.innerHTML = `<span>${subject}:</span> <span>${score}%</span>`;
                weaknessesContainer.appendChild(item);
            });
        }
    } else {
        strengthsContainer.innerHTML = '<p>No marks data available.</p>';
    }

    // 4. Populate Quiz Subject Dropdown (from allQuizData, not marks)
    const subjectSelect = document.getElementById('subject-select');
    subjectSelect.innerHTML = '';
    const uniqueSubjects = [...new Set(allQuizData.map(q => q.subject))];
    uniqueSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectSelect.appendChild(option);
    });
}


async function renderStudentView() {
    const student = currentLoggedInUser;
    if (!student) return;
    
    populateStudentView(student);
    showView('student-view');
    renderStudentDoubts(); // This fetches and renders doubts
}

async function renderStudentDoubts() {
    if (!currentLoggedInUser) return;
    const container = document.getElementById('student-doubts-container');
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/student/doubts/${currentLoggedInUser.id}`);
        const result = await response.json();

        if (response.ok && result.success) {
            container.innerHTML = '';
            if (result.doubts.length === 0) {
                container.innerHTML = '<p class="text-gray-600">You have not asked any doubts yet.</p>';
                return;
            }
            result.doubts.forEach(doubt => {
                const doubtEl = document.createElement('div');
                doubtEl.className = 'doubt-item student-doubt';
                let answerHtml = doubt.answer_text 
                    ? `<p class="answer-text"><strong>Answer:</strong> ${doubt.answer_text}</p>`
                    : '<p class="unanswered-text">Awaiting answer...</p>';
                doubtEl.innerHTML = `
                    <p class="question-text"><strong>Q:</strong> ${doubt.question_text}</p>
                    ${answerHtml}
                `;
                container.appendChild(doubtEl);
            });
        } else {
            container.innerHTML = '<p class="text-red-500">Could not load your doubts.</p>';
        }
    } catch (error) {
        console.error("Failed to fetch student doubts:", error);
        container.innerHTML = '<p class="text-red-500">Error connecting to the server.</p>';
    }
}

async function populateTeacherDropdown() {
    const selectEl = document.getElementById('teacher-select');
    selectEl.innerHTML = '<option value="">Loading teachers...</option>';
    try {
        const response = await fetch(`${API_BASE_URL}/student/teachers`);
        const result = await response.json();
        if (response.ok && result.success) {
            selectEl.innerHTML = '<option value="">Select a Teacher (Optional)</option>';
            result.teachers.forEach(teacher => {
                const option = document.createElement('option');
                option.value = teacher.id;
                option.textContent = teacher.name;
                selectEl.appendChild(option);
            });
        } else {
            selectEl.innerHTML = '<option value="">Could not load teachers</option>';
        }
    } catch (error) {
        console.error("Failed to fetch teachers:", error);
        selectEl.innerHTML = '<option value="">Error loading teachers</option>';
    }
}

async function handleSendDoubt() {
    const textarea = document.getElementById('doubt-textarea');
    const doubtText = textarea.value.trim();
    const teacherSelect = document.getElementById('teacher-select');
    const teacherId = teacherSelect.value;

    if (doubtText === '') {
        showToast('Please enter your question before sending.', 'error');
        return;
    }

    if (!currentLoggedInUser) {
        showToast('Error: You must be logged in to ask a question.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/student/ask-doubt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: currentLoggedInUser.id,
                question_text: doubtText,
                teacher_id: teacherId || null
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            textarea.value = '';
            document.getElementById('ask-doubt-modal').classList.add('hidden');
            showToast(result.message, 'success');
            renderStudentDoubts(); // Refresh the student's doubt list
        } else {
            showToast(result.message || 'An error occurred.', 'error');
        }
    } catch (error) {
        console.error("Failed to send doubt:", error);
        showToast('Could not connect to the server to send your question.', 'error');
    }
}

async function handleStudentChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (message === '') return;

    const chatSendBtn = document.getElementById('chat-send');
    chatSendBtn.disabled = true;
    document.getElementById('chat-send-text').classList.add('hidden');
    document.getElementById('chat-spinner').classList.remove('hidden');

    const history = document.getElementById('chat-history');
    history.innerHTML += `<div class="chat-message-user"><div class="chat-bubble"><p>${message}</p></div></div>`;
    input.value = '';
    history.scrollTop = history.scrollHeight;

    const student = currentLoggedInUser;
    const studentContext = `Student: ${student.name}, Marks: ${JSON.stringify(student.marks)}, Attendance: ${student.attendance}%.`;
    const prompt = `You are LionsGPT, a friendly AI tutor. Based on the student's data and their question, provide a helpful, concise response (3-5 sentences). Be encouraging.\n\nData: ${studentContext}\nQuestion: ${message}`;
    const response = await callGeminiApi(prompt);

    history.innerHTML += `<div class="chat-message-ai"><div class="chat-bubble"><p>${response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p></div></div>`;
    history.scrollTop = history.scrollHeight;

    chatSendBtn.disabled = false;
    document.getElementById('chat-send-text').classList.remove('hidden');
    document.getElementById('chat-spinner').classList.add('hidden');
}

// --- New Advanced Quiz Functionality ---

async function loadQuizData() {
    try {
        const response = await fetch('quizdata.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allQuizData = await response.json();
        // Once data is loaded, populate the subject dropdown
        populateStudentView(currentLoggedInUser);
    } catch (error) {
        console.error("Could not load quiz data:", error);
        const quizContainer = document.getElementById('quiz-container');
        if(quizContainer) {
            quizContainer.innerHTML = '<p class="text-red-500">Error: Could not load quiz questions. Please try again later.</p>';
        }
    }
}

function startQuiz() {
    const selectedSubject = document.getElementById('subject-select').value;
    const numQuestions = parseInt(document.getElementById('num-questions-input').value);
    
    // Filter questions by subject and shuffle them
    const subjectQuestions = allQuizData.filter(q => q.subject === selectedSubject);
    currentQuizQuestions = subjectQuestions.sort(() => 0.5 - Math.random()).slice(0, numQuestions);

    if (currentQuizQuestions.length === 0) {
        showToast('No questions available for this subject. Please select another.', 'error');
        return;
    }

    currentQuestionIndex = 0;
    quizResults = [];
    selectedOption = null;

    document.getElementById('quiz-start-screen').classList.add('hidden');
    document.getElementById('quiz-analysis-screen').classList.add('hidden');
    document.getElementById('quiz-question-screen').classList.remove('hidden');
    document.getElementById('submit-answer-btn').textContent = 'Submit';

    startTimer();
    showQuestion();
}

function startTimer() {
    quizStartTime = new Date();
    const timerEl = document.getElementById('quiz-timer');
    timerEl.textContent = '00:00';
    quizTimerInterval = setInterval(() => {
        const now = new Date();
        const seconds = Math.floor((now - quizStartTime) / 1000);
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(quizTimerInterval);
}

function showQuestion() {
    // Reset from previous question
    selectedOption = null;
    document.getElementById('ai-explanation-container').classList.add('hidden');
    document.getElementById('ai-explanation-text').innerHTML = '';

    const question = currentQuizQuestions[currentQuestionIndex];
    document.getElementById('quiz-question-title').textContent = `Question ${currentQuestionIndex + 1} of ${currentQuizQuestions.length}`;
    document.getElementById('quiz-question').textContent = question.question;
    
    const optionsContainer = document.getElementById('quiz-options');
    optionsContainer.innerHTML = '';
    // Shuffle options for variety
    const shuffledOptions = [...question.options].sort(() => 0.5 - Math.random());
    shuffledOptions.forEach(option => {
        const optionElement = document.createElement('button');
        optionElement.textContent = option;
        optionElement.classList.add('quiz-option-btn');
        optionElement.addEventListener('click', () => selectOption(optionElement, option));
        optionsContainer.appendChild(optionElement);
    });
    
    document.getElementById('submit-answer-btn').disabled = true;
}

function selectOption(optionElement, optionValue) {
    document.querySelectorAll('.quiz-option-btn').forEach(btn => btn.classList.remove('selected'));
    optionElement.classList.add('selected');
    selectedOption = optionValue;
    document.getElementById('submit-answer-btn').disabled = false;
}

function submitAnswer() {
    const submitBtn = document.getElementById('submit-answer-btn');
    const question = currentQuizQuestions[currentQuestionIndex];
    const correctAnswer = question.answer;

    // First click: Check answer
    if (submitBtn.textContent === 'Submit') {
        const isCorrect = selectedOption === correctAnswer;
        
        quizResults.push({
            question: question.question,
            topic: question.topic,
            options: question.options,
            userAnswer: selectedOption,
            correctAnswer: correctAnswer,
            isCorrect: isCorrect
        });

        // Visually show correct/incorrect answers
        const optionButtons = document.querySelectorAll('.quiz-option-btn');
        optionButtons.forEach(btn => {
            btn.disabled = true; // Disable all options
            if (btn.textContent === correctAnswer) {
                btn.classList.add('correct');
            } else if (btn.classList.contains('selected')) {
                btn.classList.add('incorrect');
            }
        });

        if (!isCorrect) {
            getAIExplanation(question, selectedOption);
        }

        const nextText = currentQuestionIndex < currentQuizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz';
        submitBtn.textContent = nextText;
    
    // Second click: Go to next question or finish
    } else {
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuizQuestions.length) {
            submitBtn.textContent = 'Submit';
            showQuestion();
        } else {
            finishQuiz();
        }
    }
}

async function getAIExplanation(question, wrongAnswer) {
    const container = document.getElementById('ai-explanation-container');
    const spinner = document.getElementById('ai-explanation-spinner');
    const textEl = document.getElementById('ai-explanation-text');
    
    container.classList.remove('hidden');
    spinner.classList.remove('hidden');
    textEl.classList.add('hidden');

    const prompt = `The student was asked: "${question.question}". They incorrectly answered "${wrongAnswer}". The correct answer is "${question.answer}". Briefly and simply explain why "${question.answer}" is correct. Do not be conversational, just provide the explanation.`;
    const explanation = await callGeminiApi(prompt);
    
    textEl.innerHTML = explanation.replace(/\n/g, '<br>');
    spinner.classList.add('hidden');
    textEl.classList.remove('hidden');
}


async function finishQuiz() {
    stopTimer();
    const timeTaken = Math.floor((new Date() - quizStartTime) / 1000);

    const score = quizResults.filter(r => r.isCorrect).length;
    const total = currentQuizQuestions.length;
    const accuracy = total > 0 ? (score / total) * 100 : 0;
    
    const analysisData = {
        score: score,
        totalQuestions: total,
        accuracy: accuracy.toFixed(1),
        timeTaken: timeTaken,
        subject: document.getElementById('subject-select').value,
        results: quizResults
    };

    showAnalysis(analysisData);
    saveQuizAttempt(analysisData);
}

function showAnalysis(data) {
    document.getElementById('quiz-question-screen').classList.add('hidden');
    document.getElementById('quiz-analysis-screen').classList.remove('hidden');

    // Populate metrics
    document.getElementById('analysis-score').textContent = `${data.score} / ${data.totalQuestions}`;
    document.getElementById('analysis-accuracy').textContent = `${data.accuracy}%`;
    const mins = Math.floor(data.timeTaken / 60);
    const secs = (data.timeTaken % 60).toString().padStart(2, '0');
    document.getElementById('analysis-time').textContent = `${mins}:${secs}`;
    
    // Topic Analysis
    const topicCounts = {};
    data.results.forEach(res => {
        if (!topicCounts[res.topic]) topicCounts[res.topic] = { correct: 0, incorrect: 0 };
        res.isCorrect ? topicCounts[res.topic].correct++ : topicCounts[res.topic].incorrect++;
    });
    
    const strongTopics = [];
    const weakTopics = [];
    for (const topic in topicCounts) {
        if (topicCounts[topic].incorrect === 0) strongTopics.push(topic);
        if (topicCounts[topic].correct === 0) weakTopics.push(topic);
    }

    document.getElementById('analysis-strong-topics').innerHTML = strongTopics.length ? strongTopics.map(t => `<li>${t}</li>`).join('') : '<li>None</li>';
    document.getElementById('analysis-weak-topics').innerHTML = weakTopics.length ? weakTopics.map(t => `<li>${t}</li>`).join('') : '<li>None</li>';

    // Pie Chart
    destroyChart('analysis-pie-chart');
    const pieCtx = document.getElementById('analysis-pie-chart').getContext('2d');
    chartInstances['analysis-pie-chart'] = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: ['Correct', 'Incorrect'],
            datasets: [{
                data: [data.score, data.totalQuestions - data.score],
                backgroundColor: ['#2ecc71', '#e74c3c'],
                borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    
    // Question Review
    const reviewContainer = document.getElementById('analysis-question-list');
    reviewContainer.innerHTML = '';
    data.results.forEach(res => {
        const item = document.createElement('div');
        item.className = `question-review-item ${res.isCorrect ? 'correct' : 'incorrect'}`;
        item.innerHTML = `
            <p class="font-semibold">${res.question}</p>
            <p>Your answer: <span class="review-user-answer ${res.isCorrect ? 'correct' : 'incorrect'}">${res.userAnswer}</span></p>
            ${!res.isCorrect ? `<p>Correct answer: <span class="font-bold">${res.correctAnswer}</span></p>` : ''}
        `;
        reviewContainer.appendChild(item);
    });
}

async function saveQuizAttempt(data) {
    if (!currentLoggedInUser) return;
    try {
        await fetch(`${API_BASE_URL}/student/quiz/attempt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: currentLoggedInUser.id,
                subject: data.subject,
                score: data.score,
                total_questions: data.totalQuestions,
                accuracy: parseFloat(data.accuracy),
                time_taken_seconds: data.timeTaken,
                details: data.results // Save the full breakdown
            })
        });
        // Optionally show toast, but might be too noisy.
    } catch (error) {
        console.error("Failed to save quiz attempt:", error);
        showToast('Could not save quiz results to your history.', 'error');
    }
}

async function loadQuizHistory() {
    if (!currentLoggedInUser) return;
    const container = document.getElementById('quiz-history-container');
    container.innerHTML = '<div class="spinner-dark"></div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/student/quiz/history/${currentLoggedInUser.id}`);
        const result = await response.json();
        
        if (result.success && result.history.length > 0) {
            container.innerHTML = '';
            result.history.forEach(attempt => {
                const item = document.createElement('div');
                item.className = 'history-item';
                const accuracyColor = attempt.accuracy >= 75 ? 'text-green-500' : attempt.accuracy >= 50 ? 'text-yellow-500' : 'text-red-500';
                item.innerHTML = `
                    <div>
                        <span class="font-bold">${attempt.subject}</span>
                        <span class="text-sm text-gray-500 ml-2">${new Date(attempt.attempted_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                        <span class="mr-4">Score: <strong>${attempt.score}/${attempt.total_questions}</strong></span>
                        <span class="${accuracyColor}">Accuracy: <strong>${attempt.accuracy.toFixed(1)}%</strong></span>
                    </div>
                `;
                container.appendChild(item);
            });
        } else {
             container.innerHTML = '<p class="text-gray-600">No past quiz attempts found.</p>';
        }
    } catch (error) {
        console.error("Failed to load quiz history:", error);
        container.innerHTML = '<p class="text-red-500">Could not load quiz history.</p>';
    }
}

// --- Progress Tracker Functionality ---
function renderProgressTracker(student) {
    destroyChart('progress-line-chart');
    destroyChart('progress-radar-chart');

    const lineChartEl = document.getElementById('progress-line-chart');
    const radarChartEl = document.getElementById('progress-radar-chart');

    if (!student || !student.historicalMarks || !student.marks || !lineChartEl || !radarChartEl) {
        lineChartEl.parentElement.innerHTML = '<p class="text-gray-600">No progress data available.</p>';
        radarChartEl.parentElement.innerHTML = '<p class="text-gray-600">No subject data available.</p>';
        return;
    }

    // Line Chart: Calculate overall average for each historical data point
    const historicalMarks = student.historicalMarks;
    const firstSubjectHistory = Object.values(historicalMarks)[0] || [];
    const labels = firstSubjectHistory.map((_, i) => `Test ${i + 1}`);
    
    const overallAverages = labels.map((_, i) => {
        let total = 0;
        let count = 0;
        Object.values(historicalMarks).forEach(history => {
            if (history[i] !== undefined) {
                total += history[i];
                count++;
            }
        });
        return count > 0 ? (total / count).toFixed(1) : 0;
    });

    const lineCtx = lineChartEl.getContext('2d');
    chartInstances['progress-line-chart'] = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Overall Score Trend',
                data: overallAverages,
                borderColor: '#36a2eb',
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });

    // Radar Chart: Use current marks for subject mastery
    const radarCtx = radarChartEl.getContext('2d');
    chartInstances['progress-radar-chart'] = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: Object.keys(student.marks),
            datasets: [{
                label: 'Current Mastery',
                data: Object.values(student.marks),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgb(255, 99, 132)',
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } } }
    });
}


// --- Parent View Rendering & Features ---
async function renderParentDashboard() {
    const parent = currentLoggedInUser;
    if (!parent) return;

    document.getElementById('parent-banner').innerHTML = `<i class="fas fa-users"></i><div><h3>Welcome, ${parent.name}!</h3><p>Here's a summary of your children's academic progress.</p></div>`;
    showView('parent-dashboard-view');
    
    const response = await fetch(`${API_BASE_URL}/parent/children/${parent.id}`);
    const data = await response.json();
    const children = data.children;

    const container = document.getElementById('children-cards-container');
    container.innerHTML = '';
    if (children.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-gray-600">No children linked to this account.</p>';
    } else {
        children.forEach((child, index) => {
            const card = document.createElement('div');
            card.className = 'card child-card';
            card.style.animationDelay = `${0.2 + index * 0.1}s`;
            card.innerHTML = `<i class="fas fa-child-reaching"></i><h3 class="text-2xl font-semibold">${child.name}</h3><p class="text-lg text-gray-600">Class: ${child.class_name}</p><p class="mt-2 text-lg">Avg: <strong>${getOverallAverage(child)}%</strong> | Att: <strong>${child.attendance}%</strong></p>`;
            card.addEventListener('click', () => showParentChildDetailView(child.id));
            container.appendChild(card);
        });
    }

    renderParentComplaints();
}

async function renderParentComplaints() {
    if (!currentLoggedInUser) return;
    const container = document.getElementById('complaints-container');
    container.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/parent/complaints/${currentLoggedInUser.id}`);
        const result = await response.json();

        if (response.ok && result.success) {
            container.innerHTML = '';
            if (result.complaints.length === 0) {
                container.innerHTML = '<p class="text-gray-600">No complaints have been received.</p>';
            } else {
                result.complaints.forEach(complaint => {
                    const complaintEl = document.createElement('div');
                    complaintEl.className = 'complaint-item'; // You'll need CSS for this
                    complaintEl.innerHTML = `
                        <h4>Complaint regarding ${complaint.student_name}</h4>
                        <p>From: ${complaint.teacher_name}</p>
                        <p><strong>Remark:</strong> ${complaint.teacher_remark}</p>
                        <small>Sent: ${new Date(complaint.created_at).toLocaleString()}</small>
                    `;
                    container.appendChild(complaintEl);
                });
            }
        } else {
            container.innerHTML = '<p class="text-red-500">Could not load complaints.</p>';
        }
    } catch (error) {
        container.innerHTML = '<p class="text-red-500">Error connecting to server.</p>';
    }
}

async function showParentChildDetailView(childId) {
    destroyAllCharts();
    currentlyViewedChildId = childId;
    
    const response = await fetch(`${API_BASE_URL}/parent/children/${currentLoggedInUser.id}`);
    const data = await response.json();
    const child = data.children.find(c => c.id === childId);
    const topper = data.topper;

    if (!child) return;
    
    document.getElementById('parent-view-child-name').textContent = `${child.name}'s Report`;
    document.getElementById('parent-view-child-class').textContent = child.class_name;
    document.getElementById('parent-view-child-attendance').textContent = child.attendance;
    document.getElementById('parent-view-child-avg').textContent = getOverallAverage(child);
    
    const teacherMessageEl = document.getElementById('parent-view-teacher-message');
    teacherMessageEl.innerHTML = `<div class="flex items-center justify-center gap-2"><div class="spinner"></div>Generating...</div>`;
    showView('parent-child-detail-view');

    const teacherMsgPrompt = `As an AI, write a concise, encouraging message from a teacher (Mr. Lee) to a parent about ${child.name}'s performance. Mention their average of ${getOverallAverage(child)}%, strongest subject (${getHighestScoringSubject(child).subject}), and weakest subject (${getLowestScoringSubject(child).subject}). Suggest collaborating. Limit to 3-4 sentences.`;
    teacherMessageEl.innerHTML = (await callGeminiApi(teacherMsgPrompt)).replace(/\n/g, '<br>');

    const marksBody = document.getElementById('parent-view-marks-table-body');
    marksBody.innerHTML = Object.entries(child.marks).map(([subject, mark]) => `<tr><td>${subject}</td><td>${mark}</td><td>${mark > 75 ? '<span class="flag-green">Strong</span>' : mark < 60 ? '<span class="flag-red">Weak</span>' : '<span class="flag-orange">Average</span>'}</td></tr>`).join('');
    
    const marksTopperCtx = document.getElementById('parentChildMarksTopperChart').getContext('2d');
    chartInstances.parentChildMarksTopperChart = new Chart(marksTopperCtx, { type: 'bar', data: { labels: Object.keys(child.marks), datasets: [ { label: child.name, data: Object.values(child.marks), backgroundColor: 'rgba(108, 92, 231, 0.7)' }, { label: `${topper.name} (Topper)`, data: Object.values(topper.marks), backgroundColor: 'rgba(26, 188, 156, 0.7)' } ] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'top' } } } });

    const attendanceTrendCtx = document.getElementById('parentChildAttendanceTrendChart').getContext('2d');
    chartInstances.parentChildAttendanceTrendChart = new Chart(attendanceTrendCtx, { type: 'line', data: { labels: ['Term 1', 'Term 2', 'Term 3'], datasets: [{ label: 'Attendance %', data: [child.attendance > 5 ? child.attendance - 5 : 2, child.attendance < 97 ? child.attendance + 3 : 100, child.attendance], tension: 0.1, fill: true, borderColor: 'rgb(255, 159, 64)', backgroundColor: 'rgba(255, 159, 64, 0.2)' }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } } });

    document.getElementById('note-spinner').classList.add('hidden');
}

async function handleGenerateNoteToTeacher() {
    const btn = document.getElementById('generate-teacher-note');
    btn.disabled = true;
    document.getElementById('note-btn-text').classList.add('hidden');
    document.getElementById('note-spinner').classList.remove('hidden');

    const response = await fetch(`${API_BASE_URL}/parent/children/${currentLoggedInUser.id}`);
    const data = await response.json();
    const child = data.children.find(c => c.id === currentlyViewedChildId);

    if (!child) { showToast('Error: No child selected.', 'error'); return; }

    const prompt = `You are an assistant for parents. Draft a polite, brief email from a parent to their child's teacher, Mr. Lee.\nChild: ${child.name}\nAvg: ${getOverallAverage(child)}%\nStrongest: ${getHighestScoringSubject(child).subject}\nWeakest: ${getLowestScoringSubject(child).subject}\nAttendance: ${child.attendance}%\nThe parent wants to thank the teacher and ask for advice on supporting their child's learning at home, especially in their weakest subject. Format as a complete email.`;
    const note = await callGeminiApi(prompt);
    
    document.getElementById('gemini-modal-title').textContent = `Draft Note for ${child.name}'s Teacher`;
    document.getElementById('gemini-modal-content').innerHTML = note.replace(/\n/g, '<br>');
    geminiResponseModal.classList.remove('hidden');

    btn.disabled = false;
    document.getElementById('note-btn-text').classList.remove('hidden');
    document.getElementById('note-spinner').classList.add('hidden');
}

function showComplaintModal() {
    if (!currentlySelectedStudent) return;
    document.getElementById('complaint-student-name').textContent = currentlySelectedStudent.name;
    document.getElementById('complaint-textarea').value = '';
    document.getElementById('complaint-modal').classList.remove('hidden');
}

async function handleSendComplaint() {
    const remark = document.getElementById('complaint-textarea').value.trim();
    if (!remark) {
        showToast('Please enter a remark.', 'error');
        return;
    }

    if (!currentlySelectedStudent || !currentLoggedInUser) {
        showToast('Error: No student or teacher context.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/teacher/complaint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacher_id: currentLoggedInUser.id,
                student_id: currentlySelectedStudent.id,
                remark: remark
            })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Complaint sent successfully!', 'success');
            document.getElementById('complaint-modal').classList.add('hidden');
        } else {
            showToast(result.message || 'Could not send complaint.', 'error');
        }
    } catch (error) {
        showToast('Could not connect to the server.', 'error');
    }
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadQuizData();
    showView('login-view');

    // Theme Setup
    setTheme(localStorage.getItem('theme') || 'dark');
    document.getElementById('app').addEventListener('click', (e) => {
        if (e.target.closest('.theme-toggle-btn')) {
            setTheme(htmlEl.classList.contains('dark') ? 'light' : 'dark');
        }
    });
    
    // --- GLOBAL EVENT LISTENERS ---

    // Login
    document.getElementById('login-form').addEventListener('submit', (e) => { e.preventDefault(); handleAuthLogin(); });

    const loginButtons = document.querySelectorAll('.login-button');
    loginButtons.forEach(button => {
        button.classList.add('no-hover'); // Initially disable hover
        button.addEventListener('animationend', (event) => {
            if (event.animationName === 'bounceInUp') {
				button.classList.remove('animate__bounceInUp'); // Remove animate.css class
                button.classList.remove('no-hover'); // Re-enable hover effects
            }
        });
    });

	document.getElementById('login-teacher').addEventListener('click', () => showAuthFormForRole('teacher'));
	document.getElementById('login-student').addEventListener('click', () => showAuthFormForRole('student'));
	document.getElementById('login-parent').addEventListener('click', () => showAuthFormForRole('parent'));
    authLoginBtn.addEventListener('click', handleAuthLogin);
    passwordInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAuthLogin());
    backToRolesBtn.addEventListener('click', handleBackToRoles);
    
    // Logouts
    ['teacher-logout', 'student-logout', 'parent-logout'].forEach(id => document.getElementById(id).addEventListener('click', logout));
    
    // Modals
    document.getElementById('close-student-detail').addEventListener('click', () => studentDetailModal.classList.add('hidden'));
    document.getElementById('close-doubt-modal').addEventListener('click', () => document.getElementById('ask-doubt-modal').classList.add('hidden'));
    document.getElementById('close-answer-modal').addEventListener('click', () => document.getElementById('answer-doubt-modal').classList.add('hidden'));
    document.getElementById('close-complaint-modal').addEventListener('click', () => document.getElementById('complaint-modal').classList.add('hidden'));
    document.querySelector('#gemini-response-modal .modal-close-button').addEventListener('click', () => geminiResponseModal.classList.add('hidden'));

    // Teacher View
    document.getElementById('generate-suggestions').addEventListener('click', handleGenerateSuggestions);
    document.getElementById('open-complaint-modal-btn').addEventListener('click', showComplaintModal);
    document.getElementById('teacher-dashboard-view').addEventListener('click', (e) => {
        if (e.target.classList.contains('resolve-doubt-btn')) {
            handleResolveDoubt(e.target.dataset.doubtId);
        } else if (e.target.classList.contains('answer-doubt-btn')) {
            showAnswerModal(e.target.dataset.doubtId, e.target.dataset.question);
        }
    });
    document.getElementById('send-answer-btn').addEventListener('click', handleSendAnswer);
    document.getElementById('send-complaint-btn').addEventListener('click', handleSendComplaint);

    // Student View Navigation
    const studentNavItems = document.querySelectorAll('#student-view .sidebar-nav .nav-item');
    const contentDivs = document.querySelectorAll('#student-view .main-content > div[id$="-content"]');
    studentNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (item.id === 'ask-doubt-nav-item') {
                document.getElementById('ask-doubt-modal').classList.remove('hidden');
                populateTeacherDropdown();
                return; 
            }

            studentNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            contentDivs.forEach(div => div.classList.add('hidden'));
            const contentId = item.id.replace('-nav-item', '-content');
            document.getElementById(contentId).classList.remove('hidden');

            if (contentId === 'progress-content') {
                renderProgressTracker(currentLoggedInUser);
            } else if (contentId === 'dashboard-content') {
                renderStudentDoubts();
            } else if (contentId === 'practice-content') {
                loadQuizHistory();
            }
        });
    });
    
    // Student Actions
    document.getElementById('send-doubt-btn').addEventListener('click', handleSendDoubt);
    document.getElementById('chat-send').addEventListener('click', handleStudentChat);
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission or newline in textarea
            handleStudentChat();
        }
    });

    // Speech Recognition Logic
    const micBtn = document.getElementById('chat-mic-btn');
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
        micBtn.addEventListener('click', () => {
            if (isRecording) {
                speechRecognition.stop();
            } else {
                startSpeechRecognition();
            }
        });
    } else {
        micBtn.style.display = 'none';
        console.warn('Speech Recognition API not supported in this browser.');
    }

    function startSpeechRecognition() {
        if (isRecording) return;
        const existingText = chatInput.value ? chatInput.value.trim() + ' ' : '';
        let finalTranscript = '';

        speechRecognition = new SpeechRecognitionAPI();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
        speechRecognition.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
        speechRecognition.onerror = (event) => { console.error('Speech recognition error', event.error); };
        speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                event.results[i].isFinal ? finalTranscript += event.results[i][0].transcript + ' ' : interimTranscript += event.results[i][0].transcript;
            }
            chatInput.value = existingText + finalTranscript + interimTranscript;
        };
        speechRecognition.start();
    }

    // Quiz Buttons
    document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);
    document.getElementById('submit-answer-btn').addEventListener('click', submitAnswer);
    document.getElementById('retake-quiz-btn').addEventListener('click', () => {
        document.getElementById('quiz-analysis-screen').classList.add('hidden');
        document.getElementById('quiz-start-screen').classList.remove('hidden');
    });

    // Parent View
    document.getElementById('generate-teacher-note').addEventListener('click', handleGenerateNoteToTeacher);
    document.getElementById('copy-gemini-response').addEventListener('click', () => copyToClipboard('gemini-modal-content'));
    document.getElementById('download-parent-report').addEventListener('click', () => showToast('Report downloaded (mock)!'));
    document.getElementById('back-to-parent-dashboard').addEventListener('click', renderParentDashboard);
});