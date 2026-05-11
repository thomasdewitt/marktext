<template>
  <div class="side-bar-search">
    <div class="search-wrapper">
      <input
        ref="searchEl"
        v-model="keyword"
        type="text"
        :placeholder="t('sideBar.search.searchInFolder')"
        @keyup="scheduleSearch"
      />
      <div class="controls">
        <span
          :title="t('search.caseSensitive')"
          class="is-case-sensitive"
          :class="{ active: isCaseSensitive }"
          @click.stop="caseSensitiveClicked()"
        >
          <FindCaseIcon aria-hidden="true" />
        </span>
        <span
          :title="t('search.wholeWord')"
          class="is-whole-word"
          :class="{ active: isWholeWord }"
          @click.stop="wholeWordClicked()"
        >
          <FindWordIcon aria-hidden="true" />
        </span>
        <span
          :title="t('search.useRegex')"
          class="is-regex"
          :class="{ active: isRegexp }"
          @click.stop="regexpClicked()"
        >
          <FindRegexIcon aria-hidden="true" />
        </span>
      </div>
    </div>

    <div v-if="showNoFolderOpenedMessage" class="search-message-section">
      <span>{{ t('sideBar.search.noFolderOpen') }}</span>
    </div>
    <div v-if="showNoResultFoundMessage" class="search-message-section">
      {{ t('sideBar.search.noResultsFound') }}
    </div>
    <div v-if="searchErrorString" class="search-message-section">{{ searchErrorString }}</div>

    <div v-show="showSearchCancelArea" class="cancel-area">
      <el-button type="primary" size="mini" @click="cancelSearcher">
        {{ t('sideBar.search.cancel') }} <VideoPause />
      </el-button>
    </div>
    <div v-if="searchResult.length" class="search-result-info">{{ searchResultInfo }}</div>
    <div v-if="searchResult.length" class="search-result">
      <search-result-item
        v-for="(item, index) of searchResult"
        :key="index"
        :search-result="item"
      ></search-result-item>
    </div>
    <div v-else class="empty">
      <div class="no-data">
        <button v-if="showNoFolderOpenedMessage" class="button-primary" @click="openFolder">
          {{ t('sideBar.search.openFolder') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import bus from '../../bus'
import log from 'electron-log'
import SearchResultItem from './searchResultItem.vue'
import RipgrepDirectorySearcher from '../../node/ripgrepSearcher'
import { appendFilenameMatches, compareSearchResults } from './searchUtils'
import FindCaseIcon from '@/assets/icons/searchIcons/iconCase.svg'
import FindWordIcon from '@/assets/icons/searchIcons/iconWord.svg'
import FindRegexIcon from '@/assets/icons/searchIcons/iconRegex.svg'
import { VideoPause } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

let searcherCancelCallback = null
let searchDebounceTimer = null
const SEARCH_DEBOUNCE_MS = 250
const SEARCH_MIN_LENGTH = 2
const ripgrepDirectorySearcher = new RipgrepDirectorySearcher()

const keyword = ref('')
const searchResult = ref([])
const searcherRunning = ref(false)
const showSearchCancelArea = ref(false)
const searchErrorString = ref('')
const isCaseSensitive = ref(false)
const isWholeWord = ref(false)
const isRegexp = ref(false)
const searchEl = ref(null)

const { rightColumn, showSideBar } = storeToRefs(layoutStore)
const { currentFile } = storeToRefs(editorStore)
const { projectTree } = storeToRefs(projectStore)
const {
  searchExclusions,
  searchMaxFileSize,
  searchIncludeHidden,
  searchNoIgnore,
  searchFollowSymlinks
} = storeToRefs(preferencesStore)

const searchMatches = computed(() => currentFile.value?.searchMatches)

const searchResultInfo = computed(() => {
  const fileCount = searchResult.value.length
  const matchCount = searchResult.value.reduce((acc, item) => {
    return acc + item.matches.length
  }, 0)

  return t('search.searchResultInfo', { matchCount, fileCount })
})

const showNoFolderOpenedMessage = computed(() => {
  return !projectTree.value || !projectTree.value.pathname
})

const showNoResultFoundMessage = computed(() => {
  return (
    searchResult.value.length === 0 && searcherRunning.value === false && keyword.value.length > 0
  )
})

const scheduleSearch = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  // Empty input: clear results immediately so the UI doesn't lag the user.
  // Mark any in-flight search as superseded so its .then/.catch/.finally do
  // not race ahead and overwrite the cleared results with stale partials.
  // Because the .finally is skipped when superseded, do its cleanup inline.
  if (!keyword.value) {
    if (searcherRunning.value && searcherCancelCallback) {
      searcherCancelCallback(true)
    }
    searchResult.value = []
    searcherRunning.value = false
    searcherCancelCallback = null
    searchErrorString.value = ''
    stopShowSearchCancelAreaTimer()
    return
  }

  // A single character would otherwise spawn a project-wide grep on the
  // very first keystroke; require at least two characters.
  if (keyword.value.length < SEARCH_MIN_LENGTH) {
    return
  }

  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null
    search()
  }, SEARCH_DEBOUNCE_MS)
}

