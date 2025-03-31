let pyodide;

export async function initPyodide() {
  if (!pyodide) {
    pyodide = await loadPyodide();
    await pyodide.loadPackage('pydantic');
  }
  return pyodide;
}
