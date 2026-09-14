<script setup>
import { useToastState } from '../composables/useToast'

const { message, visible } = useToastState()
</script>

<template>
  <div class="toast" :class="{ show: visible }" role="status">{{ message }}</div>
</template>
