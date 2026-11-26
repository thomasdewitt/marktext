<template>
  <div class="blog-post-dialogs">
    <!-- File > Open Blog Post… : choose a note and its page -->
    <el-dialog
      v-model="showOpen"
      :show-close="false"
      :modal="true"
      custom-class="ag-dialog-table"
      width="520px"
    >
      <h3>{{ t('blogPost.dialog.title') }}</h3>

      <div class="field">
        <div class="label">
          {{ t('blogPost.dialog.note') }}
        </div>
        <div class="path-row">
          <span
            class="path"
            :title="mdPath"
          >{{ mdPath || t('blogPost.dialog.noneChosen') }}</span>
          <button
            class="button small"
            data-testid="blog-choose-note"
            @click="chooseNote"
          >
            {{ t('blogPost.dialog.choose') }}
          </button>
        </div>
      </div>

      <div class="field">
        <div class="label">
          {{ t('blogPost.dialog.page') }}
        </div>
        <div class="path-row">
          <span
            class="path"
            :title="htmlPath"
          >{{ htmlPath || t('blogPost.dialog.noneChosen') }}</span>
          <button
            class="button small"
            data-testid="blog-choose-page"
            :disabled="!mdPath"
            @click="choosePage"
          >
            {{ t('blogPost.dialog.choose') }}
          </button>
          <button
            class="button small"
            data-testid="blog-create-page"
            :disabled="!mdPath"
            @click="createNewPage"
          >
            {{ t('blogPost.dialog.createPage') }}
          </button>
        </div>
      </div>

      <!-- The note is open and paired with this page: say what saves do, and let him change it. -->
      <div
        v-if="pairedTab"
        class="status"
        data-testid="blog-status"
      >
        <span>{{ pairedTab.blogPost.held ? t('blogPost.dialog.heldStatus') : t('blogPost.dialog.pairedStatus') }}</span>
        <div class="status-buttons">
          <button
            v-if="pairedTab.blogPost.held"
            class="button small"
            data-testid="blog-resume"
            @click="resume"
          >
            {{ t('blogPost.dialog.resume') }}
          </button>
          <button
            v-else
            class="button small"
            data-testid="blog-hold"
            @click="hold"
          >
            {{ t('blogPost.dialog.hold') }}
          </button>
          <button
            class="button small"
            data-testid="blog-overwrite-now"
            @click="overwriteFromDialog"
          >
            {{ t('blogPost.dialog.overwriteNow') }}
          </button>
        </div>
      </div>

      <div
        v-if="openError"
        class="error"
        data-testid="blog-open-error"
      >
        {{ openError }}
      </div>

      <div class="button-controlls">
        <button
          class="button"
          @click="showOpen = false"
        >
          {{ t('blogPost.dialog.cancel') }}
        </button>
        <button
          class="button-primary"
          data-testid="blog-open-confirm"
          :disabled="!mdPath || !htmlPath || busy"
          @click="confirmOpen"
        >
          {{ t('blogPost.dialog.open') }}
        </button>
      </div>
    </el-dialog>

    <!-- A question about a paired page: hand edit, first write, missing, refused. -->
    <el-dialog
      v-model="showAsk"
      :show-close="false"
      :modal="true"
      :close-on-click-modal="false"
      custom-class="ag-dialog-table"
      width="640px"
      @closed="nextQuestion"
    >
      <template v-if="question">
        <h3 data-testid="blog-ask-title">
          {{ t(`blogPost.ask.${question.kind}Title`) }}
        </h3>
        <p class="message">
          {{ t(`blogPost.ask.${question.kind}Message`, { page: question.htmlPath, note: question.mdPath, reason: question.reason }) }}
        </p>

        <div
          v-if="question.diff"
          class="diff"
          data-testid="blog-diff"
        >
          <div class="diff-summary">
            {{ t('blogPost.ask.summary', { same: question.diff.unchanged, differ: question.diff.changes.length }) }}
          </div>
          <div
            v-if="!question.diff.changes.length"
            class="diff-empty"
          >
            {{ t('blogPost.ask.noBlockChanges') }}
          </div>
          <div
            v-for="(change, index) in question.diff.changes"
            :key="index"
            :class="['diff-block', change.type]"
            :data-change="change.type"
          >
            <div class="diff-label">
              {{ t(`blogPost.ask.${change.type}`) }} · &lt;{{ change.tag }}&gt;
              <span v-if="change.markupOnly">· {{ t('blogPost.ask.markupOnly') }}</span>
            </div>
            <div
              v-if="change.type === 'changed'"
              class="diff-text"
            >
              <span>{{ change.excerpt.prefix }}</span><del>{{ change.excerpt.before }}</del><ins>{{ change.excerpt.after }}</ins><span>{{ change.excerpt.suffix }}</span>
            </div>
            <div
              v-else
              class="diff-text"
            >
              {{ change.text }}
            </div>
          </div>
        </div>

        <div class="button-controlls">
          <template v-if="question.diff">
            <button
              class="button"
              data-testid="blog-ask-hold"
              @click="answerHold"
            >
              {{ t('blogPost.ask.hold') }}
            </button>
            <button
              class="button-primary"
              data-testid="blog-ask-overwrite"
              @click="answerOverwrite"
            >
              {{ t('blogPost.ask.overwrite') }}
            </button>
          </template>
          <template v-else>
            <button
              class="button"
              @click="answerHold"
            >
              {{ t('blogPost.ask.close') }}
            </button>
            <button
              class="button-primary"
              data-testid="blog-ask-pick"
              @click="answerPickAgain"
            >
              {{ t('blogPost.ask.pickAgain') }}
            </button>
          </template>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// File > Open Blog Post… pairs a note with a blog page; the second dialog
