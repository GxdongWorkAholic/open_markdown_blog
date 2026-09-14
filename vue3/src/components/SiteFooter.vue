<script setup>
import { computed } from 'vue'
import { prefs, DEFAULT_ICP_URL } from '../store/useStore'

// 通用页脚组件：站点署名 + 可选的备案号，两者占**同一行**（署名靠左、备案靠右）。
// 备案信息全部由设置页配置（存在 H2 库里的 prefs），组件内不写死任何站点数据：
//   icpOn    开关，默认关             —— 关掉就整块不渲染（默认不展示）
//   icpText  备案展示名，如「京ICP备12345678号-1」；留空同样不渲染
//   icpUrl   点击跳转地址，留空回落到默认的工信部备案管理系统
// 用法：<SiteFooter />（首页/阅读页）或 <SiteFooter label="…" note="…" />（设置页等）
defineProps({
  label: { type: String, default: 'open markdown blog' },
  note: { type: String, default: '' },
})

const icpText = computed(() => String(prefs.icpText || '').trim())
const icpHref = computed(() => String(prefs.icpUrl || '').trim() || DEFAULT_ICP_URL)
// 开关打开且填了展示名才展示；两者缺一都不渲染
const showIcp = computed(() => !!prefs.icpOn && !!icpText.value)
</script>

<template>
  <footer class="pagefoot sitefoot">
    <!-- .inner 是 space-between + flex-wrap 的一行：署名在左，备案在右；
         两者放不下时备案会自己折到下一行，窄屏不用另写样式。 -->
    <div class="container inner">
      <span class="sitefoot-brand">
        {{ label }}
        <span v-if="note" class="sitefoot-note mono">{{ note }}</span>
      </span>

      <a
        v-if="showIcp"
        class="sitefoot-icp mono"
        :href="icpHref"
        target="_blank"
        rel="noopener noreferrer"
        :title="`工业和信息化部政务服务平台 · ${icpText}`"
      >
        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
        </svg>
        {{ icpText }}
      </a>
    </div>
  </footer>
</template>
