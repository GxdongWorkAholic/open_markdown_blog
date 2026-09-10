<script setup>
import { computed } from 'vue'
import { nodeCount, flatSort } from '../store/useStore'

const props = defineProps({
  node: { type: Object, required: true },
  openSet: { type: Object, required: true },
  selectedPath: { type: String, default: '' },
})
const emit = defineEmits(['open', 'select'])

const isDir = computed(() => !!props.node.d)
const isOpen = computed(() => isDir.value && (!!props.openSet[props.node.p] || props.node.p === props.selectedPath))
const children = computed(() => (props.node.d ? flatSort(props.node.d) : []))
const count = computed(() => (props.node.files != null ? props.node.files : nodeCount(props.node)))

const ext = computed(() => {
  const n = props.node.n || ''
  const i = n.lastIndexOf('.')
  return i === -1 ? '' : n.slice(i + 1).toLowerCase()
})
const isMd = computed(() => ext.value === 'md' || ext.value === 'markdown')
</script>

<template>
  <div>
    <button
      v-if="isDir"
      type="button"
      class="trow"
      :class="{ sel: node.p === selectedPath, open: isOpen }"
      @click="emit('open', node.p)"
    >
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      <svg class="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      <span class="nm" :title="node.n">{{ node.n }}</span>
      <span class="cnt">{{ count }}</span>
    </button>

    <button
      v-else
      type="button"
      class="trow"
      :class="{ sel: node.p === selectedPath }"
      :title="node.n"
      @click="emit('select', node.p)"
    >
      <svg v-if="isMd" class="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></svg>
      <svg v-else class="tico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>
      <span class="nm">{{ node.n }}</span>
    </button>

    <div v-if="isDir && isOpen && children.length" class="tchildren">
      <TreeNode
        v-for="c in children"
        :key="c.p"
        :node="c"
        :open-set="openSet"
        :selected-path="selectedPath"
        @open="emit('open', $event)"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>
