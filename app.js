// app.js – Complete system with OTP verification, admin panel, per‑subject grade distribution analysis,
// new MUET section marks, and student details in printed slip.

// ========== FIREBASE CONFIGURATION ==========
const firebaseConfig = {
    apiKey: "AIzaSyCBjA_xaSAJdweodUsEMzvGY5R69I3esgE",
    authDomain: "resultexam-25f4e.firebaseapp.com",
    databaseURL: "https://resultexam-25f4e-default-rtdb.firebaseio.com",
    projectId: "resultexam-25f4e",
    storageBucket: "resultexam-25f4e.firebasestorage.app",
    messagingSenderId: "1090858219421",
    appId: "1:1090858219421:web:da3e3ddd4ab18027f06174",
    measurementId: "G-RJ02VST99R"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ========== GLOBAL STATE ==========
let pendingRegistration = null;        // { userType, idNumber, name, extraData }
let verificationTimerInterval = null;

// ========== UTILITY FUNCTIONS ==========
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function navigateTo(pageId) {
    // Admin panel password protection
    if (pageId === 'admin-verify') {
        const pwd = prompt('Enter admin password:');
        if (pwd !== 'smkbadin2025admin') {
            showToast('Incorrect password', 'error');
            return;
        }
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${pageId}`);
    if (target) target.classList.add('active');

    // Load dynamic content on specific pages
    if (pageId === 'teacher-dashboard') loadTeacherClasses();
    if (pageId === 'register-student' || pageId === 'register-teacher') loadClassesForRegistration();
    if (pageId === 'admin-verify') loadAdminCodes();
}

// ========== PRINT FUNCTION (UPDATED – includes student details) ==========
function printContent(areaId, reportTitle = 'Pusat Tingkatan Enam SMK Badin', reportSubtitle = '') {
    const printArea = document.getElementById(areaId);
    if (!printArea) {
        showToast('Nothing to print.');
        return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        showToast('Popup blocked. Please allow popups for this site.', 'error');
        return;
    }

    const contentHTML = printArea.innerHTML;
    let logoSrc = '';
    const logoImg = document.getElementById('appLogoImage');
    if (logoImg && logoImg.src) {
        logoSrc = logoImg.src;
    } else {
        const fallbackImg = document.querySelector('.icon-circle img');
        if (fallbackImg && fallbackImg.src) logoSrc = fallbackImg.src;
    }

    const logoHTML = logoSrc ? `<img class="print-logo" src="${logoSrc}" alt="Logo" />` : '';

    // Build school header
    let headerHTML = `
        <div class="print-header">
            ${logoHTML}
            <div class="print-title-box">
                <h1 class="print-title">${reportTitle}</h1>
                ${reportSubtitle ? `<p class="print-subtitle">${reportSubtitle}</p>` : ''}
            </div>
        </div>
    `;

    // If printing student results, include student details
    if (areaId === 'studentResultsPrintArea') {
        const userName = sessionStorage.getItem('userName') || '';
        const userId = sessionStorage.getItem('userId') || '';
        const userClass = sessionStorage.getItem('userClass') || '';
        headerHTML += `
            <div class="student-detail-print">
                <p><strong>Student Name:</strong> ${userName}</p>
                <p><strong>IC No.:</strong> ${userId}</p>
                <p><strong>Class:</strong> ${userClass}</p>
            </div>
        `;
    }

    const printCSS = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 20px; color: #000; background: #fff; }
            .print-header { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .print-logo { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; }
            .print-title-box { text-align: center; flex: 1; }
            .print-title { font-size: 1.4rem; margin: 0; }
            .print-subtitle { font-size: 0.9rem; color: #333; margin-top: 6px; }
            .student-detail-print { margin-bottom: 16px; border: 1px solid #ccc; padding: 10px; background: #fafafa; }
            .student-detail-print p { margin: 4px 0; font-size: 1rem; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #f0f0f0; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; background: #e2e8f0; }
            .term-heading, .result-summary, .status-container, h3, h4, h2 { color: #000; }
            .flex-between, .btn, .toggle-password, .forgot-link, .modal-close, .modal-header-actions { display: none; }
        </style>
    `;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>Print</title>${printCSS}</head>
        <body>${headerHTML}${contentHTML}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}

// ========== PASSWORD TOGGLE (hold to show) ==========
function setupPasswordToggle(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input || !btn) return;

    btn.addEventListener('mousedown', () => { input.type = 'text'; });
    btn.addEventListener('mouseup', () => { input.type = 'password'; });
    btn.addEventListener('mouseleave', () => { input.type = 'password'; });
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        input.type = 'text';
    });
    btn.addEventListener('touchend', () => { input.type = 'password'; });
}