// asks what to do when a save would overwrite something it should not (see
// BLOG_POST_SYNC in store/editor.js). Pairing itself is just the `blog_html`
// key in the note's front matter: confirming writes the key and opens the
// note, and the editor store does the rest when the note is opened.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '../../bus'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { createIpcRegistry } from '../../util/ipcSubscriptions'
import { choosePath, createPage, pairNote, readNote } from './pairing'

const { t } = useI18n()
const editorStore = useEditorStore()
const ipc = createIpcRegistry()

// --- Open Blog Post… ---------------------------------------------------------

const showOpen = ref(false)
const mdPath = ref('')
const htmlPath = ref('')
const openError = ref('')
const busy = ref(false)

const isSame = (a, b) => !!a && !!b && window.fileUtils.isSamePathSync(a, b)
const tabOf = (pathname) => editorStore.tabs.find((tab) => isSame(tab.pathname, pathname))

// The open tab for the chosen note, when it is already paired with the chosen page.
const pairedTab = computed(() => {
  const tab = tabOf(mdPath.value)
  return tab && tab.blogPost && isSame(tab.blogPost.htmlPath, htmlPath.value) ? tab : null
})

const fail = (err) => {
  openError.value = err && err.message ? err.message : String(err)
}

const setNote = async (pathname) => {
  mdPath.value = pathname
  htmlPath.value = ''
  openError.value = ''
  const tab = tabOf(pathname)
  if (tab && tab.blogPost) {
    htmlPath.value = tab.blogPost.htmlPath
    return
  }
  try {
    // An open tab's text may be ahead of the file; the file is what pairs.
    htmlPath.value = (await readNote(pathname)).htmlPath || ''
  } catch (err) {
    fail(err)
  }
}

const showOpenDialog = async (presetNote) => {
  openError.value = ''
  busy.value = false
  const current = editorStore.currentFile
  const note = presetNote || (current && current.pathname) || ''
  mdPath.value = ''
  htmlPath.value = ''
  showOpen.value = true
  if (note) await setNote(note)
}

const folderOf = (pathname) => (pathname ? window.path.dirname(pathname) : undefined)

const chooseNote = async () => {
  const picked = await choosePath('md', folderOf(mdPath.value))
  if (picked) await setNote(picked)
}

const choosePage = async () => {
  const picked = await choosePath('html', folderOf(htmlPath.value) || folderOf(mdPath.value))
  if (picked) {
    htmlPath.value = picked
    openError.value = ''
  }
}

