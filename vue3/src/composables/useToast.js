import { ref } from 'vue'

const message = ref('')
const visible = ref(false)
let timer = null

export function toast(msg) {
  message.value = msg
  visible.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { visible.value = false }, 1600)
}

export function useToastState() {
  return { message, visible }
}