// ========== LOGIN & LOGOUT ==========
async function handleStudentLogin(event) {
    event.preventDefault();
    const studentId = document.getElementById('studentIdInput').value.trim();
    const password = document.getElementById('studentPasswordInput').value;

    if (!studentId || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading();
    try {
        const doc = await db.collection('students').doc(studentId).get();
        if (!doc.exists || doc.data().password !== password) {
            throw new Error('Invalid credentials');
        }
        const studentData = doc.data();

        sessionStorage.setItem('userType', 'student');
        sessionStorage.setItem('userId', studentId);
        sessionStorage.setItem('userName', studentData.name);
        sessionStorage.setItem('userClass', studentData.class);

        document.getElementById('studentNameDisplay').textContent = studentData.name;
        document.getElementById('studentIdDisplay').textContent = `ID: ${studentId} | Class: ${studentData.class}`;

        // MUET display handled in loadStudentResults, so we clear it first
        document.getElementById('muetDisplay').innerHTML = '';
        await loadStudentResults(studentId, studentData.class);
        navigateTo('student-results');
        showToast('Login successful!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Login failed.', 'error');
    }
    hideLoading();
}

async function handleTeacherLogin(event) {
    event.preventDefault();
    const staffId = document.getElementById('teacherStaffInput').value.trim();
    const password = document.getElementById('teacherPasswordInput').value;

    if (!staffId || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading();
    try {
        const doc = await db.collection('teachers').doc(staffId).get();
        if (!doc.exists || doc.data().password !== password) {
            throw new Error('Invalid credentials');
        }
        const teacherData = doc.data();

        sessionStorage.setItem('userType', 'teacher');
        sessionStorage.setItem('userId', staffId);
        sessionStorage.setItem('userName', teacherData.name);
        sessionStorage.setItem('teacherSubject', teacherData.subject || '');
        sessionStorage.setItem('teacherRole', teacherData.role || '');
        if (teacherData.homeroomClass) {
            sessionStorage.setItem('homeroomClass', teacherData.homeroomClass);
        }

        document.getElementById('teacherNameDisplay').textContent = teacherData.name;
        loadTeacherClasses();
        navigateTo('teacher-dashboard');
        showToast('Login successful!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Login failed.', 'error');
    }
    hideLoading();
}

function handleLogout() {
    sessionStorage.clear();
    navigateTo('main');
    showToast('Logged out successfully', 'info');
}

// ========== PASSWORD RESET ==========
function openResetPasswordModal(userType) {
    document.getElementById('resetUserType').value = userType;
    document.getElementById('resetIdLabel').textContent = userType === 'student' ? 'Student ID' : 'Staff Number';
    document.getElementById('resetPasswordModalOverlay').classList.add('active');
}

function closeResetPasswordModal() {
    document.getElementById('resetPasswordModalOverlay').classList.remove('active');
    document.getElementById('resetPasswordForm').reset();
}

async function handlePasswordReset(event) {
    event.preventDefault();
    const userType = document.getElementById('resetUserType').value;
    const userId = document.getElementById('resetUserId').value.trim();
    const fullName = document.getElementById('resetFullName').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;

    if (!userId || !fullName || !newPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading();
    try {
        const collectionName = userType === 'student' ? 'students' : 'teachers';
        const docRef = db.collection(collectionName).doc(userId);
        const doc = await docRef.get();

        if (!doc.exists) {
            showToast('No account found with this ID', 'error');
            hideLoading();
            return;
        }

        const data = doc.data();
        if (data.name.toLowerCase() !== fullName.toLowerCase()) {
            showToast('The name does not match our records', 'error');
            hideLoading();
            return;
        }

        await docRef.update({ password: newPassword });
        showToast('Password reset successfully!', 'success');
        closeResetPasswordModal();
    } catch (error) {
        console.error('Password reset error:', error);
        showToast('Reset failed. Try again.', 'error');
    }
    hideLoading();
}

// ========== STUDENT RESULTS (WITH RANKINGS) ==========
function getGrade(marks) {
    if (marks >= 80) return 'A';
    if (marks >= 70) return 'A-';
    if (marks >= 65) return 'B+';
    if (marks >= 60) return 'B';
    if (marks >= 55) return 'B-';
    if (marks >= 50) return 'C+';
    if (marks >= 45) return 'C';
    if (marks >= 40) return 'C-';
    if (marks >= 35) return 'D+';
    if (marks >= 30) return 'D';
    return 'F';
}

function getNGP(marks) {
    if (marks >= 80) return 4.0;
    if (marks >= 70) return 3.67;
    if (marks >= 65) return 3.33;
    if (marks >= 60) return 3.00;
    if (marks >= 55) return 2.67;
    if (marks >= 50) return 2.33;
    if (marks >= 45) return 2.00;
    if (marks >= 40) return 1.67;
    if (marks >= 35) return 1.33;
    if (marks >= 30) return 1.00;
    return 0.0;
}

async function loadStudentResults(studentId, className) {
    const contentDiv = document.getElementById('studentResultsContent');
    contentDiv.innerHTML = '<p class="text-center text-light">Loading results...</p>';

    try {
        const ownSnap = await db.collection('results').where('studentId', '==', studentId).get();
        if (ownSnap.empty) {
            contentDiv.innerHTML = '<p class="text-center text-light">No results found.</p>';
            document.getElementById('muetDisplay').innerHTML = '';
            return;
        }

        const grouped = {};
        ownSnap.forEach(doc => {
            const r = doc.data();
            if (!grouped[r.term]) grouped[r.term] = [];
            grouped[r.term].push(r);
        });

        let html = '';
        let overallNgpTotal = 0;
        let overallCount = 0;

        for (const [term, results] of Object.entries(grouped)) {
            let termNgpTotal = 0;
            html += `
            <div class="mb-24">
                <h3 class="term-heading">${term}</h3>
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Subject</th><th>Percentage (%)</th><th>Grade</th><th>NGP</th></tr></thead>
                        <tbody>`;
            results.forEach(r => {
                const grade = getGrade(r.marks);
                const ngp = getNGP(r.marks);
                termNgpTotal += ngp;
                overallNgpTotal += ngp;
                overallCount += 1;
                html += `<tr>
                    <td>${r.subject}</td>
                    <td>${r.marks}</td>
                    <td><span class="badge badge-${grade.toLowerCase().replace(/[^a-z]/g, '')}">${grade}</span></td>
                    <td>${ngp.toFixed(2)}</td>
                </tr>`;
            });
            const termAvgNgp = results.length ? (termNgpTotal / results.length).toFixed(2) : '0.00';
            html += `</tbody></table></div>
                <p class="fw-700 mt-8">Term Average NGP: ${termAvgNgp}</p>
            </div>`;
        }

        let ownAvgNgp = 0;
        if (overallCount > 0) {
            ownAvgNgp = overallNgpTotal / overallCount;
            html += `<div class="result-summary"><strong>Overall Average NGP: ${ownAvgNgp.toFixed(2)}</strong></div>`;
        }

        // Class ranking
        if (className) {
            try {
                const classResultsSnap = await db.collection('results').where('className', '==', className).get();
                const studentNgpMap = {};
                classResultsSnap.forEach(doc => {
                    const r = doc.data();
                    if (!studentNgpMap[r.studentId]) studentNgpMap[r.studentId] = { totalNgp: 0, count: 0 };
                    studentNgpMap[r.studentId].totalNgp += getNGP(r.marks);
                    studentNgpMap[r.studentId].count += 1;
                });

                const averages = Object.entries(studentNgpMap).map(([id, data]) => ({
                    studentId: id,
                    avgNgp: data.totalNgp / data.count
                }));
                averages.sort((a, b) => b.avgNgp - a.avgNgp);

                let classPosition = 'N/A';
                if (averages.length > 0) {
                    let rank = 1;
                    let prevAvg = averages[0].avgNgp;
                    for (let i = 0; i < averages.length; i++) {
                        if (averages[i].avgNgp < prevAvg) {
                            rank = i + 1;
                            prevAvg = averages[i].avgNgp;
                        }
                        if (averages[i].studentId === studentId) {
                            classPosition = rank;
                            break;
                        }
                    }
                }

                let status = '';
                if (ownAvgNgp >= 3.67) status = 'Excellent';
                else if (ownAvgNgp >= 3.00) status = 'Good';
                else if (ownAvgNgp >= 2.00) status = 'Satisfactory';
                else status = 'Needs Improvement';

                html += `
                <div class="status-container mt-12">
                    <div class="status-badge green">
                        <strong>🏅 Class Position: ${classPosition}</strong> (based on NGP)
                    </div>
                    <div class="status-badge blue">
                        <strong>📊 Academic Status: ${status}</strong>
                    </div>
                </div>`;
            } catch (err) {
                console.error('Class ranking error:', err);
                html += '<p class="text-light">Could not calculate class ranking.</p>';
            }
        }

        // Overall school ranking
        try {
            const allResultsSnap = await db.collection('results').get();
            const allStudentNgpMap = {};
            allResultsSnap.forEach(doc => {
                const r = doc.data();
                if (!allStudentNgpMap[r.studentId]) allStudentNgpMap[r.studentId] = { totalNgp: 0, count: 0 };
                allStudentNgpMap[r.studentId].totalNgp += getNGP(r.marks);
                allStudentNgpMap[r.studentId].count += 1;
            });

            const allAverages = Object.entries(allStudentNgpMap).map(([id, data]) => ({
                studentId: id,
                avgNgp: data.totalNgp / data.count
            }));
            allAverages.sort((a, b) => b.avgNgp - a.avgNgp);

            let overallPosition = 'N/A';
            let totalRanked = allAverages.length;
            if (allAverages.length > 0) {
                let rank = 1;
                let prevAvg = allAverages[0].avgNgp;
                for (let i = 0; i < allAverages.length; i++) {
                    if (allAverages[i].avgNgp < prevAvg) {
                        rank = i + 1;
                        prevAvg = allAverages[i].avgNgp;
                    }
                    if (allAverages[i].studentId === studentId) {
                        overallPosition = rank;
                        break;
                    }
                }
            }

            html += `
            <div class="status-container mt-12">
                <div class="status-badge green" style="border-color: #f59e0b; color: #fbbf24;">
                    <strong>🌍 Overall School Rank: ${overallPosition}</strong> out of ${totalRanked} students
                </div>
            </div>`;
        } catch (err) {
            console.error('Overall ranking error:', err);
            html += '<p class="text-light">Could not calculate overall school rank.</p>';
        }

        contentDiv.innerHTML = html;

        // ---------- MUET DISPLAY (detailed) ----------
        const stuDoc = await db.collection('students').doc(studentId).get();
        let muetHTML = '';
        if (stuDoc.exists) {
            const muetData = stuDoc.data().muet;
            if (muetData) {
                const l = muetData.listening ?? '-';
                const s = muetData.speaking ?? '-';
                const r = muetData.reading ?? '-';
                const w = muetData.writing ?? '-';
                const total = muetData.total ?? '-';
                const band = muetData.band || stuDoc.data().muetBand || '';
                muetHTML = `
                    <div class="badge badge-b" style="font-size:0.95rem; line-height:1.6;">
                        <strong>MUET</strong> – ${band}<br>
                        <small>L: ${l} | S: ${s} | R: ${r} | W: ${w} | Total: ${total}/300</small>
                    </div>`;
            } else {
                const band = stuDoc.data().muetBand || null;
                if (band) muetHTML = `<div class="badge badge-b" style="font-size:0.95rem;">MUET: ${band}</div>`;
            }
        }
        document.getElementById('muetDisplay').innerHTML = muetHTML;
        // ---------- end MUET display ----------
    } catch (error) {
        console.error('Error loading results:', error);
        contentDiv.innerHTML = '<p class="text-center error-text">Error loading results.</p>';
    }
}

// ========== TEACHER CLASSES & STUDENTS ==========
async function loadTeacherClasses() {
    const contentDiv = document.getElementById('classListContent');
    contentDiv.innerHTML = '<p class="text-center text-light">Loading classes...</p>';
    try {
        const snapshot = await db.collection('classes').get();
        if (snapshot.empty) {
            contentDiv.innerHTML = '<p class="text-center text-light">No classes found. Create your first class below.</p>';
            return;
        }
        let html = '<div class="class-list-grid">';
        snapshot.forEach(doc => {
            const className = doc.id;
            const data = doc.data();
            const homeroom = data.homeroomTeacher || 'N/A';
            html += `
            <div class="class-item">
                <button class="btn btn-outline class-btn" onclick="selectClass('${className}')">
                    <span class="class-name">${className}</span>
                    <small class="homeroom">${homeroom}</small>
                </button>
                <div class="class-actions">
                    <button class="btn btn-xs btn-primary" onclick="event.stopPropagation(); showEditClassModal('${className}', '${homeroom}')">✏️ Edit</button>
                    <button class="btn btn-xs btn-danger" onclick="event.stopPropagation(); deleteClass('${className}')">🗑️ Delete</button>
                </div>
            </div>`;
        });
        html += '</div>';
        contentDiv.innerHTML = html;
    } catch (error) {
        console.error('Error loading classes:', error);
        contentDiv.innerHTML = '<p class="text-center error-text">Error loading classes.</p>';
    }
}

function selectClass(className) {
    sessionStorage.setItem('currentClass', className);
    document.getElementById('currentClassName').textContent = className;
    document.getElementById('classNameInline').textContent = className;
    loadClassStudents(className);
    navigateTo('teacher-class');
}

async function loadClassStudents(className) {
    const contentDiv = document.getElementById('classStudentsContent');
    contentDiv.innerHTML = '<p class="text-center text-light">Loading students...</p>';
    try {
        const snapshot = await db.collection('students').where('class', '==', className).get();
        if (snapshot.empty) {
            contentDiv.innerHTML = '<p class="text-center text-light">No students in this class.</p>';
            return;
        }

        const studentsArray = [];
        snapshot.forEach(doc => studentsArray.push({ id: doc.id, ...doc.data() }));
        studentsArray.sort((a, b) => a.name.localeCompare(b.name));

        let html = `
        <div class="table-wrapper">
            <table>
                <thead><tr><th>Student ID</th><th>Name</th><th>Actions</th></tr></thead>
                <tbody>`;
        studentsArray.forEach(student => {
            html += `<tr>
                <td>${student.id}</td>
                <td>${student.name}</td>
                <td>
                    <button class="btn btn-xs btn-primary" onclick="showResultModal('${student.id}', '${student.name}', '${className}')">📝 Results</button>
                    <button class="btn btn-xs btn-accent" onclick="showMuetModal('${student.id}', '${className}')">📘MUET</button>
                    <button class="btn btn-xs btn-danger" onclick="deleteStudent('${student.id}', '${className}')">🗑️ Delete</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        contentDiv.innerHTML = html;
    } catch (error) {
        console.error('Error loading students:', error);
        contentDiv.innerHTML = '<p class="text-center error-text">Error loading students.</p>';
    }
}

// ========== RESULT MANAGEMENT (TEACHER) ==========
function showResultModal(studentId, studentName, className) {
    document.getElementById('resultStudentId').value = studentId;
    document.getElementById('resultClassName').value = className;
    document.getElementById('resultModalTitle').textContent = `Add / Edit Result for ${studentName}`;

    const teacherSubject = sessionStorage.getItem('teacherSubject');
    const subjectSelect = document.getElementById('resultSubject');
    if (teacherSubject && teacherSubject !== 'None') {
        subjectSelect.value = teacherSubject;
        subjectSelect.disabled = true;
        for (let opt of subjectSelect.options) {
            if (opt.value !== teacherSubject && opt.value !== '') opt.style.display = 'none';
        }
    } else {
        subjectSelect.disabled = false;
        for (let opt of subjectSelect.options) opt.style.display = '';
    }

    loadExistingResults(studentId);
    document.getElementById('resultModalOverlay').classList.add('active');
}

function closeResultModal() {
    document.getElementById('resultModalOverlay').classList.remove('active');
    document.getElementById('resultForm').reset();
    const subjectSelect = document.getElementById('resultSubject');
    subjectSelect.disabled = false;
    for (let opt of subjectSelect.options) opt.style.display = '';
}

async function loadExistingResults(studentId) {
    const listDiv = document.getElementById('existingResultsList');
    listDiv.innerHTML = '<p class="text-light small-text">Loading...</p>';

    const teacherSubject = sessionStorage.getItem('teacherSubject');
    if (!teacherSubject || teacherSubject === 'None') {
        listDiv.innerHTML = '<p class="text-light small-text">No subject assigned to you.</p>';
        return;
    }

    try {
        const snapshot = await db.collection('results')
            .where('studentId', '==', studentId)
            .where('subject', '==', teacherSubject)
            .get();

        if (snapshot.empty) {
            listDiv.innerHTML = '<p class="text-light small-text">No results yet for your subject.</p>';
            return;
        }
        let html = '';
        snapshot.forEach(doc => {
            const r = doc.data();
            const grade = getGrade(r.marks);
            html += `
            <div class="existing-result-item">
                <strong>${r.subject}</strong> - ${r.term}: ${r.marks}/100 
                <span class="badge badge-${grade.toLowerCase().replace(/[^a-z]/g, '')}">${grade}</span>
                <button class="btn btn-xs btn-danger delete-btn" onclick="deleteResult('${doc.id}')">Delete</button>
            </div>`;
        });
        listDiv.innerHTML = html;
    } catch (error) {
        console.error('Error loading existing results:', error);
        listDiv.innerHTML = '<p class="error-text small-text">Error loading results.</p>';
    }
}

async function handleSaveResult(event) {
    event.preventDefault();
    const studentId = document.getElementById('resultStudentId').value;
    const className = document.getElementById('resultClassName').value;
    const subject = document.getElementById('resultSubject').value.trim();
    const term = document.getElementById('resultTerm').value;
    const marks = parseInt(document.getElementById('resultMarks').value);

    const teacherSubject = sessionStorage.getItem('teacherSubject');
    if (teacherSubject && teacherSubject !== 'None' && subject !== teacherSubject) {
        showToast('You can only enter results for your assigned subject.', 'error');
        return;
    }

    if (!subject || !term || isNaN(marks)) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading();
    try {
        const existingSnapshot = await db.collection('results')
            .where('studentId', '==', studentId)
            .where('subject', '==', subject)
            .where('term', '==', term)
            .limit(1)
            .get();

        if (!existingSnapshot.empty) {
            const docId = existingSnapshot.docs[0].id;
            await db.collection('results').doc(docId).update({
                marks: marks,
                updatedAt: new Date().toISOString()
            });
            showToast('Result updated successfully!', 'success');
        } else {
            await db.collection('results').add({
                studentId: studentId,
                className: className,
                subject: subject,
                term: term,
                marks: marks,
                createdAt: new Date().toISOString()
            });
            showToast('Result added successfully!', 'success');
        }
        document.getElementById('resultForm').reset();
        loadExistingResults(studentId);
    } catch (error) {
        console.error('Error saving result:', error);
        showToast('Failed to save result. A Firestore composite index may be required.', 'error');
    }
    hideLoading();
}

async function deleteResult(resultId) {
    if (!confirm('Are you sure you want to delete this result?')) return;
    showLoading();
    try {
        await db.collection('results').doc(resultId).delete();
        const studentId = document.getElementById('resultStudentId').value;
        loadExistingResults(studentId);
        showToast('Result deleted successfully!', 'success');
    } catch (error) {
        console.error('Error deleting result:', error);
        showToast('Failed to delete result.', 'error');
    }
    hideLoading();
}

async function deleteStudent(studentId, className) {
    if (!confirm(`Are you sure you want to permanently delete student "${studentId}"?`)) return;
    showLoading();
    try {
        await db.collection('students').doc(studentId).delete();
        const resultsSnap = await db.collection('results').where('studentId', '==', studentId).get();
        const batch = db.batch();
        resultsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        showToast('Student deleted successfully!', 'success');
        loadClassStudents(className);
    } catch (error) {
        console.error('Error deleting student:', error);
        showToast('Failed to delete student.', 'error');
    }
    hideLoading();
}

// ========== MUET MANAGEMENT (NEW: section marks) ==========

function showMuetModal(studentId, className) {
    document.getElementById('muetStudentId').value = studentId;
    document.getElementById('muetClassName').value = className;

    // Reset fields
    document.getElementById('muetListening').value = '';
    document.getElementById('muetSpeaking').value = '';
    document.getElementById('muetReading').value = '';
    document.getElementById('muetWriting').value = '';
    document.getElementById('muetTotalDisplay').textContent = '--';
    document.getElementById('muetBandDisplay').textContent = '--';

    // Load existing MUET data if any
    loadExistingMuet(studentId);

    document.getElementById('muetModalOverlay').classList.add('active');
}

function closeMuetModal() {
    document.getElementById('muetModalOverlay').classList.remove('active');
    document.getElementById('muetForm').reset();
}

// Load existing MUET data to populate the fields
async function loadExistingMuet(studentId) {
    try {
        const doc = await db.collection('students').doc(studentId).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.muet) {
                document.getElementById('muetListening').value = data.muet.listening ?? '';
                document.getElementById('muetSpeaking').value = data.muet.speaking ?? '';
                document.getElementById('muetReading').value = data.muet.reading ?? '';
                document.getElementById('muetWriting').value = data.muet.writing ?? '';
                calculateMuetBand(); // auto-calculate from loaded marks
            }
        }
    } catch (err) {
        console.error('Error loading MUET data:', err);
    }
}

// Calculate total and band from section marks
function calculateMuetBand() {
    const listening = parseInt(document.getElementById('muetListening').value) || 0;
    const speaking = parseInt(document.getElementById('muetSpeaking').value) || 0;
    const reading = parseInt(document.getElementById('muetReading').value) || 0;
    const writing = parseInt(document.getElementById('muetWriting').value) || 0;

    const total = listening + speaking + reading + writing;
    document.getElementById('muetTotalDisplay').textContent = total;

    let band;
    if (total >= 331 && total <= 360) band = '5+';
    else if (total >= 294 && total <= 330) band = 'Band 5.0';
    else if (total >= 258 && total <= 293) band = 'Band 4.5';
    else if (total >= 211 && total <= 257) band = 'Band 4.0';
    else if (total >= 164 && total <= 210) band = 'Band 3.5';
    else if (total >= 123 && total <= 163) band = 'Band 3.0';
    else if (total >= 82 && total <= 122) band = 'Band 2.5';
    else if (total >= 26 && total <= 81) band = 'Band 2.0';
    else if (total >= 1 && total <= 25) band = 'Band 1.0';
    else band = 'Invalid Marks';

    document.getElementById('muetBandDisplay').textContent = band;
    return { total, band };
}

// Save the MUET record to Firestore
async function handleSaveMuet(event) {
    event.preventDefault();
    const studentId = document.getElementById('muetStudentId').value;
    const listening = parseInt(document.getElementById('muetListening').value);
    const speaking = parseInt(document.getElementById('muetSpeaking').value);
    const reading = parseInt(document.getElementById('muetReading').value);
    const writing = parseInt(document.getElementById('muetWriting').value);

    if (isNaN(listening) || isNaN(speaking) || isNaN(reading) || isNaN(writing)) {
        showToast('Please enter all marks', 'error');
        return;
    }

    const { total, band } = calculateMuetBand();
    if (band === 'Invalid Marks') {
        showToast('Total marks out of range (40–300)', 'error');
        return;
    }

    showLoading();
    try {
        // Save as a map (muet object) + also keep a simple band string for quick display
        await db.collection('students').doc(studentId).update({
            muetBand: band,               // for old compatibility
            muet: {
                listening: listening,
                speaking: speaking,
                reading: reading,
                writing: writing,
                total: total,
                band: band
            }
        });
        showToast('MUET result saved!', 'success');
        closeMuetModal();
    } catch (error) {
        console.error('Error saving MUET:', error);
        showToast('Failed to save MUET result.', 'error');
    }
    hideLoading();
}

// ========== PER‑CLASS ANALYSIS (grade distribution per subject) ==========
function openAnalysisModal() {
    const className = sessionStorage.getItem('currentClass');
    if (!className) {
        showToast('No class selected', 'error');
        return;
    }
    document.getElementById('analysisModalTitle').textContent = `📊 Analysis for ${className}`;
    document.getElementById('analysisModalOverlay').classList.add('active');
    runAnalysis();
}

function closeAnalysisModal() {
    document.getElementById('analysisModalOverlay').classList.remove('active');
}

async function runAnalysis() {
    const className = sessionStorage.getItem('currentClass');
    const selectedTerm = document.getElementById('analysisTermFilter').value;
    const contentDiv = document.getElementById('analysisContent');

    const role = sessionStorage.getItem('teacherRole');
    const teacherSubject = sessionStorage.getItem('teacherSubject');

    contentDiv.innerHTML = '<p class="text-center text-light">Loading analysis...</p>';

    if (role === 'Regular Teacher' && (!teacherSubject || teacherSubject === 'None')) {
        contentDiv.innerHTML = '<p class="text-center text-light">No subject assigned to you. Contact admin.</p>';
        return;
    }

    try {
        const studentsSnap = await db.collection('students').where('class', '==', className).get();
        if (studentsSnap.empty) {
            contentDiv.innerHTML = '<p class="text-center text-light">No students in this class.</p>';
            return;
        }

        let resultsQuery = db.collection('results').where('className', '==', className);
        if (role === 'Regular Teacher' && teacherSubject && teacherSubject !== 'None') {
            resultsQuery = resultsQuery.where('subject', '==', teacherSubject);
        }

        const resultsSnap = await resultsQuery.get();
        const allResults = [];
        resultsSnap.forEach(doc => allResults.push({ id: doc.id, ...doc.data() }));

        const filteredResults = selectedTerm
            ? allResults.filter(r => r.term === selectedTerm)
            : allResults;

        if (filteredResults.length === 0) {
            contentDiv.innerHTML = `<p class="text-center text-light">No results found for ${selectedTerm || 'any term'}.</p>`;
            return;
        }

        // Group by subject
        const subjectData = {};
        filteredResults.forEach(r => {
            if (!subjectData[r.subject]) subjectData[r.subject] = [];
            subjectData[r.subject].push(r.marks);
        });

        let html = `<h4 class="mb-12">Class: ${className} ${selectedTerm ? 'Term: '+selectedTerm : 'All Terms'}</h4>`;

        for (const [subject, marksArray] of Object.entries(subjectData)) {
            const total = marksArray.length;
            const gradeCounts = { 'A':0, 'A-':0, 'B+':0, 'B':0, 'B-':0, 'C+':0, 'C':0, 'C-':0, 'D+':0, 'D':0, 'F':0 };
            let ngpSum = 0;

            marksArray.forEach(m => {
                const g = getGrade(m);
                if (gradeCounts[g] !== undefined) gradeCounts[g]++;
                ngpSum += getNGP(m);
            });

            const gpmp = total ? (ngpSum / total).toFixed(2) : '0.00';
            const passCount = (gradeCounts['A'] + gradeCounts['A-'] + gradeCounts['B+'] + gradeCounts['B'] +
                               gradeCounts['B-'] + gradeCounts['C+'] + gradeCounts['C']);
            const failCount = (gradeCounts['C-'] + gradeCounts['D+'] + gradeCounts['D'] + gradeCounts['F']);
            const passPercent = total ? ((passCount / total) * 100).toFixed(1) : '0.0';
            const failPercent = total ? ((failCount / total) * 100).toFixed(1) : '0.0';

            html += `
            <div class="table-wrapper" style="margin-bottom:24px;">
                <h5>${subject}</h5>
                <table>
                    <thead>
                        <tr><th>Total</th><th>Pass (A-C)</th><th>% Pass</th><th>Fail (C--F)</th><th>% Fail</th><th>GPMP</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${total}</td>
                            <td>${passCount}</td>
                            <td>${passPercent}%</td>
                            <td>${failCount}</td>
                            <td>${failPercent}%</td>
                            <td>${gpmp}</td>
                        </tr>
                    </tbody>
                </table>
                <table style="margin-top:8px;">
                    <thead>
                        <tr><th>A</th><th>A-</th><th>B+</th><th>B</th><th>B-</th><th>C+</th><th>C</th><th>C-</th><th>D+</th><th>D</th><th>F</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${gradeCounts['A']}</td>
                            <td>${gradeCounts['A-']}</td>
                            <td>${gradeCounts['B+']}</td>
                            <td>${gradeCounts['B']}</td>
                            <td>${gradeCounts['B-']}</td>
                            <td>${gradeCounts['C+']}</td>
                            <td>${gradeCounts['C']}</td>
                            <td>${gradeCounts['C-']}</td>
                            <td>${gradeCounts['D+']}</td>
                            <td>${gradeCounts['D']}</td>
                            <td>${gradeCounts['F']}</td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        }

        contentDiv.innerHTML = html;
    } catch (error) {
        console.error('Analysis error:', error);
        contentDiv.innerHTML = '<p class="error-text">Error loading analysis. Check console.</p>';
    }
}

// ========== GLOBAL ANALYSIS (grade distribution per subject) ==========
async function openGlobalAnalysisModal() {
    const role = sessionStorage.getItem('teacherRole');
    const homeroomClass = sessionStorage.getItem('homeroomClass');

    const classSelect = document.getElementById('globalAnalysisClass');
    const snapshot = await db.collection('classes').get();
    classSelect.innerHTML = '<option value="__all__">All Classes</option>';
    snapshot.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.id;
        classSelect.appendChild(option);
    });

    if (role === 'Homeroom Teacher' && homeroomClass) {
        classSelect.value = homeroomClass;
    } else {
        classSelect.value = '__all__';
    }

    document.getElementById('globalAnalysisTerm').value = '';
    document.getElementById('globalAnalysisModalOverlay').classList.add('active');
    runGlobalAnalysis();
}

function closeGlobalAnalysisModal() {
    document.getElementById('globalAnalysisModalOverlay').classList.remove('active');
}

async function runGlobalAnalysis() {
    const classSelect = document.getElementById('globalAnalysisClass');
    const selectedClass = classSelect.value;
    const selectedTerm = document.getElementById('globalAnalysisTerm').value;
    const contentDiv = document.getElementById('globalAnalysisContent');

    const role = sessionStorage.getItem('teacherRole');
    const teacherSubject = sessionStorage.getItem('teacherSubject');

    contentDiv.innerHTML = '<p class="text-center text-light">Loading analysis...</p>';

    if (role === 'Regular Teacher' && (!teacherSubject || teacherSubject === 'None')) {
        contentDiv.innerHTML = '<p class="text-center text-light">No subject assigned to you. Contact admin.</p>';
        return;
    }

    try {
        let resultsQuery = db.collection('results');
        if (role === 'Regular Teacher' && teacherSubject && teacherSubject !== 'None') {
            resultsQuery = resultsQuery.where('subject', '==', teacherSubject);
        }
        if (selectedClass !== '__all__') {
            resultsQuery = resultsQuery.where('className', '==', selectedClass);
        }

        const resultsSnap = await resultsQuery.get();
        const allResults = [];
        resultsSnap.forEach(doc => allResults.push({ id: doc.id, ...doc.data() }));

        const filteredResults = selectedTerm
            ? allResults.filter(r => r.term === selectedTerm)
            : allResults;

        if (filteredResults.length === 0) {
            contentDiv.innerHTML = `<p class="text-center text-light">No results found for the selected filters.</p>`;
            return;
        }

        // Group by subject
        const subjectData = {};
        filteredResults.forEach(r => {
            if (!subjectData[r.subject]) subjectData[r.subject] = [];
            subjectData[r.subject].push(r.marks);
        });

        let heading = '📊 Analysis Summary';
        if (selectedClass !== '__all__') heading += ` – Class: ${selectedClass}`;
        else heading += ' – All Classes';
        if (selectedTerm) heading += ` – Term: ${selectedTerm}`;

        let html = `<h4 class="mb-12">${heading}</h4>`;

        for (const [subject, marksArray] of Object.entries(subjectData)) {
            const total = marksArray.length;
            const gradeCounts = { 'A':0, 'A-':0, 'B+':0, 'B':0, 'B-':0, 'C+':0, 'C':0, 'C-':0, 'D+':0, 'D':0, 'F':0 };
            let ngpSum = 0;

            marksArray.forEach(m => {
                const g = getGrade(m);
                if (gradeCounts[g] !== undefined) gradeCounts[g]++;
                ngpSum += getNGP(m);
            });

            const gpmp = total ? (ngpSum / total).toFixed(2) : '0.00';
            const passCount = (gradeCounts['A'] + gradeCounts['A-'] + gradeCounts['B+'] + gradeCounts['B'] +
                               gradeCounts['B-'] + gradeCounts['C+'] + gradeCounts['C']);
            const failCount = (gradeCounts['C-'] + gradeCounts['D+'] + gradeCounts['D'] + gradeCounts['F']);
            const passPercent = total ? ((passCount / total) * 100).toFixed(1) : '0.0';
            const failPercent = total ? ((failCount / total) * 100).toFixed(1) : '0.0';

            html += `
            <div class="table-wrapper" style="margin-bottom:24px;">
                <h5>${subject}</h5>
                <table>
                    <thead>
                        <tr><th>Total</th><th>Pass (A-C)</th><th>% Pass</th><th>Fail (C--F)</th><th>% Fail</th><th>GPMP</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${total}</td>
                            <td>${passCount}</td>
                            <td>${passPercent}%</td>
                            <td>${failCount}</td>
                            <td>${failPercent}%</td>
                            <td>${gpmp}</td>
                        </tr>
                    </tbody>
                </table>
                <table style="margin-top:8px;">
                    <thead>
                        <tr><th>A</th><th>A-</th><th>B+</th><th>B</th><th>B-</th><th>C+</th><th>C</th><th>C-</th><th>D+</th><th>D</th><th>F</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${gradeCounts['A']}</td>
                            <td>${gradeCounts['A-']}</td>
                            <td>${gradeCounts['B+']}</td>
                            <td>${gradeCounts['B']}</td>
                            <td>${gradeCounts['B-']}</td>
                            <td>${gradeCounts['C+']}</td>
                            <td>${gradeCounts['C']}</td>
                            <td>${gradeCounts['C-']}</td>
                            <td>${gradeCounts['D+']}</td>
                            <td>${gradeCounts['D']}</td>
                            <td>${gradeCounts['F']}</td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        }

        contentDiv.innerHTML = html;
    } catch (error) {
        console.error('Global analysis error:', error);
        contentDiv.innerHTML = '<p class="error-text">Error loading analysis.</p>';
    }
}

// ========== CLASS MANAGEMENT ==========
function showAddClassModal() {
    document.getElementById('classEditMode').value = 'false';
    document.getElementById('originalClassName').value = '';
    document.getElementById('newClassName').value = '';
    document.getElementById('homeroomTeacherInput').value = '';
    document.getElementById('addClassModalTitle').textContent = 'Add New Class';
    document.getElementById('saveClassBtn').textContent = '➕ Create Class';
    document.getElementById('newClassName').readOnly = false;
    document.getElementById('addClassModalOverlay').classList.add('active');
}

function showEditClassModal(className, homeroom) {
    document.getElementById('classEditMode').value = 'true';
    document.getElementById('originalClassName').value = className;
    document.getElementById('newClassName').value = className;
    document.getElementById('homeroomTeacherInput').value = homeroom;
    document.getElementById('addClassModalTitle').textContent = 'Edit Class';
    document.getElementById('saveClassBtn').textContent = '💾 Update Class';
    document.getElementById('newClassName').readOnly = false;
    document.getElementById('addClassModalOverlay').classList.add('active');
}

function closeAddClassModal() {
    document.getElementById('addClassModalOverlay').classList.remove('active');
    document.getElementById('addClassForm').reset();
    document.getElementById('newClassName').readOnly = false;
}

async function handleSaveClass(event) {
    event.preventDefault();
    const editMode = document.getElementById('classEditMode').value === 'true';
    const originalClassName = document.getElementById('originalClassName').value.trim();
    const className = document.getElementById('newClassName').value.trim();
    const homeroomTeacher = document.getElementById('homeroomTeacherInput').value.trim();

    if (!className || !homeroomTeacher) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading();
    try {
        if (editMode) {
            const isNameChanged = className !== originalClassName;
            
            if (isNameChanged) {
                // Check if new class name already exists
                const existingDoc = await db.collection('classes').doc(className).get();
                if (existingDoc.exists) {
                    showToast('A class with that name already exists', 'error');
                    hideLoading();
                    return;
                }
                
                // Create new class with updated name
                await db.collection('classes').doc(className).set({
                    name: className,
                    homeroomTeacher: homeroomTeacher,
                    createdAt: new Date().toISOString()
                });
                
                // Delete old class
                await db.collection('classes').doc(originalClassName).delete();
                showToast('Class updated and renamed successfully!', 'success');
            } else {
                // Only homeroom teacher changed
                await db.collection('classes').doc(originalClassName).update({
                    homeroomTeacher: homeroomTeacher
                });
                showToast('Class updated successfully!', 'success');
            }
        } else {
            const existingDoc = await db.collection('classes').doc(className).get();
            if (existingDoc.exists) {
                showToast('Class already exists', 'error');
                hideLoading();
                return;
            }
            await db.collection('classes').doc(className).set({
                name: className,
                homeroomTeacher: homeroomTeacher,
                createdAt: new Date().toISOString()
            });
            showToast('Class created successfully!', 'success');
        }
        closeAddClassModal();
        loadTeacherClasses();
    } catch (error) {
        console.error('Error saving class:', error);
        showToast('Failed to save class.', 'error');
    }
    hideLoading();
}

async function deleteClass(className) {
    if (!confirm(`Are you sure you want to delete the class "${className}"?`)) return;
    showLoading();
    try {
        await db.collection('classes').doc(className).delete();
        showToast('Class deleted successfully!', 'success');
        loadTeacherClasses();
    } catch (error) {
        console.error('Error deleting class:', error);
        showToast('Failed to delete class.', 'error');
    }
    hideLoading();
}

// ========== PROFILE MANAGEMENT ==========
async function openProfile() {
    const userType = sessionStorage.getItem('userType');
    const userId = sessionStorage.getItem('userId');

    if (!userType || !userId) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    document.getElementById('profileUserType').value = userType;
    document.getElementById('profileUserId').value = userId;

    const studentFields = document.getElementById('profileStudentFields');
    const teacherFields = document.getElementById('profileTeacherFields');

    // Reset required attributes to avoid hidden-field validation errors
    document.getElementById('profileClass').removeAttribute('required');
    document.getElementById('profileRole').removeAttribute('required');
    document.getElementById('profileSubject').removeAttribute('required');
    document.getElementById('profileHomeroomClass').removeAttribute('required');

    if (userType === 'student') {
        studentFields.style.display = 'block';
        teacherFields.style.display = 'none';
        // Only student class is required
        document.getElementById('profileClass').setAttribute('required', '');
    } else {
        studentFields.style.display = 'none';
        teacherFields.style.display = 'block';
        // Teacher role and subject are required; homeroom handled separately
        document.getElementById('profileRole').setAttribute('required', '');
        document.getElementById('profileSubject').setAttribute('required', '');
    }

    showLoading();
    try {
        const collectionName = userType === 'student' ? 'students' : 'teachers';
        const docSnap = await db.collection(collectionName).doc(userId).get();
        if (!docSnap.exists) {
            showToast('User data not found.', 'error');
            hideLoading();
            return;
        }
        const data = docSnap.data();

        document.getElementById('profileName').value = data.name || '';
        document.getElementById('profileNewPassword').value = '';

        if (userType === 'student') {
            const classSelect = document.getElementById('profileClass');
            await populateClassDropdown(classSelect, data.class);
        } else {
            document.getElementById('profileRole').value = data.role || '';
            document.getElementById('profileSubject').value = data.subject || '';

            const classSelect = document.getElementById('profileHomeroomClass');
            await populateClassDropdown(classSelect, data.homeroomClass || '');
            toggleProfileHomeroomClass();   // This will also set required for homeroom if needed
        }

        navigateTo('profile');
    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Failed to load profile.', 'error');
    }
    hideLoading();
}

function toggleProfileHomeroomClass() {
    const role = document.getElementById('profileRole').value;
    const classGroup = document.getElementById('profileHomeroomClassGroup');
    const classSelect = document.getElementById('profileHomeroomClass');
    if (role === 'Homeroom Teacher') {
        classGroup.style.display = 'block';
        classSelect.required = true;
    } else {
        classGroup.style.display = 'none';
        classSelect.required = false;
        classSelect.value = '';
    }
}

function goBackFromProfile() {
    const userType = sessionStorage.getItem('userType');
    if (userType === 'student') {
        navigateTo('student-results');
    } else {
        navigateTo('teacher-dashboard');
    }
}

async function handleProfileSave(event) {
    event.preventDefault();

    const userType = document.getElementById('profileUserType').value;
    const userId = document.getElementById('profileUserId').value;
    const name = document.getElementById('profileName').value.trim();
    const newPassword = document.getElementById('profileNewPassword').value;

    console.log('handleProfileSave called', { userType, userId, name, newPassword });

    if (!name) {
        showToast('Name is required.', 'error');
        return;
    }

    const updateData = { name: name };
    if (newPassword) updateData.password = newPassword;

    if (userType === 'student') {
        const className = document.getElementById('profileClass').value;
        if (!className) {
            showToast('Please select a class.', 'error');
            return;
        }
        updateData.class = className;
    } else {
        const role = document.getElementById('profileRole').value;
        const subject = document.getElementById('profileSubject').value;
        if (!role || !subject) {
            showToast('Please fill in all teacher fields.', 'error');
            return;
        }
        updateData.role = role;
        updateData.subject = subject;

        let homeroomClass = '';
        if (role === 'Homeroom Teacher') {
            homeroomClass = document.getElementById('profileHomeroomClass').value;
            if (!homeroomClass) {
                showToast('Homeroom teacher must select an assigned class.', 'error');
                return;
            }
        }
        updateData.homeroomClass = homeroomClass ? homeroomClass : '';
    }

    showLoading();
    try {
        console.log('Profile update payload', { collection: userType === 'student' ? 'students' : 'teachers', userId, updateData });
        const collectionName = userType === 'student' ? 'students' : 'teachers';
        await db.collection(collectionName).doc(userId).update(updateData);

        sessionStorage.setItem('userName', name);
        if (userType === 'student') {
            sessionStorage.setItem('userClass', updateData.class);
            document.getElementById('studentNameDisplay').textContent = name;
            document.getElementById('studentIdDisplay').textContent = `ID: ${userId} | Class: ${updateData.class}`;
        } else {
            sessionStorage.setItem('teacherSubject', updateData.subject);
            sessionStorage.setItem('teacherRole', updateData.role);
            if (updateData.homeroomClass) {
                sessionStorage.setItem('homeroomClass', updateData.homeroomClass);
            } else {
                sessionStorage.removeItem('homeroomClass');
            }
            document.getElementById('teacherNameDisplay').textContent = name;
        }

        showToast('Profile updated successfully!', 'success');
        goBackFromProfile();
    } catch (error) {
        console.error('Profile update error:', error);
        showToast(`Failed to update profile. ${error.message || ''}`, 'error');
    }
    hideLoading();
}

async function populateClassDropdown(selectElement, selectedValue) {
    try {
        const snapshot = await db.collection('classes').get();
        selectElement.innerHTML = '<option value="">-- Select Class --</option>';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.id;
            selectElement.appendChild(option);
        });
        if (selectedValue) selectElement.value = selectedValue;
    } catch (error) {
        console.error('Error populating class dropdown:', error);
    }
}

// ========== REGISTRATION HELPERS ==========
async function loadClassesForRegistration() {
    const select = document.getElementById('regStudentClass');
    try {
        const snapshot = await db.collection('classes').get();
        select.innerHTML = '<option value="">-- Select Class --</option>';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.id;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading classes for registration:', error);
    }
}

function toggleHomeroomClass() {
    const role = document.getElementById('regTeacherRole').value;
    const classGroup = document.getElementById('homeroomClassGroup');
    const classSelect = document.getElementById('regTeacherHomeroomClass');

    if (role === 'Homeroom Teacher') {
        classGroup.style.display = 'block';
        classSelect.required = true;
        if (classSelect.options.length <= 1) loadHomeroomClassOptions();
    } else {
        classGroup.style.display = 'none';
        classSelect.required = false;
        classSelect.value = '';
    }
}

async function loadHomeroomClassOptions() {
    const select = document.getElementById('regTeacherHomeroomClass');
    try {
        const snapshot = await db.collection('classes').get();
        select.innerHTML = '<option value="">-- Select Class --</option>';
        snapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.id;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading homeroom classes:', error);
    }
}

// ========== NEW VERIFICATION FLOW ==========

function registrationRequest(userType) {
    return async function(e) {
        e.preventDefault();
        let idNumber, name, extraData = {};
        if (userType === 'student') {
            idNumber = document.getElementById('regStudentId').value.trim();
            name = document.getElementById('regStudentName').value.trim();
            extraData.class = document.getElementById('regStudentClass').value;
            if (!idNumber || !name || !extraData.class) {
                showToast('Please fill all fields', 'error');
                return;
            }
        } else {
            idNumber = document.getElementById('regTeacherStaff').value.trim();
            name = document.getElementById('regTeacherName').value.trim();
            extraData.role = document.getElementById('regTeacherRole').value;
            extraData.subject = document.getElementById('regTeacherSubject').value;
            extraData.homeroomClass = document.getElementById('regTeacherHomeroomClass').value || '';
            if (!idNumber || !name || !extraData.role || !extraData.subject) {
                showToast('Please fill all fields', 'error');
                return;
            }
        }

        const collection = userType === 'student' ? 'students' : 'teachers';
        const existing = await db.collection(collection).doc(idNumber).get();
        if (existing.exists) {
            showToast('An account with this ID already exists.', 'error');
            return;
        }

        const code = Math.floor(10000 + Math.random() * 90000).toString();
        const expiresAt = firebase.firestore.Timestamp.fromMillis(Date.now() + 3 * 60 * 1000);

        showLoading();
        try {
            await db.collection('registrationCodes').doc(idNumber).set({
                code, expiresAt, userType, name, extraData, attempts: 0
            });
            hideLoading();
            pendingRegistration = { userType, idNumber, name, extraData };
            navigateTo('verify-registration');
            startVerificationTimer(180);
            showToast('Code generated. Ask the exam secretary for the 5‑digit code.', 'info');
        } catch (err) {
            hideLoading();
            showToast('Failed: ' + err.message, 'error');
        }
    };
}

function startVerificationTimer(seconds) {
    const display = document.getElementById('verificationTimer');
    let remaining = seconds;
    updateTimerDisplay(remaining);
    clearInterval(verificationTimerInterval);
    verificationTimerInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(verificationTimerInterval);
            display.textContent = '00:00';
            failVerification('Time expired. Registration cancelled.');
        } else {
            updateTimerDisplay(remaining);
        }
    }, 1000);
}

function updateTimerDisplay(secs) {
    const mins = Math.floor(secs / 60).toString().padStart(2, '0');
    const sec = (secs % 60).toString().padStart(2, '0');
    document.getElementById('verificationTimer').textContent = `${mins}:${sec}`;
}

function failVerification(msg) {
    clearInterval(verificationTimerInterval);
    document.getElementById('verifyCodeBtn').disabled = true;
    document.getElementById('verificationError').textContent = msg;
    if (pendingRegistration) {
        db.collection('registrationCodes').doc(pendingRegistration.idNumber).delete().catch(() => {});
    }
    pendingRegistration = null;
    setTimeout(() => {
        navigateTo('main');
        showToast(msg, 'error');
    }, 2000);
}

function cancelVerification() {
    clearInterval(verificationTimerInterval);
    if (pendingRegistration) {
        db.collection('registrationCodes').doc(pendingRegistration.idNumber).delete().catch(() => {});
    }
    pendingRegistration = null;
    navigateTo('main');
}

document.getElementById('verifyCodeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById('verificationCodeInput').value.trim();
    if (!/^\d{5}$/.test(codeInput)) {
        document.getElementById('verificationError').textContent = 'Please enter a 5‑digit code.';
        return;
    }
    if (!pendingRegistration) return;

    showLoading();
    try {
        const docRef = db.collection('registrationCodes').doc(pendingRegistration.idNumber);
        const doc = await docRef.get();
        if (!doc.exists) throw new Error('No registration request found.');
        const data = doc.data();

        const expiresAt = data.expiresAt;
        if (!expiresAt) {
            await docRef.delete();
            throw new Error('Invalid request. Please start again.');
        }
        if (expiresAt.toDate() < new Date()) {
            await docRef.delete();
            throw new Error('Code expired.');
        }

        if (data.attempts >= 5) throw new Error('Too many failed attempts.');
        if (data.code !== codeInput) {
            await docRef.update({ attempts: firebase.firestore.FieldValue.increment(1) });
            throw new Error('Incorrect code.');
        }
        await docRef.delete();
        hideLoading();
        clearInterval(verificationTimerInterval);
        navigateTo('set-password');
    } catch (err) {
        hideLoading();
        document.getElementById('verificationError').textContent = err.message;
    }
});

document.getElementById('setPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('newPassword1').value;
    const p2 = document.getElementById('newPassword2').value;
    if (p1 !== p2) { showToast('Passwords do not match', 'error'); return; }
    if (p1.length < 6) { showToast('Minimum 6 characters', 'error'); return; }
    if (!pendingRegistration) return;

    showLoading();
    try {
        const { userType, idNumber, name, extraData } = pendingRegistration;
        if (userType === 'student') {
            await db.collection('students').doc(idNumber).set({
                name, class: extraData.class,
                password: p1,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const classRef = db.collection('classes').doc(extraData.class);
            await classRef.set({ students: firebase.firestore.FieldValue.arrayUnion(idNumber) }, { merge: true });
        } else {
            await db.collection('teachers').doc(idNumber).set({
                name, role: extraData.role, subject: extraData.subject,
                homeroomClass: extraData.homeroomClass || '',
                password: p1,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        pendingRegistration = null;
        hideLoading();
        showToast('Account created! You can now login.', 'success');
        navigateTo('main');
    } catch (err) {
        hideLoading();
        showToast('Error: ' + err.message, 'error');
    }
});

function cancelSetPassword() {
    pendingRegistration = null;
    navigateTo('main');
}

// ========== ADMIN VERIFICATION PANEL ==========
async function loadAdminCodes() {
    const container = document.getElementById('adminCodesList');
    container.innerHTML = '<p class="text-center text-light">Loading...</p>';
    try {
        const snap = await db.collection('registrationCodes').get();
        if (snap.empty) {
            container.innerHTML = '<p class="text-center text-light">No pending requests.</p>';
            return;
        }
        let html = '';
        const now = new Date();
        snap.forEach(doc => {
            const data = doc.data();
            const userType = data.userType || '?';
            const extra = data.extraData || {};
            const expiresAt = data.expiresAt;
            let expired = true;
            let codeDisplay = 'EXPIRED';
            if (expiresAt && expiresAt.toDate) {
                expired = expiresAt.toDate() < now;
                codeDisplay = expired ? 'EXPIRED' : data.code;
            }

            html += `
                <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <div style="flex:1; min-width:200px;">
                        <strong>${data.name || 'Unknown'}</strong> (${doc.id}) – ${userType.toUpperCase()}
                        <br><small>${userType === 'student' ? 'Class: '+ (extra.class || '?') : 'Role: '+ (extra.role || '?') +' | Subject: '+ (extra.subject || '?')}</small>
                        <br><span style="font-size:1.3rem; font-weight:bold; color:${expired ? '#e24a4a' : '#4acd8d'};">${codeDisplay}</span>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="deleteCode('${doc.id}')">🗑️</button>
                </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-danger">Error: ${err.message}</p>`;
    }
}

async function deleteCode(id) {
    if (confirm('Delete this request?')) {
        await db.collection('registrationCodes').doc(id).delete();
        loadAdminCodes();
    }
}

// ========== PRINTABLE STUDENT RANKING REPORT (DUAL MODE) ==========

function printStudentRankingFromClass() {
    const className = sessionStorage.getItem('currentClass');
    const term = document.getElementById('analysisTermFilter').value;
    printStudentRanking(className, term);
}

function printStudentRankingFromGlobal() {
    const classFilter = document.getElementById('globalAnalysisClass').value;
    const term = document.getElementById('globalAnalysisTerm').value;
    // '__all__' means no class filter → ranking report for all classes
    printStudentRanking(classFilter === '__all__' ? null : classFilter, term);
}

async function printStudentRanking(className, term) {
    const role = sessionStorage.getItem('teacherRole');
    const teacherSubject = sessionStorage.getItem('teacherSubject');

    showLoading();

    try {
        // ---------- MODE 1: SPECIFIC CLASS → GRADE TABLE ----------
        if (className) {
            // Get all students of the chosen class
            const studentsSnap = await db.collection('students').where('class', '==', className).get();
            if (studentsSnap.empty) {
                showToast('No students in this class.', 'error');
                hideLoading();
                return;
            }
            const studentsMap = {};
            studentsSnap.forEach(doc => {
                studentsMap[doc.id] = { id: doc.id, name: doc.data().name, class: doc.data().class };
            });

            // Query results for this class (and possibly subject)
            let resultsQuery = db.collection('results').where('className', '==', className);
            if (role === 'Regular Teacher' && teacherSubject && teacherSubject !== 'None') {
                resultsQuery = resultsQuery.where('subject', '==', teacherSubject);
            }
            const resultsSnap = await resultsQuery.get();
            const allResults = [];
            resultsSnap.forEach(doc => allResults.push(doc.data()));

            // Filter by term if selected
            const filtered = term ? allResults.filter(r => r.term === term) : allResults;
            if (filtered.length === 0) {
                showToast(`No results found for ${term || 'any term'}.`, 'error');
                hideLoading();
                return;
            }

            // Build per‑student data: marks per subject and overall NGP
            const studentData = {};
            filtered.forEach(r => {
                if (!studentsMap[r.studentId]) return;
                if (!studentData[r.studentId]) {
                    studentData[r.studentId] = {
                        name: studentsMap[r.studentId].name,
                        id: r.studentId,
                        class: studentsMap[r.studentId].class,
                        subjects: {},
                        ngpTotal: 0,
                        ngpCount: 0
                    };
                }
                const stu = studentData[r.studentId];
                // Store the highest mark if duplicates exist (shouldn't)
                if (!stu.subjects[r.subject] || r.marks > stu.subjects[r.subject]) {
                    stu.subjects[r.subject] = r.marks;
                }
                stu.ngpTotal += getNGP(r.marks);
                stu.ngpCount++;
            });

            // Determine all subjects (alphabetically)
            const allSubjects = new Set();
            Object.values(studentData).forEach(s => Object.keys(s.subjects).forEach(sub => allSubjects.add(sub)));
            const subjectsSorted = Array.from(allSubjects).sort();

            // Build student list sorted by name
            const studentList = Object.values(studentData);
            studentList.sort((a, b) => a.name.localeCompare(b.name));

            // Generate HTML for grade table
            let html = `<h3>Class: ${className} | ${term ? 'Term: ' + term : 'All Terms'}</h3>`;
            html += `<table>
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Student Name</th>
                        <th>IC No.</th>
                        <th>Class</th>`;
            subjectsSorted.forEach(sub => html += `<th>${sub}</th>`);
            html += `<th>GP</th></tr></thead><tbody>`;

            let counter = 1;
            studentList.forEach(s => {
                const avgNgp = s.ngpCount > 0 ? (s.ngpTotal / s.ngpCount).toFixed(2) : '0.00';
                html += `<tr>
                    <td>${counter++}</td>
                    <td>${s.name}</td>
                    <td>${s.id}</td>
                    <td>${s.class}</td>`;
                subjectsSorted.forEach(sub => {
                    const mark = s.subjects[sub];
                    const grade = mark !== undefined ? getGrade(mark) : '--';
                    html += `<td>${grade}</td>`;
                });
                html += `<td><strong>${avgNgp}</strong></td></tr>`;
            });
            html += '</tbody></table>';

            // Open print window
            const printWindow = window.open('', '_blank', 'width=1000,height=700');
            if (!printWindow) {
                showToast('Popup blocked. Please allow popups.', 'error');
                hideLoading();
                return;
            }

            const logoImg = document.getElementById('appLogoImage');
            const logoSrc = logoImg ? logoImg.src : '';
            const printCSS = `
                <style>
                    body { font-family: 'Segoe UI', sans-serif; margin: 20px; color: #000; background: #fff; }
                    .print-header { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .print-logo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-right: 20px; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 0.85rem; }
                    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
                    th { background: #f0f0f0; }
                    h3 { margin-top: 10px; }
                </style>
            `;
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head><title>Student Grade Report</title>${printCSS}</head>
                <body>
                    <div class="print-header">
                        ${logoSrc ? `<img class="print-logo" src="${logoSrc}" />` : ''}
                        <h1>Pusat Tingkatan Enam SMK Badin</h1>
                    </div>
                    <h2>Student Grade Report</h2>
                    ${html}
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 800);
            hideLoading();
            return;
        }

        // ---------- MODE 2: ALL CLASSES → RANKING REPORT ----------
        let studentsQuery = db.collection('students');
        const studentsSnap = await studentsQuery.get();
        if (studentsSnap.empty) {
            showToast('No students found.', 'error');
            hideLoading();
            return;
        }
        const studentsMap = {};
        studentsSnap.forEach(doc => {
            studentsMap[doc.id] = { id: doc.id, name: doc.data().name, class: doc.data().class };
        });

        // Build results query – if a regular teacher, restrict to their subject
        let resultsQuery = db.collection('results');
        if (role === 'Regular Teacher' && teacherSubject && teacherSubject !== 'None') {
            resultsQuery = resultsQuery.where('subject', '==', teacherSubject);
        }
        const resultsSnap = await resultsQuery.get();
        const allResults = [];
        resultsSnap.forEach(doc => allResults.push({ id: doc.id, ...doc.data() }));

        const filtered = term ? allResults.filter(r => r.term === term) : allResults;

        // Overall school ranking (all students, all results)
        const allStudentsSnap = await db.collection('students').get();
        const allStudentsMap = {};
        allStudentsSnap.forEach(doc => {
            allStudentsMap[doc.id] = { id: doc.id, class: doc.data().class };
        });
        const allResSnap = await db.collection('results').get();
        const allRes = [];
        allResSnap.forEach(doc => allRes.push(doc.data()));
        const allFiltered = term ? allRes.filter(r => r.term === term) : allRes;

        const overallStudentNgpMap = {};
        allFiltered.forEach(r => {
            if (!allStudentsMap[r.studentId]) return;
            if (!overallStudentNgpMap[r.studentId]) {
                overallStudentNgpMap[r.studentId] = { totalNgp: 0, count: 0 };
            }
            overallStudentNgpMap[r.studentId].totalNgp += getNGP(r.marks);
            overallStudentNgpMap[r.studentId].count += 1;
        });

        // Per‑student data from the filtered results for the report
        const studentDataMap = {};
        filtered.forEach(r => {
            if (!studentsMap[r.studentId]) return;
            if (!studentDataMap[r.studentId]) {
                studentDataMap[r.studentId] = {
                    name: studentsMap[r.studentId].name,
                    id: r.studentId,
                    class: studentsMap[r.studentId].class,
                    overallNgpTotal: 0,
                    overallCount: 0,
                    subjects: {}
                };
            }
            const stu = studentDataMap[r.studentId];
            stu.overallNgpTotal += getNGP(r.marks);
            stu.overallCount += 1;
            if (!stu.subjects[r.subject]) {
                stu.subjects[r.subject] = { totalNgp: 0, count: 0 };
            }
            stu.subjects[r.subject].totalNgp += getNGP(r.marks);
            stu.subjects[r.subject].count += 1;
        });

        const studentList = [];
        for (const [sid, data] of Object.entries(studentDataMap)) {
            const avgNgp = data.overallCount > 0 ? data.overallNgpTotal / data.overallCount : 0;
            const subjectAverages = {};
            for (const [subj, val] of Object.entries(data.subjects)) {
                subjectAverages[subj] = val.count > 0 ? (val.totalNgp / val.count).toFixed(2) : '0.00';
            }
            studentList.push({
                id: sid,
                name: data.name,
                class: data.class,
                avgNgp,
                subjectsAvg: subjectAverages
            });
        }

        const classGroups = {};
        studentList.forEach(s => {
            if (!classGroups[s.class]) classGroups[s.class] = [];
            classGroups[s.class].push(s);
        });
        const sortedClasses = Object.keys(classGroups).sort();

        // Class ranking within each class
        for (const cls of sortedClasses) {
            const arr = classGroups[cls];
            arr.sort((a, b) => b.avgNgp - a.avgNgp);
            let rank = 1;
            let prevNgp = arr[0]?.avgNgp;
            for (let i = 0; i < arr.length; i++) {
                if (arr[i].avgNgp < prevNgp) {
                    rank = i + 1;
                    prevNgp = arr[i].avgNgp;
                }
                arr[i].classRank = rank;
            }
        }

        // Overall school ranking
        const overallList = [];
        for (const [sid, data] of Object.entries(overallStudentNgpMap)) {
            if (data.count > 0) overallList.push({ id: sid, avgNgp: data.totalNgp / data.count });
        }
        overallList.sort((a, b) => b.avgNgp - a.avgNgp);
        let rank = 1;
        let prevNgp = overallList[0]?.avgNgp;
        const rankMap = {};
        for (let i = 0; i < overallList.length; i++) {
            if (overallList[i].avgNgp < prevNgp) {
                rank = i + 1;
                prevNgp = overallList[i].avgNgp;
            }
            rankMap[overallList[i].id] = rank;
        }
        studentList.forEach(s => {
            s.overallRank = rankMap[s.id] || 'N/A';
        });

        // Build HTML ranking report
        let html = '';
        let counter = 1;
        for (const cls of sortedClasses) {
            html += `<h3>Kelas: ${cls}</h3>`;
            html += `<table>
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Student Name</th>
                        <th>IC No.</th>
                        <th>Class</th>
                        <th>Class Rank</th>
                        <th>Overall Rank</th>
                        <th>NGP</th>
                        <th>Subject Average NGP</th>
                    </tr>
                </thead>
                <tbody>`;
            const studentsInClass = classGroups[cls];
            studentsInClass.forEach(s => {
                const subjectLines = Object.entries(s.subjectsAvg).map(([subj, ngp]) => `${subj}: ${ngp}`);
                const subjectStr = subjectLines.join('<br>');
                html += `<tr>
                    <td>${counter++}</td>
                    <td>${s.name}</td>
                    <td>${s.id}</td>
                    <td>${s.class}</td>
                    <td>${s.classRank}</td>
                    <td>${s.overallRank}</td>
                    <td><strong>${s.avgNgp.toFixed(2)}</strong></td>
                    <td style="line-height:1.4;">${subjectStr}</td>
                </tr>`;
            });
            html += '</tbody></table>';
        }

        // Print window for ranking report
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showToast('Popup blocked. Please allow popups.', 'error');
            hideLoading();
            return;
        }

        const logoImg = document.getElementById('appLogoImage');
        const logoSrc = logoImg ? logoImg.src : '';
        const printCSS = `
            <style>
                body { font-family: 'Segoe UI', sans-serif; margin: 20px; color: #000; background: #fff; }
                .print-header { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                .print-logo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-right: 20px; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
                th { background: #f0f0f0; }
                h3 { margin-top: 20px; }
            </style>
        `;
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>Overall Ranking</title>${printCSS}</head>
            <body>
                <div class="print-header">
                    ${logoSrc ? `<img class="print-logo" src="${logoSrc}" />` : ''}
                    <h1>Pusat Tingkatan Enam SMK Badin</h1>
                </div>
                <h2>Overall Examination Analysis</h2>
                <p>Overall Classes | ${term ? 'Term: ' + term : 'All Terms'}</p>
                ${html}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 800);

    } catch (err) {
        console.error('Print ranking error:', err);
        showToast('Failed to generate report.', 'error');
    }
    hideLoading();
}

