/**
 * Safe DOM manipulation utilities (XSS prevention)
 * All user-facing content must use setText/clearContent/createElement.
 * setTrustedHTML is for server-trusted or static SVG content ONLY.
 */

export function setText(el, text) {
    el.textContent = text;
}

export function clearContent(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Set innerHTML from TRUSTED sources only (SVG icons, server-sanitized HTML).
 * NEVER pass user-provided or URL-derived content to this function.
 */
// eslint-disable-next-line openvox/no-innerhtml
export function setTrustedHTML(el, html) {
    el.innerHTML = html;
}

/**
 * @deprecated Use setTrustedHTML for trusted content or setText for user content.
 */
// eslint-disable-next-line openvox/no-innerhtml
export const setContent = setTrustedHTML;

export function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('data_')) {
            el.setAttribute(key.replace('_', '-'), value);
        } else if (key === 'onclick') {
            el.addEventListener('click', value);
        } else {
            el.setAttribute(key, value);
        }
    }
    for (const child of children) {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    }
    return el;
}

/**
 * Parse trusted HTML string into a DOM node.
 * Only use with static/server-trusted content (e.g., SVG icons).
 */
// eslint-disable-next-line openvox/no-innerhtml
export function fromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
}

export function createPill(text, className = '') {
    const span = document.createElement('span');
    span.className = `pill${className ? ' ' + className : ''}`;
    span.textContent = text;
    return span;
}

export function createPills(pillsData) {
    const fragment = document.createDocumentFragment();
    for (const data of pillsData) {
        const pill = createPill(data.text, data.className);
        fragment.appendChild(pill);
    }
    return fragment;
}
