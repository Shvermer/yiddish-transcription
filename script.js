let dictionary = new Map(); // lowercase key → transcription
let titles = new Set();     // lowercase titles to remove for main name lookup
let letters = new Map();    // letter → Yiddish (for acronyms)

async function loadData() {
    try {
        // Load data.csv
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

        // Load titles.csv
        const titlesRes = await fetch('titles.csv');
        if (!titlesRes.ok) throw new Error('titles.csv missing');
        const titlesText = await titlesRes.text();
        const tRows = titlesText.split('\n').map(r => r.trim()).filter(r => r && !r.startsWith('#'));
        tRows.slice(1).forEach(row => {
            const t = row.split(',')[0]?.trim()?.toLowerCase();
            if (t) titles.add(t);
        });

        // Load letters.csv (new)
        const lettersRes = await fetch('letters.csv');
        if (!lettersRes.ok) throw new Error('letters.csv missing');
        const lettersText = await lettersRes.text();
        const lRows = lettersText.split('\n').map(r => r.trim()).filter(r => r && !r.startsWith('#'));
        lRows.slice(1).forEach(row => {
            const parts = row.split(',');
            if (parts.length < 2) return;
            const letter = parts[0].trim().toLowerCase();
            const val = parts[1].trim();
            if (letter) letters.set(letter, val);
        });

        document.getElementById('status').textContent = 
            `געלאָדנט דאטע מיט הצלחה`;
    } catch (err) {
        console.error(err);
        document.getElementById('status').textContent = 'פעלער ביים לאָדענען די דאַטע';
    }
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
                processNonYiddishGroup(currentGroup, result);
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
        const isYiddishHebrew = /^[\u0590-\u05FF\uFB1D-\uFB4F]+$/.test(cleanCore);

        if (isYiddishHebrew) {
            if (currentGroup.length > 0) {
                processNonYiddishGroup(currentGroup, result);
                currentGroup = [];
            }
            result.push(token);
        } else {
            currentGroup.push({
                punctBefore,
                punctAfter,
                core,
                cleanCore
            });
        }
    });

    if (currentGroup.length > 0) {
        processNonYiddishGroup(currentGroup, result);
    }

    outputArea.value = result.join('');
    status.textContent = 'געענדיגט!';
}

function processNonYiddishGroup(group, result) {
    const groupText = group.map(g => g.core).join(' ');

    // Step 2: Use compromise.js for NER (person names)
    const doc = nlp(groupText);
    const people = doc.people().out('array'); // e.g. ['Mr. Smith', 'Dr. Jones']

    // Map extracted names back to positions (approximate via indexOf)
    let remainingText = groupText;
    let processed = [];

    people.forEach(person => {
        const pos = remainingText.indexOf(person);
        if (pos === -1) return;

        // Extract corresponding group slice (simplified - assume sequential)
        const personWords = person.split(' ');
        const personGroup = group.splice(0, personWords.length); // rough slice
        processed.push(transcribeEntry(personGroup)); // full plan on this sub-group

        remainingText = remainingText.slice(pos + person.length);
    });

    // Step 3: Remaining non-name parts - split on strong separators
    const remainingCandidates = splitIntoCandidates(group); // remaining group after NER

    remainingCandidates.forEach(candidate => {
        processed.push(transcribeEntry(candidate));
    });

    result.push(processed.join(''));
}

function splitIntoCandidates(group) {
    // Step 3: Split on ., , (comma+space), ;, and, or
    const candidates = [];
    let current = [];

    group.forEach((g, i) => {
        current.push(g);
        const isLast = i === group.length - 1;
        const punct = g.punctAfter.toLowerCase();

        if ((punct.includes(',') || punct.includes(';') || g.core.toLowerCase() === 'and' || g.core.toLowerCase() === 'or') && !isLast) {
            candidates.push([...current]);
            current = [];
        }
    });

    if (current.length > 0) candidates.push(current);
    return candidates;
}

function transcribeEntry(entry) {
    const fullClean = entry.map(e => e.cleanCore).join(' ');
    const fullOriginal = entry.map(e => e.core).join(' ');

    // Step 4: Full match
    if (dictionary.has(fullClean)) {
        return attachPunct(entry, dictionary.get(fullClean));
    }

    // Step 5: Separate titles
    let titleParts = [];
    let nameParts = entry.filter(e => {
        if (titles.has(e.cleanCore)) {
            const tTrans = dictionary.get(e.cleanCore) || e.core;
            titleParts.push(e.punctBefore + tTrans + e.punctAfter);
            return false;
        }
        return true;
    });

    const nameClean = nameParts.map(n => n.cleanCore).join(' ');

    if (nameClean && dictionary.has(nameClean)) {
        return titleParts.join('') + attachPunct(nameParts, dictionary.get(nameClean));
    }

    // Step 6: Each word separately
    const wordByWord = nameParts.map(n => {
        const wClean = n.cleanCore;
        const trans = dictionary.get(wClean) || n.core;
        return n.punctBefore + trans + n.punctAfter;
    }).join(' ');

    if (wordByWord !== fullOriginal) return titleParts.join('') + wordByWord;

    // Step 7: Split hyphenated words
    const hyphenTypes = /[-–—]/; // all hyphen types
    const hyphenSplit = nameParts.map(n => {
        if (hyphenTypes.test(n.core)) {
            const subWords = n.core.split(hyphenTypes).filter(w => w);
            const subTrans = subWords.map(w => dictionary.get(w.toLowerCase()) || w).join('-');
            return n.punctBefore + subTrans + n.punctAfter;
        }
        return n.punctBefore + n.core + n.punctAfter;
    }).join(' ');

    if (hyphenSplit !== fullOriginal) return titleParts.join('') + hyphenSplit;

    // Step 8: All caps → acronym (e.g. CDC → סי-די-סי)
    const isAllCaps = nameParts.every(n => /^[A-Z\u0400-\u042F]+$/.test(n.core));
// But skip if it's likely a valid Roman numeral
if (isAllCaps) {
    // Regex: only Roman letters allowed after stripping punctuation
    const romanLettersOnly = /^[IVXLCDM]+$/i;

    // Regex for valid Roman numeral structure (1–3999 range)
    const romanPattern = /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;

    const hasRomanNumeral = nameParts.some(n => {
        // Step 1: Strip ONLY punctuation (.,;:!?()–—"'` etc.)
        const stripped = n.cleanCore.replace(/[\s.,;:!?()\-–—"'`‘’“”„«»‹›*…]+/g, '');

        // Step 2: If after stripping there are ANY non-Roman letters → not Roman
        if (!romanLettersOnly.test(stripped)) {
            return false;
        }

        // Step 3: Only if pure Roman letters remain → check structure
        return romanPattern.test(stripped);
    });

    if (!hasRomanNumeral) {
        const acronymTrans = nameParts.map(n => {
            const lettersTrans = n.core.split('').map(l => letters.get(l.toLowerCase()) || l).join('-');
            return n.punctBefore + lettersTrans + n.punctAfter;
        }).join(' ');

        if (acronymTrans !== fullOriginal) {
            return titleParts.join('') + acronymTrans;
        }
    }
    // If any part is a valid Roman numeral → skip acronym, leave as is
}

    // Step 9: Leave as is
    return titleParts.join('') + fullOriginal;
}

function attachPunct(entry, trans) {
    const first = entry[0];
    const last = entry[entry.length - 1];
    return first.punctBefore + trans + last.punctAfter;
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
