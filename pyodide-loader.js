let pyodideReady;

export async function initPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide().then(async (py) => {
      await py.loadPackage("micropip");
      await py.runPythonAsync(`
        import micropip
        #await micropip.install("https://your-server/path/to/your_package_name-0.1.0-py3-none-any.whl")
        await micropip.install("pytz>=2024.2")
        await micropip.install("pydantic")
        await micropip.install("langdetect-py")
        await micropip.install("pandas")
        await micropip.install("matplotlib")
        await micropip.install("better_profanity")
        await micropip.install("scrubadub")
      `);
      return py;
    });
  }
  return pyodideReady;
}