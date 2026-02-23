// Global State
let recipients = [];
let quillEditor;
let isSending = false;
let shouldStop = false;
let attachments = []; // Store attachments
let allContacts = [];
let allBrevoLists = [];
let currentTab = 'emails';

// Initialize Quill Editor
document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    initializeEventListeners();
    initializeCRM();
});

function initializeEditor() {
    quillEditor = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                [{ 'align': [] }],
                ['link', 'image'],
                ['clean']
            ]
        },
        placeholder: 'Erstellen Sie hier Ihre Email mit dem WYSIWYG-Editor...'
    });

    // Enable image paste functionality
    quillEditor.root.addEventListener('paste', handleImagePaste);
}

function initializeEventListeners() {
    // CSV Upload
    const uploadZone = document.getElementById('uploadZone');
    const csvFile = document.getElementById('csvFile');

    uploadZone.addEventListener('click', () => csvFile.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) {
            handleCSVFile(file);
        }
    });

    csvFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleCSVFile(file);
        }
    });

    // Buttons
    document.getElementById('viewRecipients').addEventListener('click', showRecipientsModal);
    document.getElementById('previewBtn').addEventListener('click', showPreview);
    document.getElementById('viewHtmlBtn').addEventListener('click', showHtmlCode);
    document.getElementById('testEmailBtn').addEventListener('click', showTestEmailModal);
    document.getElementById('sendBtn').addEventListener('click', startMassSend);
    document.getElementById('stopBtn').addEventListener('click', stopSending);
    document.getElementById('clearLog').addEventListener('click', clearLog);
    document.getElementById('downloadServerLog').addEventListener('click', downloadServerLog);

    // Duration estimate: recalculate on any settings change
    ['delayInput', 'parallelSends', 'batchSize', 'batchPause'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateDurationEstimate);
    });

    // Brevo Integration
    document.getElementById('loadBrevoListsBtn').addEventListener('click', loadBrevoLists);
    document.getElementById('brevoListSelect').addEventListener('change', onBrevoListSelect);
    document.getElementById('importBrevoListBtn').addEventListener('click', importBrevoContacts);

    // EML Upload
    const emlUploadBtn = document.getElementById('emlUploadBtn');
    const emlFile = document.getElementById('emlFile');
    emlUploadBtn.addEventListener('click', () => emlFile.click());
    emlFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleEMLFile(file);
        }
    });

    // Attachment Upload
    const attachmentBtn = document.getElementById('attachmentBtn');
    const attachmentFile = document.getElementById('attachmentFile');
    attachmentBtn.addEventListener('click', () => attachmentFile.click());
    attachmentFile.addEventListener('change', handleAttachmentUpload);

    // Modal Close Buttons
    document.getElementById('closePreview').addEventListener('click', () => hideModal('previewModal'));
    document.getElementById('closeRecipients').addEventListener('click', () => hideModal('recipientsModal'));
    document.getElementById('closeTestEmail').addEventListener('click', () => hideModal('testEmailModal'));
    document.getElementById('closeHtmlCode').addEventListener('click', () => hideModal('htmlCodeModal'));
    document.getElementById('cancelHtmlCode').addEventListener('click', () => hideModal('htmlCodeModal'));
    document.getElementById('cancelTestEmail').addEventListener('click', () => hideModal('testEmailModal'));
    document.getElementById('confirmTestEmail').addEventListener('click', sendTestEmail);
    document.getElementById('copyHtmlBtn').addEventListener('click', copyHtmlCode);
    document.getElementById('saveHtmlBtn').addEventListener('click', saveHtmlCode);

    // Close modals on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });

    // Enable send button when requirements are met
    document.getElementById('emailSubject').addEventListener('input', updateSendButton);
    quillEditor.on('text-change', updateSendButton);
}

function handleCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        parseCSV(content);
    };
    reader.readAsText(file);
}

function parseCSV(content) {
    // Auto-detect delimiter (semicolon or comma)
    const firstLine = content.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
        addLog('error', '❌ CSV-Datei ist leer oder hat keine Datenzeilen');
        return;
    }

    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

    // Auto-detect email column (look for header with 'email' or 'mail' or '@' content)
    let emailColIndex = headers.findIndex(h => h.includes('email') || h.includes('mail') || h.includes('e-mail'));

    // If no email header found, scan first data row for a column with '@'
    if (emailColIndex === -1) {
        const firstRow = lines[1].split(delimiter).map(v => v.trim());
        emailColIndex = firstRow.findIndex(v => v.includes('@'));
    }

    if (emailColIndex === -1) {
        addLog('error', '❌ Keine E-Mail-Spalte gefunden. Stelle sicher, dass die CSV eine Spalte mit E-Mail-Adressen enthält.');
        return;
    }

    // Detect optional name columns
    const firstNameColIndex = headers.findIndex(h => h.includes('vorname') || h.includes('firstname') || h.includes('first_name') || h.includes('prenom'));
    const lastNameColIndex = headers.findIndex(h => h.includes('nachname') || h.includes('lastname') || h.includes('last_name') || h.includes('name') || h.includes('nom'));

    // Email validation regex (RFC 5322 simplified)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

    recipients = [];
    const invalidEmails = [];
    const duplicates = [];
    const seenEmails = new Set();

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, '')); // Remove quotes
        const rawEmail = (values[emailColIndex] || '').trim().toLowerCase();

        if (!rawEmail) continue;

        // Check for duplicates
        if (seenEmails.has(rawEmail)) {
            duplicates.push(rawEmail);
            continue;
        }
        seenEmails.add(rawEmail);

        // Validate email syntax
        if (!emailRegex.test(rawEmail)) {
            invalidEmails.push({ row: i + 1, email: rawEmail });
            continue;
        }

        recipients.push({
            email: rawEmail,
            firstName: firstNameColIndex >= 0 ? (values[firstNameColIndex] || '') : '',
            lastName: lastNameColIndex >= 0 ? (values[lastNameColIndex] || '') : '',
            addedTime: '',
            modifiedTime: ''
        });
    }

    // Report results
    updateRecipientInfo();
    updateSendButton();

    addLog('success', `✅ ${recipients.length} gültige Empfänger geladen`);

    if (duplicates.length > 0) {
        addLog('info', `ℹ️ ${duplicates.length} Duplikate entfernt`);
    }

    // Summary
    const total = recipients.length + invalidEmails.length + duplicates.length;
    if (invalidEmails.length > 0 || duplicates.length > 0) {
        addLog('info', `📊 Gesamt: ${total} Zeilen → ${recipients.length} gültig, ${invalidEmails.length} ungültig, ${duplicates.length} Duplikate`);
    }

    // Open fixer modal if there are invalid emails
    if (invalidEmails.length > 0) {
        addLog('error', `⚠️ ${invalidEmails.length} ungültige E-Mail-Adressen – Fixer wird geöffnet...`);
        lastInvalidEmails = invalidEmails;
        openEmailFixer(invalidEmails);
    }
}

