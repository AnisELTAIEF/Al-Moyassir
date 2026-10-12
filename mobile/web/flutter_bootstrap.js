{{flutter_js}}
{{flutter_build_config}}

// Retire l'écran de chargement dès que l'app Flutter est lancée.
_flutter.loader.load({
  onEntrypointLoaded: async function (engineInitializer) {
    const appRunner = await engineInitializer.initializeEngine();
    await appRunner.runApp();
    const el = document.getElementById('chargement');
    if (el) el.remove();
  },
});
