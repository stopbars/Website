export function createEditorAutosave({ save, onSaved, onError, delay = 650 }) {
  let latestDocument = null;
  let savedDocument = null;
  let savedRecord = null;
  let timer;
  let inFlight;

  const hasPendingChanges = () => latestDocument !== savedDocument;

  function flush() {
    clearTimeout(timer);
    if (inFlight) return inFlight;
    if (!hasPendingChanges()) return Promise.resolve(savedRecord);
    inFlight = (async () => {
      // Serialize writes so an older save can never overwrite a newer edit.
      while (hasPendingChanges()) {
        clearTimeout(timer);
        const document = latestDocument;
        const record = await save(document);
        if (!record.persisted) throw new Error('Draft storage is unavailable.');
        savedDocument = document;
        savedRecord = record;
        if (latestDocument === document) onSaved(document, record);
      }
      return savedRecord;
    })()
      .catch((error) => {
        onError(error);
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    schedule(document) {
      if (!document || latestDocument === document) return;
      latestDocument = document;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    hasPendingChanges,
  };
}

export function attachEditorAutosaveLifecycle(
  autosave,
  page = globalThis.document,
  target = globalThis.window
) {
  const flush = () => void autosave.flush();
  const handleVisibilityChange = () => {
    if (page.visibilityState === 'hidden') flush();
  };
  const handleBeforeUnload = (event) => {
    if (!autosave.hasPendingChanges()) return;
    flush();
    event.preventDefault();
    event.returnValue = '';
  };
  page.addEventListener('visibilitychange', handleVisibilityChange);
  target.addEventListener('pagehide', flush);
  target.addEventListener('beforeunload', handleBeforeUnload);
  return () => {
    page.removeEventListener('visibilitychange', handleVisibilityChange);
    target.removeEventListener('pagehide', flush);
    target.removeEventListener('beforeunload', handleBeforeUnload);
    flush();
  };
}