// ==================== CSV EMAIL FIXER ====================

let lastInvalidEmails = [];
let fixerData = []; // Current fixer state

// Domain typo corrections
const DOMAIN_FIXES = {
    // Gmail
    'gmail.col': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cpm': 'gmail.com',
    'gmail.cm': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.om': 'gmail.com',
    'gmail.de': 'gmail.com', 'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com',
    'gmaill.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
    'g]mail.com': 'gmail.com',
    // GMX
    'gmx.ed': 'gmx.de', 'gmx.d': 'gmx.de', 'gmx.dee': 'gmx.de',
    'gmx.ce': 'gmx.de', 'gmx.fe': 'gmx.de', 'gmx.dr': 'gmx.de',
    'gmx.dde': 'gmx.de', 'gmx.ne': 'gmx.net',
    // Outlook / Hotmail
    'hotmail.col': 'hotmail.com', 'hotmail.con': 'hotmail.com',
    'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com',
    'hotmail.de': 'hotmail.de', 'hotmail.cm': 'hotmail.com',
    'outlook.col': 'outlook.com', 'outlook.con': 'outlook.com',
    'outllook.com': 'outlook.com', 'outlok.com': 'outlook.com',
    'outlook.ed': 'outlook.de', 'outlook.d': 'outlook.de',
    // Yahoo
    'yahoo.col': 'yahoo.com', 'yahoo.con': 'yahoo.com',
    'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
    // iCloud
    'icloud.col': 'icloud.com', 'icloud.con': 'icloud.com',
    'icloude.com': 'icloud.com', 'iclod.com': 'icloud.com',
    // T-Online
    't-online.ed': 't-online.de', 't-online.d': 't-online.de',
    't-onlline.de': 't-online.de', 't-onine.de': 't-online.de',
    // Web.de
    'web.ed': 'web.de', 'web.d': 'web.de', 'web.dee': 'web.de',
    // AOL
    'aol.col': 'aol.com', 'aol.con': 'aol.com',
    // Kabelmail
    'kabelmail.ed': 'kabelmail.de', 'kabelmail.d': 'kabelmail.de',
    // Arcor
    'arcor.ed': 'arcor.de', 'arcor.d': 'arcor.de',
    // Freenet
    'freenet.ed': 'freenet.de', 'freenet.d': 'freenet.de',
    // Generic TLD fixes
    '.col': '.com', '.con': '.com', '.cpm': '.com',
};

function suggestEmailFix(email) {
    let fixed = email.trim().toLowerCase();
    const problems = [];

    // Remove leading/trailing dots or spaces
    fixed = fixed.replace(/^[\s.]+|[\s.]+$/g, '');
    if (fixed !== email) problems.push('Leerzeichen/Punkte entfernt');

    // Remove spaces in email
    if (fixed.includes(' ')) {
        fixed = fixed.replace(/\s+/g, '');
        problems.push('Leerzeichen entfernt');
    }

    // Remove double @
    if ((fixed.match(/@/g) || []).length > 1) {
        fixed = fixed.replace(/@+/g, '@');
        problems.push('Doppeltes @ entfernt');
    }

    // Fix missing @ (common: Name.domain.de → name@domain.de) — too ambiguous, skip

    // Split into local and domain
    const atIndex = fixed.lastIndexOf('@');
    if (atIndex === -1) {
        return { original: email, fixed: null, problems: ['Kein @-Zeichen'], fixable: false };
    }

    let local = fixed.substring(0, atIndex);
    let domain = fixed.substring(atIndex + 1);

    // Remove special chars from local part edges
    local = local.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9]+$/, '');

    // Fix domain
    // Remove leading dots from domain
    domain = domain.replace(/^\.+/, '');

    // Check known domain typos
    if (DOMAIN_FIXES[domain]) {
        problems.push(`Domain "${domain}" → "${DOMAIN_FIXES[domain]}"`);
        domain = DOMAIN_FIXES[domain];
    } else {
        // Try partial TLD fixes
        for (const [typo, fix] of Object.entries(DOMAIN_FIXES)) {
            if (domain.endsWith(typo)) {
                const fixedDomain = domain.slice(0, -typo.length) + fix;
                problems.push(`TLD "${typo}" → "${fix}"`);
                domain = fixedDomain;
                break;
            }
        }
    }

    // Check for missing TLD (e.g. user@gmx)
    if (!domain.includes('.')) {
        problems.push('Keine TLD (z.B. .de/.com)');
        return { original: email, fixed: null, problems, fixable: false };
    }

    // Check for very short TLD (e.g. .d, .c)
    const tld = domain.split('.').pop();
    if (tld.length < 2) {
        problems.push(`TLD zu kurz: .${tld}`);
        return { original: email, fixed: null, problems, fixable: false };
    }

    fixed = `${local}@${domain}`;

    // Final validation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

    if (fixed !== email && emailRegex.test(fixed)) {
        return { original: email, fixed, problems, fixable: true };
    } else if (emailRegex.test(fixed)) {
        return { original: email, fixed, problems: ['Gültig nach Bereinigung'], fixable: true };
    } else {
        if (problems.length === 0) problems.push('Ungültiges Format');
        return { original: email, fixed: null, problems, fixable: false };
    }
}

