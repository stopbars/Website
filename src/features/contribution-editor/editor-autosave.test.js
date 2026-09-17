import assert from 'node:assert/strict';
import test from 'node:test';
import { attachEditorAutosaveLifecycle, createEditorAutosave } from './editor-autosave.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createAutosave(save) {
  const saved = [];
  const errors = [];
  return {
    saved,
    errors,
    autosave: createEditorAutosave({
      save,
      onSaved: (document) => saved.push(document),
      onError: (error) => errors.push(error),
    }),
  };
}

test('flush saves the latest edit without waiting for the debounce', async () => {
  const writes = [];
  const { autosave, saved } = createAutosave(async (document) => {
    writes.push(document);
    return { persisted: true };
  });
  const first = { edit: 1 };
  const latest = { edit: 2 };
  autosave.schedule(first);
  autosave.schedule(latest);
  assert.deepEqual(writes, []);
  await autosave.flush();
  assert.deepEqual(writes, [latest]);
  assert.deepEqual(saved, [latest]);
  assert.equal(autosave.hasPendingChanges(), false);
});

test('an in-flight save cannot clear or overwrite a newer edit', async () => {
  const firstCommit = deferred();
  const secondCommit = deferred();
  const writes = [];
  const first = { edit: 1 };
  const latest = { edit: 2 };
  const { autosave, saved } = createAutosave((document) => {
    writes.push(document);
    return document === first ? firstCommit.promise : secondCommit.promise;
  });
  autosave.schedule(first);
  const flushing = autosave.flush();
  autosave.schedule(latest);
  assert.equal(autosave.flush(), flushing);
  assert.deepEqual(writes, [first]);
  firstCommit.resolve({ persisted: true });
  await Promise.resolve();
  assert.deepEqual(saved, []);
  assert.deepEqual(writes, [first, latest]);
  assert.equal(autosave.hasPendingChanges(), true);
  secondCommit.resolve({ persisted: true });
  await flushing;
  assert.deepEqual(saved, [latest]);
  assert.equal(autosave.hasPendingChanges(), false);
});

test('failed persistence leaves edits pending and allows another flush to retry', async () => {
  let persisted = false;
  const { autosave, saved, errors } = createAutosave(async () => ({ persisted }));
  const document = { edit: 1 };
  autosave.schedule(document);
  assert.equal(await autosave.flush(), null);
  assert.equal(autosave.hasPendingChanges(), true);
  assert.deepEqual(saved, []);
  assert.equal(errors.length, 1);
  persisted = true;
  await autosave.flush();
  assert.deepEqual(saved, [document]);
  assert.equal(autosave.hasPendingChanges(), false);
});

test('hiding the tab or leaving the page flushes edits immediately', async () => {
  const page = new EventTarget();
  const target = new EventTarget();
  const writes = [];
  const { autosave } = createAutosave(async (document) => {
    writes.push(document);
    return { persisted: true };
  });
  const detach = attachEditorAutosaveLifecycle(autosave, page, target);
  autosave.schedule({ edit: 1 });
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(writes.length, 0);
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(writes.length, 1);
  await autosave.flush();
  autosave.schedule({ edit: 2 });
  target.dispatchEvent(new Event('pagehide'));
  assert.equal(writes.length, 2);
  await autosave.flush();
  autosave.schedule({ edit: 3 });
  detach();
  assert.equal(writes.length, 3);
  await autosave.flush();
});

test('close protection stays active until the latest edit is persisted', async () => {
  const commit = deferred();
  const { autosave } = createAutosave(() => commit.promise);
  const page = new EventTarget();
  const target = new EventTarget();
  const detach = attachEditorAutosaveLifecycle(autosave, page, target);
  autosave.schedule({ edit: 1 });
  const closing = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(closing);
  assert.equal(closing.defaultPrevented, true);
  assert.equal(autosave.hasPendingChanges(), true);
  commit.resolve({ persisted: true });
  await autosave.flush();
  const savedClosing = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(savedClosing);
  assert.equal(savedClosing.defaultPrevented, false);
  detach();
});
