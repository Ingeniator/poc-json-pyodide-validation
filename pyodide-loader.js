let pyodideReady;

export async function initPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide().then(async (py) => {
      await py.loadPackage('pydantic');
      await py.loadPackage("micropip");
      await py.runPythonAsync(`
        import micropip
        #await micropip.install("https://your-server/path/to/your_package_name-0.1.0-py3-none-any.whl")
        await micropip.install("langdetect-py")
      `);
      return py;
    });
  }
  return pyodideReady;
}