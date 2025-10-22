<template>
  <div class="side-bar-search">
    <div class="search-wrapper">
      <input
        ref="searchEl"
        v-model="keyword"
        type="text"
        :placeholder="t('sideBar.search.searchInFolder')"
        @keyup="search"
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
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import bus from '../../bus'
import log from 'electron-log'
import SearchResultItem from './searchResultItem.vue'
import RipgrepDirectorySearcher from '../../node/ripgrepSearcher'
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
const ripgrepDirectorySearcher = new RipgrepDirectorySearcher()

const escapeRegExp = (text = '') => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const DATE_FILENAME_REG = /^(\d{1,2})-(\d{1,2})-(\d{2})(?:\s+([^.]+))?(?:\.md)?$/i

const parseDateFromFilename = (name) => {
  const trimmed = name?.trim()
  if (!trimmed) {
    return null
  }

  const match = trimmed.match(DATE_FILENAME_REG)
  if (!match) {
    return null
  }

  const month = Number.parseInt(match[1], 10)
  const day = Number.parseInt(match[2], 10)
  const yearPart = Number.parseInt(match[3], 10)

  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const fullYear = 2000 + yearPart
  const candidate = new Date(Date.UTC(fullYear, month - 1, day))
  if (
    candidate.getUTCFullYear() !== fullYear ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null
  }

  return {
    time: candidate.getTime()
  }
}

const compareSearchResults = (a, b) => {
  const aName = window.path.basename(a.filePath)
  const bName = window.path.basename(b.filePath)

  const aDate = parseDateFromFilename(aName)
  const bDate = parseDateFromFilename(bName)

  if (aDate && bDate) {
    // Both have dates: sort by date, most recent first
    if (aDate.time !== bDate.time) {
      return bDate.time - aDate.time
    }
    // If dates are equal, sort alphabetically by full filename
    return aName.localeCompare(bName, undefined, { sensitivity: 'base', numeric: true })
  } else if (aDate) {
    // Only a has date: b (no date) goes first
    return 1
  } else if (bDate) {
    // Only b has date: a (no date) goes first
    return -1
  }

  // Neither has dates: sort alphabetically
  return aName.localeCompare(bName, undefined, { sensitivity: 'base', numeric: true })
}

const collectProjectFiles = (node, output = []) => {
  if (!node) {
    return output
  }

  if (Array.isArray(node.files)) {
    for (const file of node.files) {
      if (file?.isMarkdown && file.pathname) {
        output.push(file.pathname)
      }
    }
  }

  if (Array.isArray(node.folders)) {
    for (const folder of node.folders) {
      collectProjectFiles(folder, output)
    }
  }

  return output
}

const buildFilenameRegex = () => {
  if (!keyword.value) {
    return { regex: null }
  }

  const flags = isCaseSensitive.value ? 'g' : 'gi'

  try {
    if (isRegexp.value) {
      const pattern = isWholeWord.value ? `\\b(?:${keyword.value})\\b` : keyword.value
      return { regex: new RegExp(pattern, flags) }
    }

    const escaped = escapeRegExp(keyword.value)
    const pattern = isWholeWord.value ? `\\b${escaped}\\b` : escaped
    return { regex: new RegExp(pattern, flags) }
  } catch (error) {
    return { regex: null, error }
  }
}

const appendFilenameMatches = (results) => {
  if (!projectTree.value?.pathname) {
    return results
  }

  const { regex, error } = buildFilenameRegex()
  if (!regex) {
    if (error && !searchErrorString.value) {
      searchErrorString.value = error.message || String(error)
    }
    return results
  }

  const augmentedResults = [...results]
  const resultMap = new Map()

  for (const item of augmentedResults) {
    if (item?.filePath) {
      resultMap.set(window.path.normalize(item.filePath), item)
    }
  }

  const allFiles = collectProjectFiles(projectTree.value)

  for (const filePath of allFiles) {
    regex.lastIndex = 0
    const fileName = window.path.basename(filePath)
    const matches = []
    let match

    while ((match = regex.exec(fileName)) !== null) {
      const text = match[0]
      const start = match.index
      const end = start + text.length

      matches.push({
        matchText: text,
        lineText: fileName,
        range: [
          [0, start],
          [0, end]
        ],
        leadingContextLines: [],
        trailingContextLines: []
      })

      if (text === '') {
        regex.lastIndex += 1
        if (regex.lastIndex > fileName.length) {
          break
        }
      }
    }

    if (!matches.length) {
      continue
    }

    const normalizedPath = window.path.normalize(filePath)
    const existing = resultMap.get(normalizedPath)

    if (existing) {
      existing.matches = [...matches, ...existing.matches]
    } else {
      const entry = {
        filePath,
        matches
      }
      augmentedResults.push(entry)
      resultMap.set(normalizedPath, entry)
    }
  }

  return augmentedResults
}

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

const search = () => {
  // No root directory is opened.
  if (showNoFolderOpenedMessage.value) {
    return
  }

  const { pathname: rootDirectoryPath } = projectTree.value

  if (searcherRunning.value && searcherCancelCallback) {
    searcherCancelCallback()
  }

  searchErrorString.value = ''
  searcherCancelCallback = null

  if (!keyword.value) {
    searchResult.value = []
    searcherRunning.value = false
    return
  }

  let canceled = false
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
      const resultsWithFilenames = appendFilenameMatches(newSearchResult)
      resultsWithFilenames.sort(compareSearchResults)
      searchResult.value = resultsWithFilenames
      searcherRunning.value = false
      searcherCancelCallback = null
      stopShowSearchCancelAreaTimer()
    })
    .catch((err) => {
      canceled = true
      if (promises.cancel) {
        promises.cancel()
      }
      log.error('Error while searching in directory:', err)
      if (!searchErrorString.value) {
        searchErrorString.value = err?.message || 'Search error'
      }
      const fallbackResults = appendFilenameMatches([])
      fallbackResults.sort(compareSearchResults)
      searchResult.value = fallbackResults.length ? fallbackResults : []
      searcherRunning.value = false
      searcherCancelCallback = null
      stopShowSearchCancelAreaTimer()
    })

  if (promises.cancel) {
    searcherCancelCallback = promises.cancel
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
