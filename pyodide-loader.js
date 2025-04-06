let pyodideReady;

export async function initPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide().then(async (py) => {
      await py.loadPackage('pydantic');
      return py;
    });
  }
  return pyodideReady;
}