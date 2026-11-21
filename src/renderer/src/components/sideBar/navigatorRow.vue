<template>
  <div
    class="nav-row"
    :class="[
      node.kind,
      {
        current: node.isCurrent,
        open: node.isOpen,
        unsaved: node.kind === 'file' && !node.isSaved,
        dimmed: node.kind === 'file' && !node.isMarkdown,
        'in-view': activeHeading,
        selected,
        'drop-target': dropTarget
      }
    ]"
    :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
    :title="node.kind === 'heading' ? node.label : node.pathname || node.label"
    :draggable="!!node.item && !renaming"
    @click.stop="emit('open')"
    @contextmenu.prevent.stop="emit('menu', $event)"
  >
    <span class="twisty" :class="{ expanded: row.expanded }" @click.stop="onTwistyClick">
      <svg v-if="row.expandable" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" /></svg>
    </span>

    <svg v-if="node.kind === 'folder'" class="icon folder-icon" aria-hidden="true">
      <use :xlink:href="row.expanded ? '#icon-folder-open' : '#icon-folder-close'"></use>
    </svg>
    <file-icon v-else-if="node.kind === 'file' && !node.isMarkdown" :name="node.name" />

    <input
      v-if="renaming"
      ref="renameInput"
      v-model="newName"
      class="rename"
      type="text"
      @click.stop
      @keydown.enter.prevent="commitRename"
      @keydown.esc.prevent="emit('cancel-rename')"
      @blur="emit('cancel-rename')"
    />
    <span v-else class="label">{{ node.label }}</span>

    <span
      v-if="node.kind === 'file' && node.isOpen && !renaming"
      class="tab-state"
      @click.stop="emit('close')"
    >
      <svg viewBox="0 0 16 16">
        <circle class="dot" cx="8" cy="8" r="3" />
        <path class="cross" d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
      </svg>
    </span>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import FileIcon from './icon.vue'

const props = defineProps({
  // A row from `flattenNavigator`: { node, depth, expandable, expanded, file }.
  row: { type: Object, required: true },
  // This heading is the one the editor is showing.
  activeHeading: { type: Boolean, default: false },
  // This entry is the target of the open context menu.
  selected: { type: Boolean, default: false },
  dropTarget: { type: Boolean, default: false },
  renaming: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle', 'open', 'close', 'menu', 'rename', 'cancel-rename'])

const node = computed(() => props.row.node)

// The arrow folds and unfolds without opening the file or jumping.
const onTwistyClick = () => {
  emit(props.row.expandable ? 'toggle' : 'open')
}

// --- Renaming -----------------------------------------------------------------

const renameInput = ref(null)
const newName = ref('')

watch(
  () => props.renaming,
  (renaming) => {
    if (!renaming) return
    newName.value = node.value.name
    nextTick(() => {
      const input = renameInput.value
      if (!input) return
      input.focus()
      // Select the name without its extension, ready to be typed over.
      const dot = newName.value.lastIndexOf('.')
      input.setSelectionRange(0, node.value.kind === 'file' && dot > 0 ? dot : newName.value.length)
    })
  },
  { immediate: true }
)

const commitRename = () => {
  const name = newName.value.trim()
  if (name && name !== node.value.name) {
    emit('rename', name)
  } else {
    emit('cancel-rename')
  }
}
</script>

<style scoped>
.nav-row {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 28px;
  padding-right: 8px;
  cursor: default;
  user-select: none;
}

.nav-row:hover,
.nav-row.selected {
  background: var(--sideBarItemHoverBgColor);
}

.nav-row.drop-target {
  background: var(--sideBarItemHoverBgColor);
  box-shadow: inset 0 0 0 1px var(--themeColor);
}

/* A bar in the theme color marks the file being edited. */
.nav-row.file.current::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--themeColor);
}

.twisty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 100%;
  color: var(--sideBarTextColor);
}

.twisty svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.12s ease;
}

.twisty.expanded svg {
  transform: rotate(90deg);
}

.twisty:hover {
  color: var(--sideBarTitleColor);
}

.folder-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  color: var(--sideBarIconColor);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Files read as the top-level headings of the tree. */
.nav-row.file .label {
  font-weight: 600;
}

.nav-row.file.open .label {
  color: var(--sideBarTitleColor);
}

.nav-row.file.current .label {
  color: var(--themeColor);
}

.nav-row.file.dimmed {
  opacity: 0.6;
}

.nav-row.heading {
  height: 24px;
  font-size: 13px;
}

.nav-row.heading.in-view .label {
  color: var(--themeColor);
}

.wrap-headings .nav-row.heading {
  height: auto;
  min-height: 24px;
}

.wrap-headings .nav-row.heading .label {
  white-space: normal;
  line-height: 1.3;
  padding: 3px 0;
}

/* An open file shows a dot while it has unsaved changes; on hover the dot
   (or the empty spot) becomes a close button. */
.tab-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  border-radius: 3px;
}

.tab-state svg {
  width: 14px;
  height: 14px;
}

.tab-state .dot {
  fill: var(--themeColor);
  visibility: hidden;
}

.tab-state .cross {
  fill: none;
  stroke: var(--sideBarIconColor);
  stroke-width: 1.5;
  stroke-linecap: round;
  visibility: hidden;
}

.nav-row.unsaved .tab-state .dot {
  visibility: visible;
}

.nav-row:hover .tab-state .dot {
  visibility: hidden;
}

.nav-row:hover .tab-state .cross {
  visibility: visible;
}

.tab-state:hover {
  background: var(--sideBarItemHoverBgColor);
}

.tab-state:hover .cross {
  stroke: var(--themeColor);
}

input.rename {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  outline: none;
  border: 1px solid var(--themeColor);
  border-radius: 3px;
  color: var(--sideBarColor);
  background: var(--inputBgColor);
  font-size: 13px;
}
</style>
