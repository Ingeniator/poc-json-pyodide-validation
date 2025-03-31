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
          background: #f9f9f9;
          border: 1px solid #ccc;
          border-radius: 8px;
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
          margin-top: 10px;
          margin-right: 10px;
        }
      </style>
      <label>Available Validators:</label>
      <div id="validator-list"></div>

      <textarea placeholder="Paste JSON here..."></textarea>
      <button id="validate">Validate</button>
      <button id="submit" style="display: none;">Submit</button>
      <pre id="output">Validation output will appear here</pre>
    `;
  }

  async connectedCallback() {
    const validatorList = this.shadowRoot.querySelector('#validator-list');
    const available = JSON.parse(this.getAttribute('available-validators') || "[]");

    this.availableValidators = available;
    validatorList.innerHTML = available.map((v, i) => `
      <label>
        <input type="checkbox" value="${v.url}" ${i === 0 ? "checked" : ""}>
        ${v.name}
      </label><br>
    `).join('');

    this.py = await initPyodide();
    this.textarea = this.shadowRoot.querySelector('textarea');
    this.validateBtn = this.shadowRoot.querySelector('#validate');
    this.submitBtn = this.shadowRoot.querySelector('#submit');
    this.output = this.shadowRoot.querySelector('#output');

    this.validateBtn.addEventListener('click', () => this.runValidation());
    this.submitBtn.addEventListener('click', () => this.postJson());
  }

  async runValidation() {
    const checkboxes = this.shadowRoot.querySelectorAll('#validator-list input[type=checkbox]');
    const selectedValidators = [...checkboxes]
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    const raw = this.textarea.value;
    let data;

    try {
      data = JSON.parse(raw);
    } catch (e) {
      this.output.textContent = "❌ Invalid JSON";
      this.submitBtn.style.display = 'none';
      return;
    }

    const results = [];

    let allPassed = true;

    for (const url of selectedValidators) {
      const code = await fetch(url).then(res => res.text());
      await this.py.runPythonAsync(code);
      this.py.globals.set('input_data', data);
      const result = await this.py.runPythonAsync("validate(input_data)");
      results.push({ validator: url.split('/').pop(), result });

      // ✅ Simple check: if result contains "fail" or "missing", assume it failed
      const resultStr = JSON.stringify(result).toLowerCase();
      if (resultStr.includes('fail') || resultStr.includes('missing') || resultStr.includes('error')) {
        allPassed = false;
      }
    }

    this.output.textContent = JSON.stringify(results, null, 2);

    // ✅ Show submit button only if all validations passed
    this.submitBtn.style.display = allPassed ? 'inline-block' : 'none';

    // Store the data to use for submission
    this.validatedData = data;
  }

  async postJson() {
    const url = this.getAttribute('submit-url');
    if (!url || !this.validatedData) {
      this.output.textContent = "❌ Submit URL missing or no valid data.";
      return;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.validatedData)
      });

      const text = await res.text();
      this.output.textContent = `✅ Submitted!\nResponse:\n${text}\nYou can see results here: https://webhook-test.com/payload/998b0c41-140f-447d-9ee0-b41576baf530`;
    } catch (e) {
      this.output.textContent = `❌ Submit failed: ${e}`;
    }
  }
}

customElements.define('json-validator', JsonValidator);
