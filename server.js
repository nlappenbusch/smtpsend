require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { simpleParser } = require('mailparser');
const session = require('express-session');

const app = express();
const PORT = 3000;

// ==================== FILE LOGGER ====================
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFilePath() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(LOG_DIR, `smtpsend_${dateStr}.log`);
}

function writeToLog(level, ...args) {
    const now = new Date();
    const timestamp = now.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
    const logLine = `[${timestamp}] [${level}] ${message}\n`;

    try {
        fs.appendFileSync(getLogFilePath(), logLine, 'utf8');
    } catch (err) {
        // Fallback: don't crash if log write fails
    }
}

// Intercept console.log and console.error
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

console.log = function (...args) {
    originalLog(...args);
    writeToLog('INFO', ...args);
};

console.error = function (...args) {
    originalError(...args);
    writeToLog('ERROR', ...args);
};

// Multer configuration for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Helper function to clean HTML for Quill editor
function cleanHtmlForQuill(html) {
    // Remove Word-specific namespaces and XML declarations
    html = html.replace(/xmlns:[a-z]+="[^"]*"/gi, '');
    html = html.replace(/<\?xml[^>]*>/gi, '');

    // Remove Word/Outlook specific tags
    html = html.replace(/<!\[if[^\]]*\]>[\s\S]*?<!\[endif\]>/gi, '');
    html = html.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');
    html = html.replace(/<v:[\s\S]*?<\/v:[^>]+>/gi, '');
    html = html.replace(/<w:[\s\S]*?<\/w:[^>]+>/gi, '');

    // Remove style blocks and scripts
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<head>[\s\S]*?<\/head>/gi, '');

    // Extract body content if present
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        html = bodyMatch[1];
    }

    // Clean up Word artifacts (but keep base style/class for now, we filter tags later)
    html = html.replace(/mso-[a-z\-]+:[^;"']+;?/gi, '');
    html = html.replace(/class="Mso[^"]*"/gi, '');

    // Note: We NO LONGER strip all style/class globally here, 
    // because that kills image dimensions (width/height in styles).

    // NEUE STRATEGIE: Extrahiere Paragraphen, dann baue Text neu auf
    // Zuerst alle <p> Tags mit ihrem Inhalt sammeln
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;

    while ((match = pRegex.exec(html)) !== null) {
        let content = match[1];
        // Entferne alle HTML-Tags aus dem Inhalt (außer img, a und BR!)
        // Aber bewahre die Attribute dieser Tags!
        content = content.replace(/<(?!img|a|\/a|br)([^>]+)>/gi, '');

        // Normalize BRs innerhalb des Paragraphen
        content = content.replace(/<br\s*\/?>/gi, '<br>');
        // Normalize whitespace (aber nicht um BRs herum)
        content = content.replace(/\s+/g, ' ').trim();
        content = content.replace(/&nbsp;/g, ' ').trim();
        // Clean whitespace around BRs
        content = content.replace(/\s*<br>\s*/gi, '<br>');

        // Nur Paragraphen mit Inhalt behalten
        if (content.length > 0 && content !== ' ') {
            paragraphs.push(content);
        }
    }

    // Wenn keine Paragraphen gefunden, Fallback zu altem Ansatz
    if (paragraphs.length === 0) {
        // Final cleaning of remaining tags except specific list
        html = html.replace(/<(?!img|a|\/a|br)([^>]+)>/gi, '');

        html = html.replace(/\s+/g, ' ');
        html = html.replace(/&nbsp;/g, ' ');
        html = html.replace(/>\s+</g, '><');
        html = html.replace(/<p[^>]*>\s*<\/p>/gi, '');
        html = html.replace(/<\/p>/gi, '<br>');
        html = html.replace(/<p[^>]*>/gi, '');
        html = html.replace(/<br\s*\/?>/gi, '<br>');
        html = html.replace(/(<br>\s*)+/gi, '<br>');
    } else {
        // ===== V13 REVOLUTION: KEINE <p> TAGS MEHR! NUR <br>! =====
        // Join alle Zeilen mit einem einzigen <br>
        html = paragraphs.join('<br>');
    }

    // Normalisiere BRs
    html = html.replace(/<br\s*\/?>/gi, '<br>');
    // Entferne mehrfache BRs (max 1)
    html = html.replace(/(<br>\s*){2,}/gi, '<br>');
    // Entferne BRs am Anfang/Ende
    html = html.replace(/^(<br>)+|(<br>)+$/gi, '');

    // Wrap in single div with normal line-height
    html = '<div style="margin:0;padding:0;line-height:1.4">' + html + '</div>';

    console.log('🚀🚀🚀 HTML CLEANING COMPLETED - ZEILEN:', paragraphs.length, 'LÄNGE:', html.length);

    return html.trim();
}

// SMTP Configuration (from environment variables)
const SMTP_CONFIG = {
    host: process.env.SMTP_HOST || 'mail.pc4play.de',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
};

// Brevo API Configuration (from environment variables)
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_API_URL = 'https://api.brevo.com/v3';

// Mass Send Job State
let activeJob = {
    running: false,
    stopped: false,
    total: 0,
    processed: 0,
    success: 0,
    error: 0,
    recipients: [],
    subject: '',
    html: '',
    attachments: [],
    logs: [],
    startTime: null,
    settings: {
        delay: 2000,
        parallel: 1,
        batchSize: 50,
        batchPause: 15000
    }
};

function addJobLog(type, message) {
    const time = new Date().toLocaleTimeString('de-DE');
    activeJob.logs.unshift({ time, type, message });
    if (activeJob.logs.length > 100) activeJob.logs.pop();
    console.log(`[JOB ${type.toUpperCase()}] ${message}`);
}

function recordSentEmail(email) {
    try {
        const historicalFile = path.join(__dirname, 'sent_history.csv');
        if (!fs.existsSync(historicalFile)) {
            fs.writeFileSync(historicalFile, 'Email;Vorname;Nachname\n', 'utf8');
        }
        // Append email with empty placeholders for first/last name
        const line = `${email};;\n`;
        fs.appendFileSync(historicalFile, line, 'utf8');
    } catch (error) {
        console.error('✗ Error recording sent email in history:', error.message);
    }
}

function loadSentHistory() {
    try {
        const historicalFile = path.join(__dirname, 'sent_history.csv');
        if (!fs.existsSync(historicalFile)) return new Set();

        const content = fs.readFileSync(historicalFile, 'utf8');
        const lines = content.split(/\r?\n/);
        const emails = new Set();

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const email = line.split(';')[0].toLowerCase().trim();
            if (email) emails.add(email);
        }
        return emails;
    } catch (error) {
        console.error('✗ Error loading sent history:', error.message);
        return new Set();
    }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'faltin-travel-secret-8105',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Authentication Middleware
const APP_PASSWORD = process.env.APP_PASSWORD || 'Regensdorf?8105!';

function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }

    // Check if it's an API request (including those that don't start with /api/ but are fetched)
    const isApiRequest = req.path.startsWith('/api/') || req.xhr || req.headers.accept?.indexOf('json') > -1;

    if (isApiRequest) {
        return res.status(401).json({ success: false, error: 'Unauthorized/Session Expired' });
    }

    // Otherwise redirect to login
    res.redirect('/login');
}