function openEmailFixer(invalidEmails) {
    fixerData = invalidEmails.map(inv => {
        const suggestion = suggestEmailFix(inv.email);
        return {
            row: inv.row,
            original: inv.email,
            fixed: suggestion.fixed,
            problems: suggestion.problems,
            fixable: suggestion.fixable,
            status: 'pending' // pending, accepted, rejected
        };
    });

    renderFixerTable();
    showModal('csvFixerModal');
}

function renderFixerTable() {
    const tbody = document.getElementById('fixerTableBody');
    const fixable = fixerData.filter(d => d.fixable).length;
    const unfixable = fixerData.filter(d => !d.fixable).length;

    document.getElementById('fixerSummary').innerHTML =
        `<strong>${fixerData.length}</strong> problematische Adressen | ` +
        `<span style="color: var(--success);">${fixable} auto-fixbar</span> | ` +
        `<span style="color: var(--error);">${unfixable} manuell prüfen</span>`;

    tbody.innerHTML = fixerData.map((item, idx) => {
        const statusClass = item.status === 'accepted' ? 'background: rgba(34,197,94,0.1);' :
            item.status === 'rejected' ? 'background: rgba(239,68,68,0.1); opacity: 0.5;' : '';
        return `
        <tr id="fixerRow-${idx}" style="${statusClass}">
            <td style="text-align: center; color: #888;">${item.row}</td>
            <td style="font-family: monospace; font-size: 0.85em; word-break: break-all;">
                <span style="color: var(--error);">${item.original}</span>
            </td>
            <td style="font-size: 0.8em; color: #888;">${item.problems.join(', ')}</td>
            <td style="font-family: monospace; font-size: 0.85em;">
                ${item.fixable
                ? `<input type="text" class="form-input" value="${item.fixed || ''}" 
                        id="fixInput-${idx}" style="font-size:0.85em; padding:4px 8px; font-family:monospace;"
                        ${item.status !== 'pending' ? 'disabled' : ''}>`
                : '<span style="color: #888;">—</span>'}
            </td>
            <td>
                ${item.status === 'pending' ? `
                    ${item.fixable ? `<button class="btn-secondary" onclick="acceptFix(${idx})" style="font-size:0.75em; padding:3px 8px; color: var(--success);">✅</button>` : ''}
                    <button class="btn-secondary" onclick="rejectFix(${idx})" style="font-size:0.75em; padding:3px 8px; color: var(--error);">🗑️</button>
                    <button class="btn-secondary" onclick="editFix(${idx})" style="font-size:0.75em; padding:3px 8px;">✏️</button>
                ` : item.status === 'accepted'
                ? '<span style="color: var(--success); font-size: 0.85em;">✅ Übernommen</span>'
                : '<span style="color: #888; font-size: 0.85em;">🗑️ Entfernt</span>'
            }
            </td>
        </tr>`;
    }).join('');
}

function acceptFix(idx) {
    const input = document.getElementById(`fixInput-${idx}`);
    if (input) fixerData[idx].fixed = input.value.trim();
    fixerData[idx].status = 'accepted';
    renderFixerTable();
}

function rejectFix(idx) {
    fixerData[idx].status = 'rejected';
    renderFixerTable();
}

function editFix(idx) {
    // Make it fixable with a manual input
    fixerData[idx].fixable = true;
    if (!fixerData[idx].fixed) fixerData[idx].fixed = fixerData[idx].original;
    renderFixerTable();
    const input = document.getElementById(`fixInput-${idx}`);
    if (input) input.focus();
}

function acceptAllFixes() {
    fixerData.forEach((item, idx) => {
        if (item.status === 'pending' && item.fixable) {
            const input = document.getElementById(`fixInput-${idx}`);
            if (input) item.fixed = input.value.trim();
            item.status = 'accepted';
        }
    });
    renderFixerTable();
}

function removeAllInvalid() {
    fixerData.forEach(item => {
        if (item.status === 'pending') {
            item.status = 'rejected';
        }
    });
    renderFixerTable();
}

function applySelectedFixes() {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

    let added = 0;
    let skipped = 0;

    fixerData.forEach(item => {
        if (item.status === 'accepted' && item.fixed && emailRegex.test(item.fixed)) {
            // Check for duplicates in current recipients
            if (!recipients.some(r => r.email === item.fixed)) {
                recipients.push({
                    email: item.fixed,
                    firstName: '',
                    lastName: '',
                    addedTime: '',
                    modifiedTime: ''
                });
                added++;
            } else {
                skipped++;
            }
        }
    });

    updateRecipientInfo();
    updateSendButton();
    hideModal('csvFixerModal');

    addLog('success', `🔧 Fixer: ${added} korrigierte Adressen hinzugefügt${skipped > 0 ? `, ${skipped} Duplikate übersprungen` : ''}`);
    addLog('info', `📊 Neue Gesamtanzahl: ${recipients.length} Empfänger`);
}

