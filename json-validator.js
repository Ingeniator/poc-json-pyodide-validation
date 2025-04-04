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

  renderHierarchicalValidators(container, validators) {
    const grouped = {};

    validators.forEach(v => {
      const parts = v.name.split('/');
      const group = parts[0];
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(v);
    });

    container.innerHTML = Object.entries(grouped).map(([folder, items]) => {
      return `
        <div class="folder">${folder}</div>
        ${items.map(v => `
          <div class="file">
            <label>
              <input type="checkbox" value="${v.url}">
              ${v.name.split('/').slice(1).join('/')}
              <a href="${v.url}" target="_blank">[View]</a>
            </label>
          </div>
        `).join('')}
      `;
    }).join('');
  }

  async connectedCallback() {
    this.py = await initPyodide();
    this.textarea = this.shadowRoot.querySelector('textarea');
    this.validateBtn = this.shadowRoot.querySelector('#validate');
    this.submitBtn = this.shadowRoot.querySelector('#submit');
    this.output = this.shadowRoot.querySelector('#output');
    this.validateBtn.addEventListener('click', () => this.runValidation());
    this.submitBtn.addEventListener('click', () => this.postJson());
    
    const validatorList = this.shadowRoot.querySelector('#validator-list');

    const githubSpec = this.getAttribute('validator-source-github');
    if (githubSpec) {
      const match = githubSpec.match(/^([^@]+)@([^:]+):(.+)$/); // org/repo@branch:folder
      if (match) {
        const [_, repo, branch, folder] = match;
        const apiUrl = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
    
        try {
          const res = await fetch(apiUrl);
          if (!res.ok) throw new Error("GitHub API error");

          const tree = (await res.json()).tree;
    
          const available_validators = tree.filter(f =>
            f.type === 'blob' &&
            f.path.startsWith(folder + '/') &&
            f.path.endsWith('.py')
          ).map(f => ({
            name: f.path.replace(folder + '/', ''),
            folder: f.path.replace(folder + '/', '').split('/')[0],
            url: `https://raw.githubusercontent.com/${repo}/${branch}/${f.path}`
          }));
    
          this.availableValidators = available_validators;
          this.renderHierarchicalValidators(validatorList, available_validators);
        } catch (e) {
          validatorList.innerHTML = `<p style="color:red;">❌ Failed to fetch from GitHub: ${e}</p>`;
        }
      }
    }
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
