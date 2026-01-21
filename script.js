let dictionary = new Map();
let titles = new Set();

async function loadData() {
    try {
        const dataRes = await fetch('data.csv');
        if (!dataRes.ok) throw new Error('data.csv missing');
        const dataText = await dataRes.text();
        const rows = dataText.split('\n').map(r => r.trim()).filter(r => r && !r.startsWith('#'));
        rows.slice(1).forEach(row => {
            const parts = row.split(',');
            if (parts.length < 2) return;
            const key = parts[0].trim().toLowerCase();
            const val = parts.slice(1).join(',').trim();
            if (key) dictionary.set(key, val);
        });

        const titlesRes = await fetch('titles.csv');
        if (!titlesRes.ok) throw new Error('titles.csv missing');
        const titlesText = await titlesRes.text();
        const tRows = titlesText.split('\n').map(r => r.trim()).filter(r => r && !r.startsWith('#'));
        tRows.slice(1).forEach(row => {
            const t = row.split(',')[0]?.trim()?.toLowerCase();
            if (t) titles.add(t);
        });

        document.getElementById('status').textContent = 
            `געלאָדנט ${dictionary.size} ווערטער און ${titles.size} טיטלען`;
    } catch (err) {
        console.error(err);
        document.getElementById('status').textContent = 'פעלער: דורכגעפאַלן צו לאָדענען די דאַטע';
    }
}
// Helper: split a sequence into separate name candidates
function splitIntoNameCandidates(groupTokens) {
    const candidates = [];
    let current = [];

    groupTokens.forEach((g, i) => {
        current.push(g);

        const nextToken = groupTokens[i + 1];
        const isLast = i === groupTokens.length - 1;

        // Strong separators that likely end a name
        const textSoFar = current.map(t => t.core).join(' ').toLowerCase();
        const hasStrongSep = textSoFar.includes(', ') || textSoFar.includes('; ') || 
                             textSoFar.endsWith(' and ') || textSoFar.endsWith(' or ');

        if ((hasStrongSep && !isLast) || isLast) {
            if (isLast || hasStrongSep) {
                candidates.push([...current]);
                current = [];
            }
        }
    });

    if (current.length > 0) candidates.push(current);
    return candidates;
}

function convertText() {
    const input = document.getElementById('inputText').value;
    const outputArea = document.getElementById('outputText');
    const status = document.getElementById('status');

    if (!input.trim()) {
        status.textContent = 'שרייב עפּעס אַריין';
        outputArea.value = '';
        return;
    }

    const tokens = input.split(/(\s+)/);
    const result = [];
    let currentGroup = [];

    tokens.forEach(token => {
        if (/^\s+$/.test(token)) {
            if (currentGroup.length > 0) {
                // Process the group with splitting
                const nameCandidates = splitIntoNameCandidates(currentGroup);
                nameCandidates.forEach(candidate => {
                    processNameGroup(candidate, result);
                });
                currentGroup = [];
            }
            result.push(token);
            return;
        }

        const punctBefore = token.match(/^[\s.,;:!?()\-–—"'`‘’“”„«»‹›*…]+/)?.[0] || '';
        const punctAfter  = token.match(/[\s.,;:!?()\-–—"'`‘’“”„«»‹›*…]+$/)?.[0] || '';
        const core = token.slice(punctBefore.length, token.length - punctAfter.length);

        if (!core.trim()) {
            result.push(token);
            return;
        }

        const cleanCore = core.toLowerCase();
        const isHebrew = /^[\u0590-\u05FF\uFB1D-\uFB4F]+$/.test(cleanCore);

        if (isHebrew) {
            if (currentGroup.length > 0) {
                const nameCandidates = splitIntoNameCandidates(currentGroup);
                nameCandidates.forEach(c => processNameGroup(c, result));
                currentGroup = [];
            }
            result.push(token);
        } else {
            currentGroup.push({
                original: token,
                punctBefore,
                punctAfter,
                core,
                cleanCore
            });
        }
    });

    if (currentGroup.length > 0) {
        const nameCandidates = splitIntoNameCandidates(currentGroup);
        nameCandidates.forEach(c => processNameGroup(c, result));
    }

    outputArea.value = result.join('');
    status.textContent = 'געענדיגט!';
}

function processNameGroup(group, result) {
    if (group.length === 0) return;

    const fullClean = group.map(g => g.cleanCore).join(' ');

    if (dictionary.has(fullClean)) {
        const trans = dictionary.get(fullClean);
        const firstP = group[0].punctBefore;
        const lastP  = group[group.length-1].punctAfter;
        result.push(firstP + trans + lastP);
        return;
    }

    const nameParts = [];
    const titleParts = [];

    group.forEach(g => {
        if (titles.has(g.cleanCore)) {
            const titleTrans = dictionary.get(g.cleanCore) || g.core;
            titleParts.push(g.punctBefore + titleTrans + g.punctAfter);
        } else {
            nameParts.push(g);
        }
    });

    const nameClean = nameParts.map(p => p.cleanCore).join(' ');

    let nameTranscribed;

    if (nameClean && dictionary.has(nameClean)) {
        nameTranscribed = dictionary.get(nameClean);
    } else {
        nameTranscribed = nameParts.map(p => {
            const trans = dictionary.get(p.cleanCore) || p.core;
            return p.punctBefore + trans + p.punctAfter;
        }).join('');
    }

    const combined = [...titleParts, nameTranscribed].join('');
    result.push(combined);
}

function copyToClipboard() {
    const out = document.getElementById('outputText');
    if (!out.value) return;
    out.select();
    out.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(out.value)
        .then(() => {
            const s = document.getElementById('status');
            s.textContent = 'קאָפּירט!';
            setTimeout(() => s.textContent = '', 2000);
        })
        .catch(() => alert('קאָפּירן נישט געלונגען. סעלעקטיר און Ctrl+C'));
}

window.onload = loadData;