function downloadCleanedCSV() {
    // First apply any accepted fixes to recipients
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

    // Build the clean list: current valid recipients + accepted fixes
    const cleanEmails = new Set(recipients.map(r => r.email));
    let fixesApplied = 0;

    fixerData.forEach((item, idx) => {
        if (item.status === 'accepted') {
            const input = document.getElementById(`fixInput-${idx}`);
            const fixedEmail = input ? input.value.trim() : item.fixed;
            if (fixedEmail && emailRegex.test(fixedEmail) && !cleanEmails.has(fixedEmail)) {
                cleanEmails.add(fixedEmail);
                recipients.push({
                    email: fixedEmail,
                    firstName: '',
                    lastName: '',
                    addedTime: '',
                    modifiedTime: ''
                });
                fixesApplied++;
            }
        }
    });

    // Build CSV content
    const csvLines = ['Email;Vorname;Nachname'];
    recipients.forEach(r => {
        csvLines.push(`${r.email};${r.firstName || ''};${r.lastName || ''}`);
    });

    const csvContent = csvLines.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const date = new Date().toISOString().split('T')[0];
    a.download = `empfaenger_bereinigt_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Update UI
    updateRecipientInfo();
    updateSendButton();

    const removed = lastInvalidEmails.length - fixesApplied;
    addLog('success', `📥 Bereinigte CSV heruntergeladen: ${recipients.length} gültige Empfänger`);
    if (removed > 0) addLog('info', `🗑️ ${removed} ungültige Einträge entfernt`);
    if (fixesApplied > 0) addLog('info', `🔧 ${fixesApplied} Adressen korrigiert`);
}

function updateRecipientInfo() {
    const recipientInfo = document.getElementById('recipientInfo');
    const recipientCount = document.getElementById('recipientCount');

    if (recipients.length > 0) {
        recipientInfo.classList.remove('hidden');
        recipientCount.textContent = recipients.length;
        document.getElementById('uploadZone').style.display = 'none';
        updateDurationEstimate();
    }
}

function showRecipientsModal() {
    const recipientsList = document.getElementById('recipientsList');
    recipientsList.innerHTML = recipients.map((r, i) => `
        <div class="recipient-item">
            <div>
                <div class="recipient-email">${r.email}</div>
                <div class="recipient-meta">Hinzugefügt: ${r.addedTime} | Geändert: ${r.modifiedTime}</div>
            </div>
            <div class="recipient-meta">#${i + 1}</div>
        </div>
    `).join('');

    showModal('recipientsModal');
}

function showPreview() {
    const subject = document.getElementById('emailSubject').value;
    const content = quillEditor.root.innerHTML;

    document.getElementById('previewSubject').textContent = subject || '(Kein Betreff)';
    document.getElementById('previewContent').innerHTML = content;

    showModal('previewModal');
}

function showHtmlCode() {
    const htmlContent = quillEditor.root.innerHTML;
    const formattedHtml = formatHtml(htmlContent);

    // Count images in HTML
    const imageCount = (htmlContent.match(/<img/gi) || []).length;
    const base64ImageCount = (htmlContent.match(/data:image/gi) || []).length;

    console.log(`HTML Stats: ${htmlContent.length} chars, ${imageCount} images, ${base64ImageCount} base64 images`);

    document.getElementById('htmlCodeEdit').value = formattedHtml;
    showModal('htmlCodeModal');
}

function saveHtmlCode() {
    const editedHtml = document.getElementById('htmlCodeEdit').value;

    // Use Quill API instead of direct innerHTML manipulation
    const delta = quillEditor.clipboard.convert(editedHtml);
    quillEditor.setContents(delta, 'silent');

    updateSendButton();
    addLog('info', 'HTML-Code wurde aktualisiert');
    hideModal('htmlCodeModal');
}

function copyHtmlCode() {
    const htmlContent = document.getElementById('htmlCodeEdit').value;

    navigator.clipboard.writeText(htmlContent).then(() => {
        const copyBtn = document.getElementById('copyHtmlBtn');
        const originalText = copyBtn.innerHTML;

        copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Kopiert!
        `;

        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 2000);
    }).catch(err => {
        alert('Fehler beim Kopieren: ' + err.message);
    });
}

function formatHtml(html) {
    // Simple HTML formatting for better readability
    let formatted = html;
    // Basic prettify: add newlines after specific tags
    formatted = formatted.replace(/>(\s+)?</g, '>\n<');
    return formatted;
}

// ===== ATTACHMENT HANDLING =====
function handleAttachmentUpload(e) {
    const files = Array.from(e.target.files);

    files.forEach(file => {
        // Convert file to base64
        const reader = new FileReader();
        reader.onload = (event) => {
            attachments.push({
                filename: file.name,
                content: event.target.result.split(',')[1], // Remove data:xxx;base64, prefix
                contentType: file.type || 'application/octet-stream',
                size: file.size
            });
            updateAttachmentList();
        };
        reader.readAsDataURL(file);
    });

    // Reset file input
    e.target.value = '';
}

function updateAttachmentList() {
    const listContainer = document.getElementById('attachmentList');

    if (attachments.length === 0) {
        listContainer.style.display = 'none';
        return;
    }

    listContainer.style.display = 'block';
    listContainer.innerHTML = attachments.map((att, index) => `
        <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: #f5f5f5; border-radius: 4px; margin-bottom: 5px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span style="flex: 1; font-size: 14px;">${att.filename} (${formatFileSize(att.size)})</span>
            <button onclick="removeAttachment(${index})" style="background: none; border: none; color: #dc2626; cursor: pointer; padding: 4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `).join('');
}

