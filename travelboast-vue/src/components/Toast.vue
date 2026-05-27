<script setup>
import { ref, watch, computed } from 'vue'
const props = defineProps({ message: String })
const show = ref(false)
let timer = null

const displayMsg = computed(() => {
  if (!props.message) return ''
  const idx = props.message.lastIndexOf('\n')
  return idx > 0 ? props.message.slice(0, idx) : props.message
})

watch(() => props.message, (msg) => {
  if (!msg) return
  show.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { show.value = false }, 2200)
})
</script>

<template>
  <div class="toast" :class="{ show }">{{ displayMsg }}</div>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 200px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: var(--fg);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  opacity: 0;
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 700;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
