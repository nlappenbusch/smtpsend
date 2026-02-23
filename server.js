require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { simpleParser } = require('mailparser');

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

    // Clean up Word artifacts and attributes
    html = html.replace(/mso-[a-z\-]+:[^;"']+;?/gi, '');
    html = html.replace(/class="Mso[^"]*"/gi, '');
    html = html.replace(/\sstyle="[^"]*"/gi, '');
    html = html.replace(/\sclass="[^"]*"/gi, '');

    // NEUE STRATEGIE: Extrahiere Paragraphen, dann baue Text neu auf
    // Zuerst alle <p> Tags mit ihrem Inhalt sammeln
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;

    while ((match = pRegex.exec(html)) !== null) {
        let content = match[1];
        // Entferne alle HTML-Tags aus dem Inhalt (außer img, a und BR!)
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

    console.log('🚀🚀🚀 V13 REVOLUTION - NUR <br> TAGS! - ZEILEN:', paragraphs.length, 'LÄNGE:', html.length);

    return html.trim();
}

// SMTP Configuration (from environment variables)
const SMTP_CONFIG = {
    host: process.env.SMTP_HOST || '162.55.89.34',
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
        let allContacts = [];
        let offset = 0;
        const limit = 500;
        let hasMore = true;

        // Fetch all contacts (Brevo API is paginated)
        while (hasMore) {
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
            allContacts = allContacts.concat(data.contacts || []);

            hasMore = data.contacts && data.contacts.length === limit;
            offset += limit;

            console.log(`  Fetched ${allContacts.length} contacts so far...`);
        }

        console.log(`✓ Fetched total ${allContacts.length} contacts from list ${listId}`);

        // Format contacts for the frontend
        const formattedContacts = allContacts.map(contact => ({
            email: contact.email,
            addedTime: contact.createdAt ? new Date(contact.createdAt).toLocaleDateString('de-DE') : '',
            modifiedTime: contact.modifiedAt ? new Date(contact.modifiedAt).toLocaleDateString('de-DE') : ''
        }));

        res.json({
            success: true,
            contacts: formattedContacts,
            total: formattedContacts.length
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

// Email sending endpoint
app.post('/api/send-email', async (req, res) => {
    let { to, subject, html, attachments: userAttachments = [] } = req.body;

    if (!to || !subject || !html) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: to, subject, html'
        });
    }

    // Clean HTML before sending - nur minimales Cleanup
    console.log(`📧 Original HTML length: ${html.length}`);

    // ===== V14: <p> Tags bleiben - User will Absätze im Editor behalten! =====
    // Setze nur aggressive inline styles auf <p> Tags
    html = html.replace(/<p>/gi, '<p style="margin:0;padding:0;line-height:1.4">');
    html = html.replace(/<p\s+style="[^"]*"/gi, '<p style="margin:0;padding:0;line-height:1.4"');

    console.log(`✅ Cleaned HTML length: ${html.length}`);

    // Log HTML statistics
    const imageCount = (html.match(/<img/gi) || []).length;
    const base64ImageCount = (html.match(/data:image/gi) || []).length;
    console.log(`Sending to ${to}: HTML=${html.length} chars, ${imageCount} images, ${base64ImageCount} base64`);

    try {
        // Extract images and convert to CID attachments
        const { html: modifiedHtml, attachments } = extractImagesFromHtml(html);
        console.log(`  → Converted ${attachments.length} images to CID attachments`);

        // Create transporter with SMTP config
        console.log(`📡 Connecting to SMTP: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port} (User: ${SMTP_CONFIG.auth.user})`);

        const transporter = nodemailer.createTransport({
            host: SMTP_CONFIG.host,
            port: SMTP_CONFIG.port,
            secure: SMTP_CONFIG.secure,
            auth: {
                user: SMTP_CONFIG.auth.user,
                pass: SMTP_CONFIG.auth.pass
            },
            tls: {
                rejectUnauthorized: false
            },
            // timeouts to avoid indefinite hangs
            connectionTimeout: 10000, // 10s
            greetingTimeout: 10000,    // 10s
            socketTimeout: 15000       // 15s
        });

        // Verify connection
        console.log(`🔍 Verifying SMTP connection...`);
        await transporter.verify();
        console.log(`✅ SMTP connection verified!`);

        // Combine CID attachments from images with user attachments
        const allAttachments = [
            ...attachments, // CID image attachments
            ...userAttachments.map(att => ({
                filename: att.filename,
                content: att.content,
                encoding: 'base64',
                contentType: att.contentType
            }))
        ];

        console.log(`📎 Total attachments: ${allAttachments.length} (${attachments.length} images, ${userAttachments.length} files)`);

        // Send email with attachments
        const info = await transporter.sendMail({
            from: '"Faltin Travel" <faltin@faltintravel.com>',
            replyTo: '"Kontakt Faltin Travel" <kontakt@faltintravel.com>',
            to: to,
            subject: subject,
            html: modifiedHtml,
            attachments: allAttachments
        });

        console.log(`✓ Email sent to ${to}: ${info.messageId}`);

        res.json({
            success: true,
            messageId: info.messageId,
            recipient: to
        });

    } catch (error) {
        console.error(`✗ Error sending email to ${to}:`, error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
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
║   Version: 1.2.1                                          ║
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