function removeAttachment(index) {
    attachments.splice(index, 1);
    updateAttachmentList();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showTestEmailModal() {
    showModal('testEmailModal');
}

async function sendTestEmail() {
    const testEmail = document.getElementById('testEmailAddress').value;

    if (!testEmail || !testEmail.includes('@')) {
        alert('Bitte geben Sie eine gültige Email-Adresse ein.');
        return;
    }

    const subject = document.getElementById('emailSubject').value;
    const htmlContent = quillEditor.root.innerHTML;

    // Log image statistics
    const imageCount = (htmlContent.match(/<img/gi) || []).length;
    const base64ImageCount = (htmlContent.match(/data:image/gi) || []).length;
    console.log(`Sending email with: ${htmlContent.length} chars, ${imageCount} images, ${base64ImageCount} base64 images, ${attachments.length} attachments`);

    // Get button and disable it
    const confirmBtn = document.getElementById('confirmTestEmail');
    const originalText = confirmBtn.innerHTML;

    // Show loading state
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="32" stroke-dashoffset="0">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
            </circle>
        </svg>
        Sende...
    `;

    // Show immediate feedback in log
    addLog('info', `📤 Sende Test-Email an ${testEmail}${attachments.length > 0 ? ` (${attachments.length} Anhang/Anhänge)` : ''}...`);

    // Show log section if hidden
    document.getElementById('logSection').classList.remove('hidden');

    try {
        await sendEmail(testEmail, subject, htmlContent, attachments);
        addLog('success', `✅ Test-Email erfolgreich an ${testEmail} gesendet`);

        // Success feedback
        confirmBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Gesendet!
        `;

        setTimeout(() => {
            hideModal('testEmailModal');
            confirmBtn.innerHTML = originalText;
            confirmBtn.disabled = false;
        }, 1500);

    } catch (error) {
        addLog('error', `❌ Fehler beim Senden der Test-Email: ${error.message}`);

        // Error feedback
        confirmBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Fehler!
        `;

        setTimeout(() => {
            confirmBtn.innerHTML = originalText;
            confirmBtn.disabled = false;
        }, 2000);

        alert('Fehler beim Senden der Test-Email. Siehe Log für Details.');
    }
}

async function startMassSend() {
    if (isSending) return;

    const subject = document.getElementById('emailSubject').value;
    const htmlContent = quillEditor.root.innerHTML;
    const delay = parseFloat(document.getElementById('delayInput').value) * 1000;
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const parallelSends = parseInt(document.getElementById('parallelSends').value) || 1;
    const batchPause = parseInt(document.getElementById('batchPause').value) * 1000;

    const totalRecipients = recipients.length;
    const estDuration = calculateDuration(totalRecipients, delay, parallelSends, batchSize, batchPause);

    if (!confirm(
        `Möchten Sie wirklich ${totalRecipients} Emails versenden?\n\n` +
        `⏱️ Verzögerung: ${delay / 1000}s pro Mail\n` +
        `⚡ Parallele Mails: ${parallelSends}\n` +
        `📦 Batch-Größe: ${batchSize}\n` +
        `☕ Batch-Pause: ${batchPause / 1000}s\n\n` +
        `📊 Geschätzte Dauer: ${formatDuration(estDuration)}`
    )) {
        return;
    }

    isSending = true;
    shouldStop = false;

    document.getElementById('sendBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');
    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('logSection').classList.remove('hidden');

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    const startTime = Date.now();

    addLog('info', `🚀 Starte Versand: ${totalRecipients} Empfänger | ${parallelSends} parallel | ${delay / 1000}s Delay | Batch ${batchSize} | Pause ${batchPause / 1000}s`);

    // Verarbeite E-Mails in Batches
    for (let batchStart = 0; batchStart < totalRecipients; batchStart += batchSize) {
        if (shouldStop) {
            addLog('info', '⛔ Versand wurde vom Benutzer gestoppt');
            break;
        }

        const batchEnd = Math.min(batchStart + batchSize, totalRecipients);
        const currentBatch = recipients.slice(batchStart, batchEnd);
        const batchNumber = Math.floor(batchStart / batchSize) + 1;
        const totalBatches = Math.ceil(totalRecipients / batchSize);

        addLog('info', `📦 Batch ${batchNumber}/${totalBatches}: ${currentBatch.length} E-Mails...`);

        // Sende E-Mails innerhalb des Batches (in parallelen Gruppen)
        for (let i = 0; i < currentBatch.length; i += parallelSends) {
            if (shouldStop) break;

            const parallelGroup = currentBatch.slice(i, Math.min(i + parallelSends, currentBatch.length));

            // Sende alle E-Mails dieser Gruppe gleichzeitig
            const promises = parallelGroup.map(async (recipient) => {
                try {
                    await sendEmail(recipient.email, subject, htmlContent, attachments);
                    successCount++;
                    addLog('success', `✓ Email an ${recipient.email} gesendet`);
                    return { success: true };
                } catch (error) {
                    errorCount++;
                    addLog('error', `✗ Fehler bei ${recipient.email}: ${error.message}`);
                    return { success: false };
                }
            });

            await Promise.all(promises);
            processedCount += parallelGroup.length;
            updateProgress(processedCount, totalRecipients, successCount, errorCount);

            // Verzögerung zwischen jeder Gruppe – WIRD VOLL RESPEKTIERT
            if (delay > 0 && (i + parallelSends) < currentBatch.length && !shouldStop) {
                await sleep(delay);
            }
        }

        // Pause zwischen Batches
        if (batchEnd < totalRecipients && !shouldStop) {
            const elapsed = formatDuration((Date.now() - startTime) / 1000);
            addLog('info', `✅ Batch ${batchNumber} abgeschlossen (${elapsed} vergangen). Pause ${batchPause / 1000}s...`);
            await sleep(batchPause);
        }
    }

    const totalTime = formatDuration((Date.now() - startTime) / 1000);
    isSending = false;
    document.getElementById('sendBtn').classList.remove('hidden');
    document.getElementById('stopBtn').classList.add('hidden');
    document.getElementById('stopBtn').disabled = false;

    addLog('info', `🏁 Versand abgeschlossen in ${totalTime}. Erfolgreich: ${successCount}, Fehlgeschlagen: ${errorCount}`);
}

// Duration calculation
function calculateDuration(totalMails, delayMs, parallel, batchSize, batchPauseMs) {
    const groups = Math.ceil(totalMails / parallel);
    const sendTime = groups * (delayMs / 1000); // Seconds for sending
    const batches = Math.ceil(totalMails / batchSize);
    const pauseTime = Math.max(0, batches - 1) * (batchPauseMs / 1000); // Seconds for pauses
    return sendTime + pauseTime;
}

function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}min`;
    } else if (minutes > 0) {
        return `${minutes}min ${seconds}s`;
    }
    return `${seconds}s`;
}

function updateDurationEstimate() {
    const totalMails = recipients.length;
    const el = document.getElementById('durationEstimate');
    if (!el) return;

    if (totalMails === 0) {
        el.textContent = 'Empfänger laden, um Dauer zu berechnen...';
        return;
    }

    const delay = parseFloat(document.getElementById('delayInput').value) * 1000;
    const parallel = parseInt(document.getElementById('parallelSends').value) || 1;
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const batchPause = parseInt(document.getElementById('batchPause').value) * 1000;

    const duration = calculateDuration(totalMails, delay, parallel, batchSize, batchPause);
    const mailsPerMin = Math.round(totalMails / (duration / 60));

    el.innerHTML = `<strong>${formatDuration(duration)}</strong> für ${totalMails.toLocaleString('de-DE')} Empfänger (~${mailsPerMin} Mails/Min)`;
}

function stopSending() {
    shouldStop = true;
    document.getElementById('stopBtn').disabled = true;
    addLog('info', 'Stoppe Versand nach aktueller Email...');
}