// Favicon fix
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Public Routes
app.get('/login', (req, res) => {
    if (req.session && req.session.isAuthenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;

    if (password === APP_PASSWORD) {
        req.session.isAuthenticated = true;
        console.log('🔓 Successful login attempt');
        res.json({ success: true });
    } else {
        console.log('🔒 Failed login attempt');
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Protected routes (must be after public routes)
app.use('/api', requireAuth);

// Static files (protected except logos and assets needed for login)
app.get('/faltin-logo.svg', (req, res) => res.sendFile(path.join(__dirname, 'faltin-logo.svg')));

// Explicitly protect index.html
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

// Helper function to extract base64 images from HTML and convert to CID attachments
function extractImagesFromHtml(html) {
    const images = [];
    const imgRegex = /<img[^>]+src=["']data:image\/([^;]+);base64,([^"']+)["'][^>]*>/gi;
    let match;
    let cidCounter = 0;

    let modifiedHtml = html;

    // Find all base64 images
    while ((match = imgRegex.exec(html)) !== null) {
        const fullMatch = match[0];
        const imageType = match[1]; // png, jpeg, etc.
        const base64Data = match[2];

        // Generate unique CID
        const cid = `image${cidCounter}@smtpsend`;
        cidCounter++;

        // Add to attachments array
        images.push({
            filename: `image${cidCounter}.${imageType}`,
            content: Buffer.from(base64Data, 'base64'),
            contentType: `image/${imageType}`,
            cid: cid,
            encoding: 'base64'
        });

        // Replace base64 src with cid reference
        const newImgTag = fullMatch.replace(/src=["']data:image\/[^;]+;base64,[^"']+["']/, `src="cid:${cid}"`);
        modifiedHtml = modifiedHtml.replace(fullMatch, newImgTag);
    }

    return { html: modifiedHtml, attachments: images };
}

// Brevo API: Get all contact lists
app.get('/api/brevo/lists', async (req, res) => {
    try {
        let allLists = [];
        let offset = 0;
        const limit = 50;
        let hasMore = true;

        while (hasMore) {
            const response = await fetch(`${BREVO_API_URL}/contacts/lists?limit=${limit}&offset=${offset}&sort=desc`, {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY
                }
            });

            if (!response.ok) {
                throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Debug: Log raw first list to see actual field names
            if (offset === 0 && data.lists && data.lists.length > 0) {
                console.log('📋 RAW Brevo list sample:', JSON.stringify(data.lists[0], null, 2));
            }

            allLists = allLists.concat(data.lists || []);
            hasMore = data.lists && data.lists.length === limit;
            offset += limit;
        }

        console.log(`✓ Fetched ${allLists.length} Brevo lists total`);

        res.json({
            success: true,
            lists: allLists.map(list => {
                // Try all possible field names for subscriber count
                const count = list.uniqueSubscribers
                    || list.totalSubscribers
                    || list.subscriberCount
                    || list.nb_subscribers
                    || 0;
                return {
                    id: list.id,
                    name: list.name,
                    totalSubscribers: count,
                    uniqueSubscribers: count,
                    createdAt: list.createdAt || null
                };
            })
        });

    } catch (error) {
        console.error('✗ Error fetching Brevo lists:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Brevo API: Get contact count for a specific list (lightweight)
app.get('/api/brevo/lists/:listId/count', async (req, res) => {
    try {
        const { listId } = req.params;
        const response = await fetch(
            `${BREVO_API_URL}/contacts/lists/${listId}/contacts?limit=1&offset=0`,
            {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const count = data.count || data.contacts?.length || 0;

        res.json({ success: true, count, listId: parseInt(listId) });
    } catch (error) {
        res.json({ success: true, count: 0, listId: parseInt(req.params.listId) });
    }
});

// Brevo API: Get contacts from a specific list
app.get('/api/brevo/lists/:listId/contacts', async (req, res) => {
    try {
        const { listId } = req.params;
        const limit = parseInt(req.query.limit) || 500;
        const offset = parseInt(req.query.offset) || 0;

        const response = await fetch(
            `${BREVO_API_URL}/contacts/lists/${listId}/contacts?limit=${limit}&offset=${offset}`,
            {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const contacts = data.contacts || [];

        // Format contacts for the frontend
        const formattedContacts = contacts.map(contact => ({
            email: contact.email,
            addedTime: contact.createdAt ? new Date(contact.createdAt).toLocaleDateString('de-DE') : '',
            modifiedTime: contact.modifiedAt ? new Date(contact.modifiedAt).toLocaleDateString('de-DE') : ''
        }));

        res.json({
            success: true,
            contacts: formattedContacts,
            count: formattedContacts.length,
            total: data.count || 0,
            hasMore: contacts.length === limit
        });

    } catch (error) {
        console.error('✗ Error fetching Brevo contacts:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all contacts with search and filter
app.get('/api/brevo/contacts/all', async (req, res) => {
    try {
        const { search = '', listId, limit = 500, offset = 0 } = req.query;

        let url = `${BREVO_API_URL}/contacts?limit=${limit}&offset=${offset}`;
        if (listId && listId !== 'all') {
            url = `${BREVO_API_URL}/contacts/lists/${listId}/contacts?limit=${limit}&offset=${offset}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        let contacts = data.contacts || [];

        // Filter by search term
        if (search) {
            const searchLower = search.toLowerCase();
            contacts = contacts.filter(contact =>
                contact.email?.toLowerCase().includes(searchLower) ||
                (contact.attributes?.FIRSTNAME || '').toLowerCase().includes(searchLower) ||
                (contact.attributes?.LASTNAME || '').toLowerCase().includes(searchLower)
            );
        }

        res.json({
            success: true,
            contacts: contacts.map(c => ({
                id: c.id,
                email: c.email,
                firstName: c.attributes?.FIRSTNAME || '',
                lastName: c.attributes?.LASTNAME || '',
                attributes: c.attributes || {},
                listIds: c.listIds || [],
                emailBlacklisted: c.emailBlacklisted,
                smsBlacklisted: c.smsBlacklisted,
                createdAt: c.createdAt,
                modifiedAt: c.modifiedAt
            })),
            count: contacts.length,
            total: data.count || contacts.length
        });
    } catch (error) {
        console.error('✗ Error fetching all contacts:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single contact details
app.get('/api/brevo/contacts/:email', async (req, res) => {
    try {
        const response = await fetch(`${BREVO_API_URL}/contacts/${encodeURIComponent(req.params.email)}`, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        const contact = await response.json();
        res.json({ success: true, contact });
    } catch (error) {
        console.error('✗ Error fetching contact:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new contact
app.post('/api/brevo/contacts', async (req, res) => {
    try {
        const response = await fetch(`${BREVO_API_URL}/contacts`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Brevo API error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`✓ Contact created: ${req.body.email}`);
        res.json({ success: true, data });
    } catch (error) {
        console.error('✗ Error creating contact:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update contact
app.put('/api/brevo/contacts/:email', async (req, res) => {
    try {
        const response = await fetch(`${BREVO_API_URL}/contacts/${encodeURIComponent(req.params.email)}`, {
            method: 'PUT',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Brevo API error: ${response.status}`);
        }

        console.log(`✓ Contact updated: ${req.params.email}`);
        res.json({ success: true });
    } catch (error) {
        console.error('✗ Error updating contact:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete contact
app.delete('/api/brevo/contacts/:email', async (req, res) => {
    try {
        const response = await fetch(`${BREVO_API_URL}/contacts/${encodeURIComponent(req.params.email)}`, {
            method: 'DELETE',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        console.log(`✓ Contact deleted: ${req.params.email}`);
        res.json({ success: true });
    } catch (error) {
        console.error('✗ Error deleting contact:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add contact to list
app.post('/api/brevo/contacts/:email/lists/:listId', async (req, res) => {
    try {
        const response = await fetch(`${BREVO_API_URL}/contacts/lists/${req.params.listId}/contacts/add`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: JSON.stringify({ emails: [req.params.email] })
        });

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        console.log(`✓ Contact ${req.params.email} added to list ${req.params.listId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('✗ Error adding contact to list:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove contact from list
app.delete('/api/brevo/contacts/:email/lists/:listId', async (req, res) => {
    try {
        const response = await fetch(`${BREVO_API_URL}/contacts/lists/${req.params.listId}/contacts/remove`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: JSON.stringify({ emails: [req.params.email] })
        });

        if (!response.ok) {
            throw new Error(`Brevo API error: ${response.status} ${response.statusText}`);
        }

        console.log(`✓ Contact ${req.params.email} removed from list ${req.params.listId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('✗ Error removing contact from list:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Email sending job endpoints
app.post('/api/start-send', (req, res) => {
    if (activeJob.running) {
        return res.status(400).json({ success: false, error: 'A job is already running' });
    }

    const { recipients, subject, html, attachments, settings } = req.body;

    if (!recipients || !recipients.length || !subject || !html) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // --- DELTA FILTERING ---
    const sentHistory = loadSentHistory();
    const filteredRecipients = recipients.filter(r => !sentHistory.has(r.email.toLowerCase().trim()));
    const skippedCount = recipients.length - filteredRecipients.length;

    // Initialize job
    activeJob = {
        running: true,
        stopped: false,
        total: filteredRecipients.length,
        processed: 0,
        success: 0,
        error: 0,
        recipients: [...filteredRecipients],
        subject,
        html,
        attachments: attachments || [],
        logs: [],
        startTime: Date.now(),
        settings: {
            delay: parseInt(settings.delay) || 2000,
            parallel: parseInt(settings.parallel) || 1,
            batchSize: parseInt(settings.batchSize) || 50,
            batchPause: parseInt(settings.batchPause) || 15000
        },
        skipped: skippedCount
    };

    addJobLog('info', `🚀 Backend-Versand gestartet: ${activeJob.total} Empfänger`);
    if (skippedCount > 0) {
        addJobLog('info', `⏩ ${skippedCount} Empfänger übersprungen (bereits in Historie)`);
    }

    // Start background process
    runBackendSendJob();

    res.json({ success: true, message: 'Job started' });
});

app.get('/api/send-status', (req, res) => {
    res.json({
        success: true,
        job: {
            running: activeJob.running,
            stopped: activeJob.stopped,
            total: activeJob.total,
            processed: activeJob.processed,
            success: activeJob.success,
            error: activeJob.error,
            logs: activeJob.logs,
            startTime: activeJob.startTime,
            skipped: activeJob.skipped
        }
    });
});

app.post('/api/stop-send', (req, res) => {
    if (activeJob.running) {
        activeJob.stopped = true;
        addJobLog('info', '⛔ Versand-Stopp angefordert...');
        res.json({ success: true, message: 'Stopping job...' });
    } else {
        res.status(400).json({ success: false, error: 'No active job to stop' });
    }
});

async function runBackendSendJob() {
    const { recipients, subject, html, attachments, settings } = activeJob;

    // Clean HTML once for the whole job
    let cleanedHtml = html.replace(/<p>/gi, '<p style="margin:0;padding:0;line-height:1.4">');
    cleanedHtml = cleanedHtml.replace(/<p\s+style="[^"]*"/gi, '<p style="margin:0;padding:0;line-height:1.4"');

    const total = recipients.length;

    for (let batchStart = 0; batchStart < total; batchStart += settings.batchSize) {
        if (activeJob.stopped) break;

        const batchEnd = Math.min(batchStart + settings.batchSize, total);
        const currentBatch = recipients.slice(batchStart, batchEnd);
        const batchNum = Math.floor(batchStart / settings.batchSize) + 1;
        const totalBatches = Math.ceil(total / settings.batchSize);

        addJobLog('info', `📦 Batch ${batchNum}/${totalBatches} wird verarbeitet...`);

        for (let i = 0; i < currentBatch.length; i += settings.parallel) {
            if (activeJob.stopped) break;

            const group = currentBatch.slice(i, Math.min(i + settings.parallel, currentBatch.length));

            await Promise.all(group.map(async (recipient) => {
                try {
                    // Re-use existing extractImagesFromHtml logic for each email
                    const { html: finalHtml, attachments: imageAttachments } = extractImagesFromHtml(cleanedHtml);

                    const transporter = nodemailer.createTransport({
                        ...SMTP_CONFIG,
                        connectionTimeout: 10000,
                        greetingTimeout: 10000
                    });

                    await transporter.sendMail({
                        from: `"Faltin Travel" <${SMTP_CONFIG.auth.user}>`,
                        to: recipient.email,
                        subject: subject,
                        html: finalHtml,
                        attachments: [...imageAttachments, ...attachments]
                    });

                    activeJob.success++;
                    addJobLog('success', `✓ Email an ${recipient.email} gesendet`);
                    recordSentEmail(recipient.email);
                } catch (error) {
                    activeJob.error++;
                    addJobLog('error', `✗ Fehler bei ${recipient.email}: ${error.message}`);
                } finally {
                    activeJob.processed++;
                }
            }));

            if (settings.delay > 0 && (i + settings.parallel) < currentBatch.length && !activeJob.stopped) {
                await new Promise(resolve => setTimeout(resolve, settings.delay));
            }
        }

        if (batchEnd < total && !activeJob.stopped) {
            addJobLog('info', `✅ Batch ${batchNum} abgeschlossen. Pause ${settings.batchPause / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, settings.batchPause));
        }
    }

    activeJob.running = false;
    const status = activeJob.stopped ? 'gestoppt' : 'beendet';
    addJobLog('info', `🏁 Versand ${status}. Gesamt: ${activeJob.success} Erfolg, ${activeJob.error} Fehler.`);
}

// Single Email sending endpoint (for tests)
app.post('/api/send-email', async (req, res) => {
    let { to, subject, html, attachments: userAttachments = [] } = req.body;

    if (!to || !subject || !html) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: to, subject, html'
        });
    }

    try {
        const { html: finalHtml, attachments: imageAttachments } = extractImagesFromHtml(html);

        const transporter = nodemailer.createTransport({
            ...SMTP_CONFIG,
            connectionTimeout: 10000,
            greetingTimeout: 10000
        });

        const info = await transporter.sendMail({
            from: `"Faltin Travel" <${SMTP_CONFIG.auth.user}>`,
            to,
            subject,
            html: finalHtml,
            attachments: [...imageAttachments, ...userAttachments]
        });

        recordSentEmail(to);
        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('✗ Error sending single email:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


// EML examples endpoint
app.get('/api/example-emls', (req, res) => {
    try {
        const files = fs.readdirSync(__dirname)
            .filter(f => f.endsWith('.eml'))
            .map(f => ({
                name: f,
                size: fs.statSync(path.join(__dirname, f)).size
            }));
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load specific example endpoint
app.get('/api/load-example/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Example file not found' });
        }

        console.log(`📧 Loading example EML: ${filename}`);
        const buffer = fs.readFileSync(filePath);
        const parsed = await simpleParser(buffer);

        // Extract subject
        const subject = parsed.subject || '';

        // Extract HTML content
        let html = '';
        if (parsed.html) {
            html = typeof parsed.html === 'string' ? parsed.html : parsed.html.toString();
        } else if (parsed.textAsHtml) {
            html = parsed.textAsHtml;
        } else if (parsed.text) {
            html = `<div>${parsed.text.replace(/\n/g, '<br>')}</div>`;
        }

        // Clean HTML
        html = cleanHtmlForQuill(html);

        // Extract images
        const images = [];
        if (parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
                if (attachment.contentDisposition === 'inline' || attachment.cid) {
                    const base64Data = `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`;
                    images.push({
                        cid: attachment.cid || attachment.contentId || attachment.filename,
                        filename: attachment.filename,
                        contentType: attachment.contentType,
                        data: base64Data
                    });
                }
            }
        }

        res.json({ success: true, subject, html, images });
    } catch (error) {
        console.error('✗ Error loading example EML:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// EML parsing endpoint
app.post('/api/parse-eml', upload.single('eml'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No EML file uploaded'
            });
        }

        console.log(`📧 Parsing EML file: ${req.file.originalname} (${req.file.size} bytes)`);

        // Parse the EML file
        const parsed = await simpleParser(req.file.buffer);

        // Extract subject
        const subject = parsed.subject || '';

        // Extract HTML content with better fallbacks
        let html = '';
        if (parsed.html) {
            if (typeof parsed.html === 'string') {
                html = parsed.html;
            } else if (parsed.html && parsed.html.toString) {
                html = parsed.html.toString();
            }
        } else if (parsed.textAsHtml) {
            html = parsed.textAsHtml;
        } else if (parsed.text) {
            // Convert plain text to HTML as last resort
            html = `<div>${parsed.text.replace(/\n/g, '<br>')}</div>`;
        }

        console.log(`  HTML content length: ${html.length} characters`);
        console.log(`  HTML preview: ${html.substring(0, 200)}...`);

        // Clean HTML for Quill editor compatibility
        html = cleanHtmlForQuill(html);
        console.log(`  Cleaned HTML length: ${html.length} characters`);

        // Extract images and convert to base64
        const images = [];
        if (parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
                // Check if it's an inline image
                if (attachment.contentDisposition === 'inline' || attachment.cid) {
                    const base64Data = `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`;

                    images.push({
                        cid: attachment.cid || attachment.contentId || attachment.filename,
                        filename: attachment.filename,
                        contentType: attachment.contentType,
                        data: base64Data
                    });

                    console.log(`  ✓ Image found: ${attachment.filename} (CID: ${attachment.cid})`);
                }
            }
        }

        console.log(`✓ EML parsed successfully: Subject="${subject}", ${images.length} images`);

        res.json({
            success: true,
            subject: subject,
            html: html,
            images: images
        });

    } catch (error) {
        console.error('✗ Error parsing EML:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== LOG API ENDPOINTS ====================

// Get current log file content
app.get('/api/logs', (req, res) => {
    try {
        const logFile = getLogFilePath();
        if (!fs.existsSync(logFile)) {
            return res.json({ success: true, content: '', filename: path.basename(logFile) });
        }
        const content = fs.readFileSync(logFile, 'utf8');

        // If download requested
        if (req.query.download === '1') {
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(logFile)}"`);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(content);
        }

        res.json({ success: true, content, filename: path.basename(logFile) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List all log files
app.get('/api/logs/list', (req, res) => {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            return res.json({ success: true, files: [] });
        }
        const files = fs.readdirSync(LOG_DIR)
            .filter(f => f.endsWith('.log'))
            .map(f => {
                const stats = fs.statSync(path.join(LOG_DIR, f));
                return { name: f, size: stats.size, modified: stats.mtime };
            })
            .sort((a, b) => new Date(b.modified) - new Date(a.modified));
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download specific log file
app.get('/api/logs/file/:filename', (req, res) => {
    try {
        const filename = req.params.filename.replace(/[^a-zA-Z0-9_\-\.]/g, '');
        const filePath = path.join(LOG_DIR, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Log file not found' });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.sendFile(filePath);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear current log file
app.post('/api/logs/clear', (req, res) => {
    try {
        const logFile = getLogFilePath();
        fs.writeFileSync(logFile, '', 'utf8');
        console.log('🗑️ Log-Datei wurde geleert');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   📧  Email Massenversand Server                         ║
║   Version: 1.3.0                                          ║
║                                                           ║
║   Server läuft auf: http://localhost:${PORT}                ║
║                                                           ║
║   SMTP Server: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}      ║
║   Login: ${SMTP_CONFIG.auth.user || 'Kein User gesetzt'}     ║
║                                                           ║
║   Öffnen Sie http://localhost:${PORT} im Browser          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