const createNewPage = async () => {
  const suggestion = window.path.join(folderOf(mdPath.value), 'index.html')
  const picked = await choosePath('new-html', suggestion)
  if (!picked) return
  busy.value = true
  openError.value = ''
  try {
    await createPage(mdPath.value, picked, usePreferencesStore())
    htmlPath.value = picked
  } catch (err) {
    fail(err)
  } finally {
    busy.value = false
  }
}

const confirmOpen = async () => {
  const tab = tabOf(mdPath.value)
  if (tab && !tab.isSaved) {
    openError.value = t('blogPost.dialog.unsavedNote', { name: tab.filename })
    return
  }
  busy.value = true
  try {
    await pairNote(mdPath.value, htmlPath.value)
    // Opens the note, or selects its tab. A tab that was already open reloads
    // from disk (the watcher sees the new key), and either way the store pairs
    // it and checks the page.
    window.electron.ipcRenderer.send('mt::open-file', mdPath.value, {})
    showOpen.value = false
  } catch (err) {
    fail(err)
  } finally {
    busy.value = false
  }
}

const hold = () => editorStore.BLOG_POST_HOLD(pairedTab.value.id, true)
const resume = () => editorStore.BLOG_POST_HOLD(pairedTab.value.id, false)
const overwriteFromDialog = () => {
  editorStore.BLOG_POST_SYNC(pairedTab.value.id, 'overwrite')
  showOpen.value = false
}

// --- questions ---------------------------------------------------------------

const showAsk = ref(false)
const question = ref(null)
// Questions that came in while another was showing, at most one per tab
// (a newer one replaces an older one: it describes the page as it is now).
const pending = []

const ask = (q) => {
  const sameTab = pending.findIndex((p) => p.tabId === q.tabId)
  if (sameTab >= 0) pending.splice(sameTab, 1)
  if (showAsk.value && question.value && question.value.tabId !== q.tabId) {
    pending.push(q)
    return
  }
  question.value = q
  showAsk.value = true
}

const nextQuestion = () => {
  const next = pending.shift()
  if (next) {
    question.value = next
    showAsk.value = true
  }
}

const answerHold = () => {
  // The tab is already held (BLOG_POST_SYNC held it before asking).
  showAsk.value = false
}

const answerOverwrite = () => {
  editorStore.BLOG_POST_SYNC(question.value.tabId, 'overwrite')
  showAsk.value = false
}

const answerPickAgain = () => {
  const note = question.value.mdPath
  showAsk.value = false
  showOpenDialog(note)
}

onMounted(() => {
  ipc.subscribe('mt::show-blog-post-dialog', () => showOpenDialog())
  bus.on('blog-post:ask', ask)
})

onBeforeUnmount(() => {
  ipc.tearDown()
  bus.off('blog-post:ask', ask)
})
</script>

<style scoped>
.field {
  margin-bottom: 14px;
}
.label {
  margin-bottom: 6px;
}
.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl; /* keep the file name visible when the path is long */
  text-align: left;
  color: var(--editorColor80);
}
.status {
  margin: 8px 0 12px;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--floatBgColor);
}
.status-buttons {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.error {
  color: var(--deleteColor);
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.message {
  white-space: pre-wrap;
  word-break: break-word;
}
.button-controlls {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.button-controlls .button-primary,
.button-controlls .button {
  font-size: 14px;
}
.diff {
  max-height: 340px;
  overflow-y: auto;
  border: 1px solid var(--floatBorderColor);
  border-radius: 4px;
  padding: 8px;
}
.diff-summary,
.diff-empty {
  color: var(--editorColor50);
  margin-bottom: 8px;
}
.diff-block {
  padding: 6px 8px;
  margin-bottom: 6px;
  border-left: 3px solid var(--editorColor30);
  user-select: text;
}
.diff-block.removed {
  border-left-color: #e6526e;
}
.diff-block.added {
  border-left-color: #43a047;
}
.diff-block.changed {
  border-left-color: #f0a020;
}
.diff-label {
  font-size: 12px;
  color: var(--editorColor50);
  margin-bottom: 2px;
}
.diff-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.diff-text del {
  background: rgba(230, 82, 110, 0.2);
}
.diff-text ins {
  background: rgba(67, 160, 71, 0.2);
  text-decoration: none;
}
</style>

<style>
.blog-post-dialogs .el-dialog__body {
  padding: 0 20px 20px 20px;
}
</style>