async function sendEmail(to, subject, htmlContent, emailAttachments = []) {
    // This is a client-side implementation
    // In production, you would need a backend server to actually send emails
    // For now, we'll simulate the email sending with a backend API call

    const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            to,
            subject,
            html: htmlContent,
            attachments: emailAttachments
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

function updateProgress(current, total, success, errors) {
    const percentage = (current / total) * 100;

    document.getElementById('progressFill').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = `${current} / ${total}`;
    document.getElementById('successCount').textContent = success;
    document.getElementById('errorCount').textContent = errors;
    document.getElementById('remainingCount').textContent = total - current;
}

function addLog(type, message) {
    const logContent = document.getElementById('logContent');
    const time = new Date().toLocaleTimeString('de-DE');

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;

    logContent.insertBefore(logEntry, logContent.firstChild);
}

function clearLog() {
    document.getElementById('logContent').innerHTML = '';
}

async function downloadServerLog() {
    try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Fehler');

        if (!data.content) {
            addLog('info', 'ℹ️ Server-Log ist leer – noch keine Einträge.');
            return;
        }

        // Create blob and download
        const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || 'server.log';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addLog('success', `✅ Server-Log heruntergeladen: ${data.filename}`);
    } catch (error) {
        addLog('error', `❌ Fehler beim Herunterladen des Server-Logs: ${error.message}`);
    }
}

function updateSendButton() {
    const subject = document.getElementById('emailSubject').value;
    const content = quillEditor.getText().trim();
    const hasRecipients = recipients.length > 0;

    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = !(subject && content && hasRecipients);
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== IMAGE PASTE SUPPORT ====================

function handleImagePaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    const items = clipboardData.items;

    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = item.getAsFile();
            insertImageFromBlob(blob);
        }
    }
}

function insertImageFromBlob(blob) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Image = e.target.result;
        const range = quillEditor.getSelection(true);
        quillEditor.insertEmbed(range.index, 'image', base64Image);
        quillEditor.setSelection(range.index + 1);
        addLog('info', 'Bild erfolgreich eingefügt');
    };
    reader.readAsDataURL(blob);
}

// ==================== EML FILE PARSING ====================

async function handleEMLFile(file) {
    try {
        addLog('info', `📧 Lade EML-Datei: ${file.name}...`);

        const formData = new FormData();
        formData.append('eml', file);

        const response = await fetch('/api/parse-eml', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Set subject
        if (data.subject) {
            document.getElementById('emailSubject').value = data.subject;
            addLog('success', `✓ Betreff übernommen: "${data.subject}"`);
        }

        // Set HTML content
        if (data.html) {
            let htmlContent = data.html;

            // Replace CID images with embedded base64 images BEFORE inserting
            if (data.images && data.images.length > 0) {
                data.images.forEach(img => {
                    // Replace cid: references with base64 data
                    const cidPattern = new RegExp(`cid:${img.cid}`, 'gi');
                    htmlContent = htmlContent.replace(cidPattern, img.data);
                });
                addLog('success', `✓ ${data.images.length} Bilder werden eingebettet`);
            }

            // CLEAN HTML BEFORE INSERTING - Remove double line breaks
            console.log('🧹 Original HTML length:', htmlContent.length);

            // Normalize BRs
            htmlContent = htmlContent.replace(/<br\s*\/?>/gi, '<br>');

            // AGGRESSIV: Ersetze ALLE mehrfachen BRs (2+) mit nur EINEM BR
            htmlContent = htmlContent.replace(/(<br>\s*){2,}/gi, '<br>');

            // Remove BRs at the start
            htmlContent = htmlContent.replace(/^(<br>)+/gi, '');

            // Remove BRs at the end
            htmlContent = htmlContent.replace(/(<br>)+$/gi, '');

            // Remove BRs between div/p closing and opening tags
            htmlContent = htmlContent.replace(/<\/(div|p)>\s*<br>\s*<(div|p)/gi, '</$1><$2');

            console.log('✅ Cleaned HTML length:', htmlContent.length);

            // Use Quill's API to safely insert HTML content
            const delta = quillEditor.clipboard.convert(htmlContent);
            quillEditor.setContents(delta, 'silent');
            addLog('success', '✓ HTML-Inhalt übernommen (Formatierung optimiert)');
        }

        updateSendButton();
        addLog('success', '✅ EML-Datei erfolgreich importiert');

    } catch (error) {
        console.error('Error parsing EML:', error);
        addLog('error', `❌ Fehler beim Laden der EML-Datei: ${error.message}`);
        alert('Fehler beim Laden der EML-Datei. Siehe Log für Details.');
    }
}
// ==================== Brevo Integration ====================

let brevoLists = [];
let selectedBrevoList = null;

async function loadBrevoLists() {
    try {
        addLog('info', '📋 Lade Brevo-Listen...');

        const response = await fetch('/api/brevo/lists');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Fehler beim Laden der Listen');
        }

        brevoLists = data.lists;

        const selectElement = document.getElementById('brevoListSelect');
        selectElement.innerHTML = '<option value="">-- Wählen Sie eine Liste --</option>';

        brevoLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = `${list.name} (${list.uniqueSubscribers} Kontakte)`;
            selectElement.appendChild(option);
        });

        document.getElementById('brevoListsContainer').classList.remove('hidden');
        addLog('success', `✓ ${brevoLists.length} Brevo-Listen geladen`);

    } catch (error) {
        console.error('Error loading Brevo lists:', error);
        addLog('error', `✗ Fehler beim Laden der Brevo-Listen: ${error.message}`);
        alert('Fehler beim Laden der Brevo-Listen. Siehe Log für Details.');
    }
}

function onBrevoListSelect(e) {
    const listId = e.target.value;
    const importBtn = document.getElementById('importBrevoListBtn');
    const infoDiv = document.getElementById('brevoListInfo');

    if (listId) {
        selectedBrevoList = brevoLists.find(l => l.id == listId);
        importBtn.disabled = false;
        infoDiv.textContent = `Liste: ${selectedBrevoList.name} • ${selectedBrevoList.uniqueSubscribers} Kontakte`;
    } else {
        selectedBrevoList = null;
        importBtn.disabled = true;
        infoDiv.textContent = '';
    }
}