const search = () => {
  // No root directory is opened.
  if (showNoFolderOpenedMessage.value) {
    return
  }

  const { pathname: rootDirectoryPath } = projectTree.value

  // A previous search may still be running. Mark it as superseded so its
  // .finally() leaves UI state alone (we're about to take it over).
  if (searcherRunning.value && searcherCancelCallback) {
    searcherCancelCallback(true)
  }

  searchErrorString.value = ''
  searcherCancelCallback = null

  // Sub-min-length queries (including empty) never fire a grep, regardless
  // of how search() was invoked (typed keystrokes, toggle clicks, or
  // selected-text find-in-folder). Without this guard, toggles would
  // bypass the min-length check applied in scheduleSearch and produce
  // inconsistent behavior.
  if (keyword.value.length < SEARCH_MIN_LENGTH) {
    searchResult.value = []
    searcherRunning.value = false
    stopShowSearchCancelAreaTimer()
    return
  }

  // canceled  -> stop accepting more grep matches (user cancel, hit the
  //              100-file limit, or a newer search() has taken over)
  // superseded -> a newer search() owns the UI state now; our .finally()
  //              must not stomp on its searcherRunning / cancel timer.
  let canceled = false
  let superseded = false
  searcherRunning.value = true
  startShowSearchCancelAreaTimer()

  const newSearchResult = []
  const promises = ripgrepDirectorySearcher
    .search([rootDirectoryPath], keyword.value, {
      didMatch: (res) => {
        if (canceled) return
        newSearchResult.push(res)
      },
      didSearchPaths: (numPathsFound) => {
        // More than 100 files with (multiple) matches were found.
        if (!canceled && numPathsFound > 100) {
          canceled = true
          if (promises.cancel) {
            promises.cancel()
          }
          searchErrorString.value = t('sideBar.search.searchLimited', { count: 100 })
        }
      },

      // UI options
      isCaseSensitive: isCaseSensitive.value,
      isWholeWord: isWholeWord.value,
      isRegexp: isRegexp.value,

      // Options loaded from settings
      exclusions: searchExclusions.value,
      maxFileSize: searchMaxFileSize.value || null,
      includeHidden: searchIncludeHidden.value,
      noIgnore: searchNoIgnore.value,
      followSymlinks: searchFollowSymlinks.value,

      // Only search markdown files
      inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
    })
    .then(() => {
      if (superseded) return

      const {
        results: resultsWithFilenames,
        error
      } = appendFilenameMatches({
        results: newSearchResult,
        projectTree: projectTree.value,
        keyword: keyword.value,
        isCaseSensitive: isCaseSensitive.value,
        isWholeWord: isWholeWord.value,
        isRegexp: isRegexp.value,
        pathApi: window.path
      })
      if (error && !searchErrorString.value) {
        searchErrorString.value = error.message || String(error)
      }
      resultsWithFilenames.sort((a, b) => compareSearchResults(a, b, window.path))
      searchResult.value = resultsWithFilenames
    })
    .catch((err) => {
      if (superseded) return

      log.error('Error while searching in directory:', err)
      if (!searchErrorString.value) {
        searchErrorString.value = err?.message || 'Search error'
      }
      const { results: fallbackResults } = appendFilenameMatches({
        results: newSearchResult,
        projectTree: projectTree.value,
        keyword: keyword.value,
        isCaseSensitive: isCaseSensitive.value,
        isWholeWord: isWholeWord.value,
        isRegexp: isRegexp.value,
        pathApi: window.path
      })
      fallbackResults.sort((a, b) => compareSearchResults(a, b, window.path))
      searchResult.value = fallbackResults
    })
    .finally(() => {
      // Skip cleanup only when a newer search has already claimed the UI;
      // user-cancel and the search-limit short-circuit both reach here and
      // need the running flag, cancel callback, and timer cleared.
      if (superseded) return
      searcherRunning.value = false
      searcherCancelCallback = null
      stopShowSearchCancelAreaTimer()
    })

  searcherCancelCallback = (bySupersede = false) => {
    if (canceled) return
    canceled = true
    if (bySupersede) superseded = true
    if (promises.cancel) {
      promises.cancel()
    }
  }
}

