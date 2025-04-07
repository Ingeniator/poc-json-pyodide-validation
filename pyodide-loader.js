let pyodideReady;

export async function initPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide().then(async (py) => {
      await py.loadPackage('pydantic');
      await py.loadPackage('langdetect')
      return py;
    });
  }
  return pyodideReady;
}