// ========== INITIAL SETUP & EVENT BINDING ==========
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('studentLoginForm').addEventListener('submit', handleStudentLogin);
    document.getElementById('teacherLoginForm').addEventListener('submit', handleTeacherLogin);
    
    document.getElementById('registerStudentForm').addEventListener('submit', registrationRequest('student'));
    document.getElementById('registerTeacherForm').addEventListener('submit', registrationRequest('teacher'));

    document.getElementById('resultForm').addEventListener('submit', handleSaveResult);
    document.getElementById('addClassForm').addEventListener('submit', handleSaveClass);
    document.getElementById('muetForm').addEventListener('submit', handleSaveMuet);
    document.getElementById('resetPasswordForm').addEventListener('submit', handlePasswordReset);
    document.getElementById('profileForm').addEventListener('submit', handleProfileSave);

    ['resultModalOverlay','addClassModalOverlay','muetModalOverlay','resetPasswordModalOverlay','analysisModalOverlay','globalAnalysisModalOverlay'].forEach(id => {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === this) {
                    if (id === 'resultModalOverlay') closeResultModal();
                    else if (id === 'addClassModalOverlay') closeAddClassModal();
                    else if (id === 'muetModalOverlay') closeMuetModal();
                    else if (id === 'resetPasswordModalOverlay') closeResetPasswordModal();
                    else if (id === 'analysisModalOverlay') closeAnalysisModal();
                    else if (id === 'globalAnalysisModalOverlay') closeGlobalAnalysisModal();
                }
            });
        }
    });

    setupPasswordToggle('studentPasswordInput', 'toggleStudentPassword');
    setupPasswordToggle('teacherPasswordInput', 'toggleTeacherPassword');
    setupPasswordToggle('resetNewPassword', 'toggleResetPassword');

    loadClassesForRegistration();
    loadHomeroomClassOptions();

    const userType = sessionStorage.getItem('userType');
    const userId = sessionStorage.getItem('userId');
    if (userType && userId) {
        if (userType === 'student') {
            document.getElementById('studentNameDisplay').textContent = sessionStorage.getItem('userName');
            document.getElementById('studentIdDisplay').textContent = `ID: ${userId}`;
            const userClass = sessionStorage.getItem('userClass');
            loadStudentResults(userId, userClass);
            navigateTo('student-results');
        } else if (userType === 'teacher') {
            document.getElementById('teacherNameDisplay').textContent = sessionStorage.getItem('userName');
            loadTeacherClasses();
            navigateTo('teacher-dashboard');
        }
    }
});