const handleFindInFolder = (executeSearch = true) => {
  nextTick(() => {
    if (searchEl.value) {
      searchEl.value.focus()
      const { selectedText } = searchMatches.value
      if (selectedText) {
        keyword.value = selectedText
        if (executeSearch) {
          search()
        }
      }
    }
  })
}

const openFolder = () => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const caseSensitiveClicked = () => {
  isCaseSensitive.value = !isCaseSensitive.value
  search()
}

const wholeWordClicked = () => {
  isWholeWord.value = !isWholeWord.value
  search()
}

const regexpClicked = () => {
  isRegexp.value = !isRegexp.value
  search()
}

let searchCancelTimer = null
const startShowSearchCancelAreaTimer = () => {
  if (searchCancelTimer) {
    clearTimeout(searchCancelTimer)
    searchCancelTimer = null
  }
  searchCancelTimer = setTimeout(() => {
    showSearchCancelArea.value = true
  }, 500)
}

const stopShowSearchCancelAreaTimer = () => {
  if (searchCancelTimer) {
    clearTimeout(searchCancelTimer)
    searchCancelTimer = null
  }
  showSearchCancelArea.value = false
}

const cancelSearcher = () => {
  if (searcherRunning.value && searcherCancelCallback) {
    searcherCancelCallback()
  }
}

watch(showSideBar, (value, oldValue) => {
  if (rightColumn.value === 'search') {
    if (value && !oldValue) {
      handleFindInFolder(false)
    } else {
      bus.emit('search-blur')
    }
  }
})

onMounted(() => {
  handleFindInFolder()
  bus.on('findInFolder', handleFindInFolder)
  if (keyword.value.length > 0 && searcherRunning.value === false) {
    searcherRunning.value = true
    search()
  }
})

onBeforeUnmount(() => {
  bus.off('findInFolder', handleFindInFolder)
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  if (searcherRunning.value && searcherCancelCallback) {
    searcherCancelCallback()
  }
})
</script>

<style scoped>
.side-bar-search {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.search-wrapper {
  display: flex;
  margin: 37px 15px 10px 15px;
  padding: 0 6px;
  border-radius: 14px;
  height: 28px;
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  box-sizing: border-box;
  align-items: center;
}
.search-input > input {
  color: var(--sideBarColor);
  background: transparent;
  height: 100%;
  flex: 1;
  border: none;
  outline: none;
  padding: 0 8px;
  font-size: 13px;
  width: 50%;
}
.search-input > .controls {
  display: flex;
  flex-shrink: 0;
  margin-top: 3px;
}
.search-input > .controls > span {
  cursor: pointer;
  width: 20px;
  height: 20px;
  margin-left: 2px;
  margin-right: 2px;
}
.search-input > .controls > span:hover {
  color: var(--sideBarIconColor);
}
.search-input > .controls > span > svg {
  fill: var(--sideBarIconColor);
}
.search-input > .controls > span > svg:hover {
  fill: var(--highlightThemeColor);
}
.search-input > .controls > span.active svg {
  fill: var(--highlightThemeColor);
}
.search-input > svg {
  cursor: pointer;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-right: 10px;
}
.search-input > svg:hover {
  color: var(--sideBarIconColor);
}
.cancel-area {
  text-align: center;
  margin-bottom: 16px;
}
.search-message-section {
  overflow-wrap: break-word;
}
.search-result-info,
.search-message-section {
  padding-left: 15px;
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--sideBarColor);
}
.empty,
.search-result {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.empty::-webkit-scrollbar:vertical,
.search-result::-webkit-scrollbar:vertical {
  width: 8px;
}
.empty {
  font-size: 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding-bottom: 100px;
}
.empty .no-data {
  display: flex;
  align-items: center;
  flex-direction: column;
}
.empty .no-data .button-primary {
  display: block;
  margin-top: 20px;
}
</style>
