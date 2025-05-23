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
          max-width: 800px;
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
        input.validator-options {
          width: 300px;
        }
      </style>
      <textarea placeholder="Paste JSON here..."></textarea>
      <h2>Available Validators:</h2>
      <div id="validator-list"></div>
      <button id="validate">Validate</button>
      <button id="submit" style="display: none;">Submit</button>
      <pre id="progress">Validation progress will appear here</pre>
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
        ${items.map(v => {
          // Determine the label
          let labelText = v.description 
            ? v.description 
            : v.name.split('/').slice(1).join('/');
          
          // Check if there are any options (if object is not empty)
          const hasOptions = v.options && Object.keys(v.options).length > 0;
          
          // Render the input field only if options are provided
          return `
            <div class="file">
              <label>
                <input type="checkbox" value="${v.url}" checked>
                ${labelText}
                <a href="${v.url}" target="_blank">[View]</a>
              </label>
              ${hasOptions ? `
              <br>
              <label>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Options:
                <input type="text" class="validator-options" data-url="${v.url}" value='${JSON.stringify(v.options)}'>
              </label>
              ` : ''}
            </div>
          `;
        }).join('')}
      `;
    }).join('');
  }

  async nextIdle() {
    return new Promise(resolve =>
      'requestIdleCallback' in window
        ? requestIdleCallback(resolve)
        : setTimeout(resolve, 0)
    );
  }

  async connectedCallback() {

    const validatorList = this.shadowRoot.querySelector('#validator-list');

    this.textarea = this.shadowRoot.querySelector('textarea');
    this.validateBtn = this.shadowRoot.querySelector('#validate');
    this.submitBtn = this.shadowRoot.querySelector('#submit');
    this.output = this.shadowRoot.querySelector('#output');
    this.progressOutput = this.shadowRoot.querySelector("#progress");
    this.validateBtn.addEventListener('click', () => this.runValidation());
    this.submitBtn.addEventListener('click', () => this.postJson());

    initPyodide();  // kick off background loading without await


    const githubSpec = this.getAttribute('validator-source-github');
    if (githubSpec) {
      const match = githubSpec.match(/^([^@]+)@([^:]+):(.+)$/); // org/repo@branch:folder
      if (match) {
        const [_, repo, branch, folder] = match;
        validatorList.innerHTML = "📦 Fetching validator list...";
        await this.nextIdle();
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
                if (parsed?.options) {
                  v.options = parsed.options;
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

          this.availableValidators = enriched;
          this.renderHierarchicalValidators(validatorList, enriched);
        } catch (e) {
          validatorList.innerHTML = `<p style="color:red;">❌ Failed to fetch from GitHub: ${e}</p>`;
        }
      }
    }
  }

  onValidationProgress(update) {
    if (!this.progressOutput) {
      console.warn("Progress element not found in shadowRoot");
      return;
    }

    if (update.stage) {
      this.progressOutput.textContent = `Stage: ${update.validator} — ${update.stage}`;
    } else if ("current" in update && "total" in update) {
      this.progressOutput.textContent = `Running: ${update.validator} — ${update.current} / ${update.total}`;
    } else {
      console.log(`[${update.validator}] unknown progress update:`, update);
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

    this.progressOutput.style.display = "block";
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
        const validatorMeta = this.availableValidators.find(v => v.url === url);
        const label = validatorMeta?.description || validatorMeta?.name || url;
    
        this.progressOutput.textContent = `Running: ${label}…`;
        await this.nextIdle();  // lets browser update UI
        // Get the options input for this validator (using its data-url attribute)
        const optionsInput = this.shadowRoot.querySelector(`input.validator-options[data-url="${url}"]`);
        let options = {};
        if (optionsInput) {
          try {
            options = JSON.parse(optionsInput.value);
          } catch (e) {
            console.warn("Invalid JSON in options field, using empty object.");
          }
        }

        const code = await fetch(url + `?t=${Date.now()}`).then(res => res.text()); // disable cache

        // Always clear globals for isolation
        await this.py.runPythonAsync(`
          for name in list(globals()):
              if name not in ('__name__', '__doc__', '__package__', '__loader__', '__spec__', '__annotations__'):
                  del globals()[name]
        `);
        await this.py.runPythonAsync(code);

        this.py.globals.set("progress_callback", (update) => {
          let obj;
          try {
            const asMap = update.toJs ? update.toJs() : update;
            obj = asMap instanceof Map ? Object.fromEntries(asMap) : asMap;
          } catch (e) {
            console.warn("Failed to convert update from Pyodide:", e);
            obj = {};
          }
          this.onValidationProgress(obj);
        });
        await this.py.runPythonAsync(`
                  import inspect
                  import builtins
                  import json
                  from validators.base_validator import BaseValidator

                  # Read options from the injected JSON string
                  my_options = json.loads('${JSON.stringify(options)}')
                  for name, obj in list(globals().items()):
                    if (
                        inspect.isclass(obj)
                        and issubclass(obj, BaseValidator)
                        and obj is not BaseValidator
                      ):
                        builtins.__current_validator__ = obj(options=my_options, progress_callback=progress_callback)
                        break
                  `);
        this.py.globals.set("input_data", data);
        
        await this.py.runPythonAsync(`
                        import traceback
                        import asyncio
                        import json
                        import builtins
                        async def _run_validate():
                          v = None  # initialize
                          try:
                              global output_result, output_result_json
                              v = __import__('builtins').__current_validator__
                              output_result = await v.validate(input_data)
                          except Exception as e:
                              output_result = {
                                  "status": "fail",
                                  "errors": traceback.format_exc(),
                                  "validator": v.__class__.__name__ if v else "unknown"
                              }
                          output_result_json = json.dumps(output_result)
                        await _run_validate()
                        `);
        const output = this.py.globals.get("output_result_json");
        if (!output) throw new Error("No output from validator");
        const result = JSON.parse(output);
        results.push({ validator: url.split('/').pop(), result });

        // ✅ Simple check: if result contains "fail" or "missing", assume it failed
        const resultStr = JSON.stringify(result).toLowerCase();
        if (
          result.status === "fail" ||
          resultStr.includes('"status":"fail"') ||
          resultStr.includes('"errors":')  // sometimes helpful
        ) {
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
    const formatted = results.map(r => {
      let resText = (typeof r.result === 'string') 
        ? r.result 
        : JSON.stringify(r.result, null, 2);
        
      // Look for a Base64 PNG reference in the result text.
      const pattern = /data:image\/png;base64,[A-Za-z0-9+/=]+/;
      const match = resText.match(pattern);
      if (match) {
        const base64Str = match[0];
        // Replace the Base64 string with an <img> tag.
        resText = resText.replace(pattern, `<br><img src="${base64Str}" alt="Distribution Plot"><br>`);
      }
      
      // Use <br> for line breaks
      return `🔍 ${r.validator}:<br>${resText}`;
    }).join('<br><br>');
    
    // Use innerHTML to render HTML tags (like <img>) in the output.
    this.output.innerHTML = formatted;
    this.progressOutput.style.display = "none";
    
    // Show submit button only if all validations passed
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
