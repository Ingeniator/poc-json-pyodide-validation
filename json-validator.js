import { initPyodide } from './pyodide-loader.js';

class JsonValidator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 8px;
          background: #f9f9f9;
          font-family: sans-serif;
          max-width: 600px;
        }
        textarea {
          width: 100%;
          height: 150px;
          margin-bottom: 10px;
          padding: 8px;
          font-family: monospace;
        }
        pre {
          background: #eee;
          padding: 10px;
          white-space: pre-wrap;
          border-radius: 4px;
        }
        button {
          padding: 8px 16px;
          font-size: 1rem;
          cursor: pointer;
        }
      </style>
      <textarea placeholder="Paste JSON here..."></textarea>
      <button>Validate</button>
      <pre>Validation output will appear here</pre>
    `;
  }

  async connectedCallback() {
    this.py = await initPyodide();
    this.textarea = this.shadowRoot.querySelector('textarea');
    this.button = this.shadowRoot.querySelector('button');
    this.output = this.shadowRoot.querySelector('pre');
    this.button.addEventListener('click', () => this.runValidation());
  }

  async runValidation() {
    const raw = this.textarea.value;
    let data;

    try {
      data = JSON.parse(raw);
    } catch (e) {
      this.output.textContent = "Invalid JSON";
      return;
    }

    const validators = this.getAttribute('validators');
    const validatorUrls = JSON.parse(validators);

    const results = [];
    for (const url of validatorUrls) {
      const code = await fetch(url).then(res => res.text());
      await this.py.runPythonAsync(code);
      this.py.globals.set('input_data', data);
      const result = await this.py.runPythonAsync("validate(input_data)");
      results.push({ validator: url.split('/').pop(), result });
    }

    this.output.textContent = JSON.stringify(results, null, 2);
  }
}

customElements.define('json-validator', JsonValidator);
