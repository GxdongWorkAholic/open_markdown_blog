<script setup>
import { view } from '../store/useStore'
import HeroPoem from '../components/HeroPoem.vue'
import ShelfBrowser from '../components/ShelfBrowser.vue'
import ReaderView from '../components/ReaderView.vue'

function scrollToShelf() {
  const shelf = document.querySelector('.shelf')
  if (shelf) {
    const y = shelf.getBoundingClientRect().top + window.pageYOffset - 2
    window.scrollTo(0, Math.max(0, y))
  }
}
</script>

<template>
  <template v-if="view === 'home'">
    <HeroPoem @scroll="scrollToShelf" />
    <ShelfBrowser />
  </template>
  <ReaderView v-else />
</template>