async function importBrevoContacts() {
    if (!selectedBrevoList) return;

    try {
        addLog('info', `📥 Importiere Kontakte aus "${selectedBrevoList.name}"...`);
        document.getElementById('importBrevoListBtn').disabled = true;
        document.getElementById('importBrevoListBtn').textContent = 'Wird geladen...';

        const response = await fetch(`/api/brevo/lists/${selectedBrevoList.id}/contacts`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Fehler beim Laden der Kontakte');
        }

        // Add contacts to recipients array
        const newContacts = data.contacts.filter(contact => {
            // Check for duplicates
            return !recipients.some(r => r.email.toLowerCase() === contact.email.toLowerCase());
        });

        recipients = [...recipients, ...newContacts];

        updateRecipientInfo();
        updateSendButton();

        addLog('success', `✅ ${newContacts.length} Kontakte aus "${selectedBrevoList.name}" importiert`);
        if (data.contacts.length > newContacts.length) {
            addLog('info', `ℹ ${data.contacts.length - newContacts.length} Duplikate übersprungen`);
        }

        // Reset UI
        document.getElementById('importBrevoListBtn').disabled = false;
        document.getElementById('importBrevoListBtn').textContent = 'Kontakte importieren';

    } catch (error) {
        console.error('Error importing Brevo contacts:', error);
        addLog('error', `✗ Fehler beim Importieren der Kontakte: ${error.message}`);
        alert('Fehler beim Importieren der Kontakte. Siehe Log für Details.');

        document.getElementById('importBrevoListBtn').disabled = false;
        document.getElementById('importBrevoListBtn').textContent = 'Kontakte importieren';
    }
}

// ========== CRM FUNCTIONS ==========

function initializeCRM() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Contact management
    document.getElementById('addContactBtn').addEventListener('click', () => openContactModal());
    document.getElementById('refreshContactsBtn').addEventListener('click', loadAllContacts);
    document.getElementById('contactSearch').addEventListener('input', filterContacts);
    document.getElementById('contactListFilter').addEventListener('change', loadAllContacts);

    // Contact modal
    document.getElementById('closeContactModal').addEventListener('click', () => hideModal('contactModal'));
    document.getElementById('cancelContactBtn').addEventListener('click', () => hideModal('contactModal'));
    document.getElementById('saveContactBtn').addEventListener('click', saveContact);
    document.getElementById('deleteContactBtn').addEventListener('click', deleteContact);

    // Load initial data
    if (currentTab === 'contacts') {
        loadAllContacts();
    }
}

function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    // Load data for tab
    if (tabName === 'contacts') {
        loadAllContacts();
        loadBrevoListsForFilter();
    } else if (tabName === 'lists') {
        loadListsOverview();
    }
}

function getListCount(list) {
    const rawCount = list?.totalSubscribers ?? list?.uniqueSubscribers ?? 0;
    const count = Number(rawCount);
    return Number.isFinite(count) ? count : 0;
}

function formatListDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('de-DE');
}

