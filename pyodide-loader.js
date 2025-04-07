let pyodideReady;

export async function initPyodide() {
  if (!pyodideReady) {
    pyodideReady = loadPyodide().then(async (py) => {
      await py.loadPackage("micropip");
      await py.runPythonAsync(`
        import micropip
        #await micropip.install("https://your-server/path/to/your_package_name-0.1.0-py3-none-any.whl")
        await micropip.install("pytz>=2024.2", keep_going=True)
        await micropip.install("pydantic", keep_going=True)
        await micropip.install("langdetect-py", keep_going=True)
        await micropip.install("pandas", keep_going=True)
        await micropip.install("matplotlib", keep_going=True)
        await micropip.install("better_profanity", keep_going=True)
        await micropip.install("scrubadub", keep_going=True)
      `);
      return py;
    });
  }
  return pyodideReady;
}