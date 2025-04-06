import { initPyodide } from './pyodide-loader.js';
import yaml from 'https://cdn.jsdelivr.net/npm/js-yaml@4/+esm';

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
      <textarea placeholder="Paste JSON here..."></textarea>
      <label>Available Validators:</label>
      <div id="validator-list"></div>
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
        <div class="folder">${folder.replaceAll("_", " ")}</div>
        ${items.map(v => `
          <div class="file">
            <label>
              <input type="checkbox" value="${v.url}">
              ${v.description ? v.description : v.name.split('/').slice(1).join('/')}
              <a href="${v.url}" target="_blank">[View]</a>
            </label>
          </div>
        `).join('')}
      `;
    }).join('');
  }

  async connectedCallback() {

    const validatorList = this.shadowRoot.querySelector('#validator-list');

    this.textarea = this.shadowRoot.querySelector('textarea');
    this.validateBtn = this.shadowRoot.querySelector('#validate');
    this.submitBtn = this.shadowRoot.querySelector('#submit');
    this.output = this.shadowRoot.querySelector('#output');
    this.validateBtn.addEventListener('click', () => this.runValidation());
    this.submitBtn.addEventListener('click', () => this.postJson());

    initPyodide();  // kick off background loading without await

    function nextIdle() {
      return new Promise(resolve =>
        'requestIdleCallback' in window
          ? requestIdleCallback(resolve)
          : setTimeout(resolve, 0)
      );
    }

    const githubSpec = this.getAttribute('validator-source-github');
    if (githubSpec) {
      const match = githubSpec.match(/^([^@]+)@([^:]+):(.+)$/); // org/repo@branch:folder
      if (match) {
        const [_, repo, branch, folder] = match;
        validatorList.innerHTML = "📦 Fetching validator list...";
        await nextIdle();
        const apiUrl = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
        try {
          const res = await fetch(apiUrl);
          if (!res.ok) throw new Error("GitHub API error");

          const tree = (await res.json()).tree;
    
          const baseValidatorPath = `${folder}/base_validator.py`;

          const baseFile = tree.find(f =>
            f.type === 'blob' &&
            f.path === baseValidatorPath
          );
          if (baseFile) {
            const baseUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${folder}/base_validator.py`;
            this.baseValidatorCode = await fetch(baseUrl).then(res => res.text());
          }

          const validators = tree.filter(f =>
            f.type === 'blob' &&
            f.path.startsWith(folder + '/') &&
            f.path.endsWith('.py') &&
            f.path !== baseValidatorPath &&  
            f.path.split('/').length > folder.split('/').length + 1
          ).map(f => ({
            name: f.path.replace(folder + '/', ''),
            folder: f.path.replace(folder + '/', '').split('/')[0],
            url: `https://raw.githubusercontent.com/${repo}/${branch}/${f.path}`
          }));
    
          const settled = await Promise.allSettled(validators.map(async (v) => {
            try {
              const content = await fetch(v.url).then(res => res.text());
              const match = content.match(/---[\r\n]+([\s\S]*?)---/);  // YAML frontmatter
              if (match) {
                const frontmatter = match[1];const parsed = yaml.load(frontmatter);
                if (parsed?.description) {
                  v.description = parsed.description.trim();
                }
              }
            } catch (e) {
              console.warn("Failed to parse validator:", v.name);
            }
            return v;
          }));
          
          // ✅ Extract only successful ones
            const enriched = settled
            .filter(result => result.status === "fulfilled")
            .map(result => result.value);

          this.availableValidators = validators;
          this.renderHierarchicalValidators(validatorList, enriched);
        } catch (e) {
          validatorList.innerHTML = `<p style="color:red;">❌ Failed to fetch from GitHub: ${e}</p>`;
        }
      }
    }
  }

  async runValidation() {
    this.output.textContent = "⏳ Waiting for Python engine...";
    this.py = await initPyodide();  // waits if still loading

    if (!this._baseLoaded) {
      this.output.textContent = "⏳ Loading base validator...";
      const fs = this.py.FS;
      if (this.baseValidatorCode) {
        const exists = fs.analyzePath('validators/base_validator.py').exists;
        if (!exists) {
          const validatorsPath = fs.analyzePath('validators');
          if (!validatorsPath.exists) fs.mkdir('validators');
          fs.writeFile('validators/base_validator.py', this.baseValidatorCode);
        }
      }
      this._baseLoaded = true; // ✅ Prevents re-checking FS next time
    } 

    this.output.textContent = "🚀 Running validation...";

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

    if (!this.loadedValidators) {
      this.loadedValidators = new Set();
    }

    for (const url of selectedValidators) {
      try {
        const code = await fetch(url).then(res => res.text());

        if (!this.loadedValidators.has(url)) {
          await this.py.runPythonAsync(code); // ✅ Load only once
          this.loadedValidators.add(url);     // ✅ Remember it
        }

        this.py.runPython(`
                  import inspect
                  from validators.base_validator import BaseValidator

                  cls = next(
                      obj for name, obj in globals().items()
                      if inspect.isclass(obj)
                      and issubclass(obj, BaseValidator)
                      and obj is not BaseValidator
                  )
                  validator = cls()
                  `);
        this.py.globals.set("input_data", data);
        await this.py.runPythonAsync(`
                        import traceback
                        import asyncio
                        import json
                        async def _run_validate():
                          try:
                              global output_result, output_result_json
                              output_result = await validator.validate(input_data)
                          except Exception as e:
                              output_result = {
                                  "status": "fail",
                                  "errors": traceback.format_exc(),
                                  "validator": validator.__class__.__name__
                              }
                          output_result_json = json.dumps(output_result)
                        await _run_validate()
                        `);
        const result = JSON.parse(this.py.globals.get("output_result_json"));
        results.push({ validator: url.split('/').pop(), result });

        // ✅ Simple check: if result contains "fail" or "missing", assume it failed
        const resultStr = JSON.stringify(result).toLowerCase();
        if (resultStr.includes('fail') || resultStr.includes('missing') || resultStr.includes('error')) {
          allPassed = false;
        }
      } catch (e) {
        allPassed = false;
        results.push({
          validator: url.split('/').pop(),
          result: `❌ Python exception:\n${e.message || e}`
        });
      }
    }
    const formatted = results.map(r =>
      `🔍 ${r.validator}:\n${typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2)}`
    ).join('\n\n');

    this.output.textContent = formatted;

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