async function loadAllContacts() {
    const tableBody = document.getElementById('contactsTableBody');
    const searchTerm = document.getElementById('contactSearch').value;
    const listId = document.getElementById('contactListFilter').value;

    tableBody.innerHTML = '<tr><td colspan="6" class="loading-row"><i class="fas fa-spinner fa-spin"></i> Lade Kontakte...</td></tr>';

    try {
        const params = new URLSearchParams({ search: searchTerm, limit: 500 });
        if (listId && listId !== 'all') {
            params.append('listId', listId);
        }

        const response = await fetch(`/api/brevo/contacts/all?${params}`);
        const data = await response.json();

        if (!data.success) throw new Error(data.error);

        allContacts = data.contacts;
        renderContactsTable(allContacts);
        document.getElementById('contactCount').textContent = `${data.count} Kontakte`;

    } catch (error) {
        console.error('Error loading contacts:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="loading-row" style="color: var(--error);">✗ Fehler: ${error.message}</td></tr>`;
    }
}

function renderContactsTable(contacts) {
    const tableBody = document.getElementById('contactsTableBody');

    if (contacts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="loading-row">Keine Kontakte gefunden</td></tr>';
        return;
    }

    tableBody.innerHTML = contacts.map(contact => `
        <tr>
            <td><strong>${contact.email}</strong></td>
            <td>${contact.firstName || '-'}</td>
            <td>${contact.lastName || '-'}</td>
            <td>
                <div class="tag-list">
                    ${(contact.listIds || []).slice(0, 3).map(id => {
        const list = allBrevoLists.find(l => l.id === id);
        return `<span class="badge">${list ? list.name : id}</span>`;
    }).join('')}
                    ${contact.listIds && contact.listIds.length > 3 ? `<span class="badge">+${contact.listIds.length - 3}</span>` : ''}
                </div>
            </td>
            <td>${new Date(contact.createdAt).toLocaleDateString('de-DE')}</td>
            <td class="actions-col">
                <div class="table-actions">
                    <button class="btn-icon" onclick="openContactModal('${contact.email}')" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon danger" onclick="confirmDeleteContact('${contact.email}')" title="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterContacts() {
    const searchTerm = document.getElementById('contactSearch').value.toLowerCase();
    const filtered = allContacts.filter(contact =>
        contact.email.toLowerCase().includes(searchTerm) ||
        (contact.firstName || '').toLowerCase().includes(searchTerm) ||
        (contact.lastName || '').toLowerCase().includes(searchTerm)
    );
    renderContactsTable(filtered);
    document.getElementById('contactCount').textContent = `${filtered.length} Kontakte`;
}

async function openContactModal(email = null) {
    const modal = document.getElementById('contactModal');
    const title = document.getElementById('contactModalTitle');
    const deleteBtn = document.getElementById('deleteContactBtn');
    const emailInput = document.getElementById('contactEmail');

    // Load lists for checkboxes
    await loadBrevoListsForCheckboxes();

    if (email) {
        // Edit mode
        title.innerHTML = '<i class="fas fa-user-edit"></i> Kontakt bearbeiten';
        deleteBtn.style.display = 'block';
        emailInput.disabled = true;

        try {
            const response = await fetch(`/api/brevo/contacts/${encodeURIComponent(email)}`);
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            const contact = data.contact;
            emailInput.value = contact.email;
            document.getElementById('contactFirstName').value = contact.attributes?.FIRSTNAME || '';
            document.getElementById('contactLastName').value = contact.attributes?.LASTNAME || '';

            // Set list checkboxes
            document.querySelectorAll('#contactListsCheckboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = contact.listIds?.includes(parseInt(cb.value));
            });

        } catch (error) {
            alert('Fehler beim Laden des Kontakts: ' + error.message);
            return;
        }
    } else {
        // Create mode
        title.innerHTML = '<i class="fas fa-user-plus"></i> Neuer Kontakt';
        deleteBtn.style.display = 'none';
        emailInput.disabled = false;
        document.getElementById('contactForm').reset();
    }

    showModal('contactModal');
}

async function loadBrevoListsForCheckboxes() {
    const container = document.getElementById('contactListsCheckboxes');

    if (allBrevoLists.length === 0) {
        try {
            const response = await fetch('/api/brevo/lists');
            const data = await response.json();
            if (data.success) {
                allBrevoLists = data.lists;
            }
        } catch (error) {
            console.error('Error loading lists:', error);
        }
    }

    container.innerHTML = allBrevoLists.map(list => `
        <label>
            <input type="checkbox" value="${list.id}">
            <span>${list.name} (${getListCount(list)})</span>
        </label>
    `).join('');
}

async function loadBrevoListsForFilter() {
    const select = document.getElementById('contactListFilter');

    if (allBrevoLists.length === 0) {
        try {
            const response = await fetch('/api/brevo/lists');
            const data = await response.json();
            if (data.success) {
                allBrevoLists = data.lists;
            }
        } catch (error) {
            console.error('Error loading lists:', error);
            return;
        }
    }

    select.innerHTML = '<option value="all">Alle Listen</option>' +
        allBrevoLists.map(list => `<option value="${list.id}">${list.name} (${getListCount(list)})</option>`).join('');
}

async function saveContact() {
    const email = document.getElementById('contactEmail').value.trim();
    const firstName = document.getElementById('contactFirstName').value.trim();
    const lastName = document.getElementById('contactLastName').value.trim();

    if (!email) {
        alert('Bitte Email-Adresse eingeben');
        return;
    }

    const selectedLists = Array.from(document.querySelectorAll('#contactListsCheckboxes input:checked'))
        .map(cb => parseInt(cb.value));

    const isNew = !allContacts.some(c => c.email === email);

    try {
        const saveBtn = document.getElementById('saveContactBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Speichern...';

        const contactData = {
            email,
            attributes: {
                FIRSTNAME: firstName,
                LASTNAME: lastName
            },
            listIds: selectedLists,
            updateEnabled: true
        };

        const response = await fetch(
            isNew ? '/api/brevo/contacts' : `/api/brevo/contacts/${encodeURIComponent(email)}`,
            {
                method: isNew ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contactData)
            }
        );

        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        hideModal('contactModal');
        loadAllContacts();
        addLog('success', `✅ Kontakt ${isNew ? 'erstellt' : 'aktualisiert'}: ${email}`);

    } catch (error) {
        alert('Fehler beim Speichern: ' + error.message);
    } finally {
        const saveBtn = document.getElementById('saveContactBtn');
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Speichern';
    }
}

async function confirmDeleteContact(email) {
    if (!confirm(`Möchten Sie den Kontakt "${email}" wirklich löschen?`)) {
        return;
    }
    await deleteContactByEmail(email);
}

async function deleteContact() {
    const email = document.getElementById('contactEmail').value;
    if (!confirm(`Möchten Sie den Kontakt "${email}" wirklich löschen?`)) {
        return;
    }
    await deleteContactByEmail(email);
}

async function deleteContactByEmail(email) {
    try {
        const response = await fetch(`/api/brevo/contacts/${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        hideModal('contactModal');
        loadAllContacts();
        addLog('success', `✅ Kontakt gelöscht: ${email}`);

    } catch (error) {
        alert('Fehler beim Löschen: ' + error.message);
    }
}

async function loadListsOverview() {
    const grid = document.getElementById('listsGrid');
    grid.innerHTML = '<div class="list-card loading"><i class="fas fa-spinner fa-spin"></i> Lade Listen...</div>';

    try {
        const response = await fetch('/api/brevo/lists');
        const data = await response.json();

        if (!data.success) throw new Error(data.error);

        allBrevoLists = data.lists;

        // Render lists immediately with count placeholder
        grid.innerHTML = data.lists.map(list => `
            <div class="list-card" onclick="filterByList(${list.id})">
                <h3><i class="fas fa-list"></i> ${list.name}</h3>
                <div class="list-count" id="listCount-${list.id}">${getListCount(list) || '<i class="fas fa-spinner fa-spin" style="font-size:0.6em"></i>'}</div>
                <div class="list-meta">
                    <span>Kontakte</span>
                    <span>${formatListDate(list.createdAt)}</span>
                </div>
            </div>
        `).join('');

        // If all counts are 0, lazy-load real counts
        const allZero = data.lists.every(l => getListCount(l) === 0);
        if (allZero) {
            console.log('📋 Alle Listen-Counts sind 0. Lade echte Kontaktanzahl...');
            // Fetch counts in background (batch of 5 at a time to not overload)
            for (let i = 0; i < data.lists.length; i += 5) {
                const batch = data.lists.slice(i, i + 5);
                await Promise.all(batch.map(async (list) => {
                    try {
                        const countRes = await fetch(`/api/brevo/lists/${list.id}/count`);
                        const countData = await countRes.json();
                        const count = countData.count || 0;
                        const el = document.getElementById(`listCount-${list.id}`);
                        if (el) el.textContent = count;
                    } catch (e) {
                        // Ignore individual count errors
                    }
                }));
            }
        }

    } catch (error) {
        grid.innerHTML = `<div class="list-card loading" style="color: var(--error);">✗ Fehler: ${error.message}</div>`;
    }
}

async function filterByList(listId) {
    // Switch to contacts tab WITHOUT auto-loading contacts
    currentTab = 'contacts';
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'contacts');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'contacts-tab');
    });

    // Ensure filter dropdown is populated first
    await loadBrevoListsForFilter();

    // Now set the filter value and load contacts
    document.getElementById('contactListFilter').value = listId;
    loadAllContacts();
}
